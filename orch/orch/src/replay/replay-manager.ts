/**
 * Deterministic replay system for workflow execution
 * Enables reliable replay of workflow executions using recorded trajectory data
 */

import {
  WorkflowDefinition,
  Trajectory,
  ReplayInfo,
  ExecutionOutcome,
  ExecutionOptions,
  WorkflowContext,
  StepResult,
  ExternalDependency,
  ReplayInstruction,
  BudgetInfo
} from '../types/workflow-types.js';

export interface ReplayState {
  trajectory: Trajectory;
  replayInfo: ReplayInfo;
  options: ExecutionOptions;
  currentStepIndex: number;
  replayMode: 'exact' | 'adaptive' | 'mock';
  mockData: Map<string, any>;
  environmentSnapshot: Record<string, any>;
  randomSeed: number;
}

export interface ReplayValidationResult {
  isValid: boolean;
  issues: ReplayIssue[];
  warnings: string[];
  canProceed: boolean;
}

export interface ReplayIssue {
  type: 'missing_dependency' | 'version_mismatch' | 'checksum_mismatch' | 'environment_change';
  severity: 'warning' | 'error' | 'critical';
  message: string;
  details: Record<string, any>;
}

export class ReplayManager {
  private activeReplays: Map<string, ReplayState> = new Map();
  private dependencyCheckers: Map<string, DependencyChecker> = new Map();
  private mockProviders: Map<string, MockProvider> = new Map();

  constructor() {
    this.initializeDefaultCheckers();
    this.initializeDefaultMockProviders();
  }

  /**
   * Create replay information for a workflow
   */
  createReplayInfo(workflow: WorkflowDefinition): ReplayInfo {
    const environmentState = this.captureEnvironmentState();
    const dependencies = this.extractDependencies(workflow);
    
    return {
      version: '1.0.0',
      replayable: true,
      deterministicInputs: {},
      randomSeed: this.generateRandomSeed(),
      environmentState,
      externalDependencies: dependencies,
      replayInstructions: []
    };
  }

  /**
   * Validate if a trajectory can be replayed
   */
  async validateReplay(trajectory: Trajectory, replayInfo: ReplayInfo): Promise<ReplayValidationResult> {
    const issues: ReplayIssue[] = [];
    const warnings: string[] = [];

    // Check version compatibility
    if (replayInfo.version !== '1.0.0') {
      warnings.push(`Replay info version ${replayInfo.version} may not be fully compatible`);
    }

    // Validate external dependencies
    for (const dependency of replayInfo.externalDependencies) {
      const checker = this.dependencyCheckers.get(dependency.type);
      if (!checker) {
        issues.push({
          type: 'missing_dependency',
          severity: 'error',
          message: `No checker available for dependency type: ${dependency.type}`,
          details: { dependency }
        });
        continue;
      }

      const checkResult = await checker.validate(dependency);
      if (!checkResult.isValid) {
        issues.push({
          type: checkResult.issue,
          severity: checkResult.severity,
          message: checkResult.message,
          details: { dependency, checkResult }
        });
      }
    }

    // Check environment compatibility
    const currentEnv = this.captureEnvironmentState();
    const envDiff = this.compareEnvironments(replayInfo.environmentState, currentEnv);
    
    if (Object.keys(envDiff).length > 0) {
      warnings.push(`Environment differences detected: ${Object.keys(envDiff).join(', ')}`);
    }

    // Validate trajectory completeness
    if (!trajectory.steps || trajectory.steps.length === 0) {
      issues.push({
        type: 'missing_dependency',
        severity: 'critical',
        message: 'Trajectory contains no steps',
        details: { trajectory }
      });
    }

    const canProceed = issues.filter(i => i.severity === 'critical').length === 0;
    
    return {
      isValid: canProceed && issues.length === 0,
      issues,
      warnings,
      canProceed
    };
  }

  /**
   * Replay a workflow execution using recorded trajectory
   */
  async replay(
    trajectory: Trajectory,
    replayInfo: ReplayInfo,
    options: ExecutionOptions = {}
  ): Promise<ExecutionOutcome> {
    // Validate replay feasibility
    const validation = await this.validateReplay(trajectory, replayInfo);
    if (!validation.canProceed) {
      throw new Error(`Replay validation failed: ${validation.issues.map(i => i.message).join(', ')}`);
    }

    const replayId = this.generateReplayId();
    const startTime = new Date();

    // Initialize replay state
    const replayState: ReplayState = {
      trajectory,
      replayInfo,
      options,
      currentStepIndex: 0,
      replayMode: options.dryRun ? 'mock' : 'exact',
      mockData: new Map(),
      environmentSnapshot: { ...replayInfo.environmentState },
      randomSeed: replayInfo.randomSeed || this.generateRandomSeed()
    };

    this.activeReplays.set(replayId, replayState);

    try {
      // Prepare environment for replay
      await this.prepareReplayEnvironment(replayState);

      // Execute replay
      const outcome = await this.executeReplay(replayState);

      return {
        ...outcome,
        metadata: {
          ...outcome.metadata,
          replayId,
          originalExecutionId: trajectory.executionId,
          replayMode: replayState.replayMode,
          validationWarnings: validation.warnings
        }
      };
    } catch (error) {
      return this.createFailedReplayOutcome(trajectory, error as Error, startTime, replayId);
    } finally {
      this.activeReplays.delete(replayId);
    }
  }

  /**
   * Generate mock data for a step during replay
   */
  generateMockData(stepId: string, instruction: ReplayInstruction, originalResult: any): any {
    switch (instruction.instruction) {
      case 'use_recorded':
        return originalResult;
      case 'mock':
        return this.generateMockResult(stepId, originalResult);
      case 'skip':
        return { skipped: true, originalResult };
      case 'recalculate':
        return null; // Will be recalculated
      default:
        return originalResult;
    }
  }

  /**
   * Get replay status
   */
  getReplayStatus(replayId: string): ReplayState | null {
    return this.activeReplays.get(replayId) || null;
  }

  /**
   * Cancel active replay
   */
  cancelReplay(replayId: string, reason: string = 'User cancelled'): boolean {
    const replayState = this.activeReplays.get(replayId);
    if (!replayState) {
      return false;
    }

    // Mark as cancelled
    replayState.options = { ...replayState.options, cancelled: true, cancellationReason: reason };
    return true;
  }

  private async executeReplay(replayState: ReplayState): Promise<ExecutionOutcome> {
    const { trajectory, replayInfo } = replayState;
    const startTime = new Date();
    const stepResults: Record<string, StepResult> = {};
    let totalCost: BudgetInfo = { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 };

    // Create initial context from trajectory
    const context: WorkflowContext = trajectory.contextEvolution[0] || {
      variables: {},
      stepResults: {},
      metadata: {},
      currentBudget: totalCost,
      safetyState: {
        violations: [],
        activeConstraints: [],
        riskLevel: 'low',
        lastCheck: new Date()
      }
    };

    // Replay each step
    for (let i = 0; i < trajectory.steps.length; i++) {
      const trajectoryStep = trajectory.steps[i];
      replayState.currentStepIndex = i;

      // Check for cancellation
      if (replayState.options.cancelled) {
        break;
      }

      // Find replay instruction for this step
      const instruction = replayInfo.replayInstructions.find(ri => ri.stepId === trajectoryStep.stepId) || {
        stepId: trajectoryStep.stepId,
        instruction: 'use_recorded' as const
      };

      const stepResult = await this.replayStep(trajectoryStep, instruction, replayState, context);
      stepResults[trajectoryStep.stepId] = stepResult;

      // Update context and costs
      context.stepResults[trajectoryStep.stepId] = stepResult;
      if (stepResult.cost) {
        totalCost = this.addCosts(totalCost, stepResult.cost);
      }
      context.currentBudget = totalCost;

      // Update context with trajectory data if available
      if (trajectory.contextEvolution[i + 1]) {
        Object.assign(context, trajectory.contextEvolution[i + 1]);
      }
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    return {
      workflowId: trajectory.workflowId,
      executionId: `replay_${Date.now()}`,
      status: replayState.options.cancelled ? 'cancelled' : 'completed',
      startTime,
      endTime,
      duration,
      totalCost,
      stepResults,
      safetyViolations: [],
      hasViolations: false,
      violationFlags: {
        budgetExceeded: false,
        safetyViolated: false,
        timeoutReached: false,
        criticalError: false
      },
      finalContext: context,
      metadata: {
        replayMode: replayState.replayMode,
        originalDuration: trajectory.totalDuration,
        stepsReplayed: Object.keys(stepResults).length,
        mockDataUsed: replayState.mockData.size
      }
    };
  }

  private async replayStep(
    trajectoryStep: any,
    instruction: ReplayInstruction,
    replayState: ReplayState,
    context: WorkflowContext
  ): Promise<StepResult> {
    const startTime = new Date();

    try {
      switch (instruction.instruction) {
        case 'use_recorded':
          // Use the recorded result directly
          return {
            ...trajectoryStep.result,
            metadata: {
              ...trajectoryStep.result.metadata,
              replayed: true,
              replayInstruction: 'use_recorded'
            }
          };

        case 'mock':
          // Generate mock result
          const mockResult = this.generateMockResult(trajectoryStep.stepId, trajectoryStep.result);
          replayState.mockData.set(trajectoryStep.stepId, mockResult);
          
          return {
            stepId: trajectoryStep.stepId,
            status: 'completed',
            startTime,
            endTime: new Date(),
            result: mockResult,
            cost: trajectoryStep.costIncurred,
            metadata: {
              replayed: true,
              replayInstruction: 'mock',
              mockData: true
            }
          };

        case 'skip':
          // Skip execution
          return {
            stepId: trajectoryStep.stepId,
            status: 'skipped',
            startTime,
            endTime: new Date(),
            result: { skipped: true },
            cost: { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 },
            metadata: {
              replayed: true,
              replayInstruction: 'skip'
            }
          };

        case 'recalculate':
          // Re-execute the step (not truly deterministic)
          return await this.recalculateStep(trajectoryStep, replayState, context);

        default:
          throw new Error(`Unknown replay instruction: ${instruction.instruction}`);
      }
    } catch (error) {
      return {
        stepId: trajectoryStep.stepId,
        status: 'failed',
        startTime,
        endTime: new Date(),
        error: error as Error,
        cost: { tokens: 1, computeTime: 100, memory: 0, apiCalls: 0, monetaryCost: 0 },
        metadata: {
          replayed: true,
          replayError: (error as Error).message
        }
      };
    }
  }

  private async recalculateStep(
    trajectoryStep: any,
    replayState: ReplayState,
    context: WorkflowContext
  ): Promise<StepResult> {
    // This would require re-executing the original step logic
    // For now, return the recorded result with a flag
    return {
      ...trajectoryStep.result,
      metadata: {
        ...trajectoryStep.result.metadata,
        replayed: true,
        replayInstruction: 'recalculate',
        recalculated: true
      }
    };
  }

  private generateMockResult(stepId: string, originalResult: any): any {
    // Generate appropriate mock data based on the original result
    if (typeof originalResult === 'object' && originalResult !== null) {
      return {
        ...originalResult,
        mocked: true,
        mockTimestamp: new Date(),
        mockId: `mock_${stepId}_${Date.now()}`
      };
    }
    
    return {
      mocked: true,
      mockTimestamp: new Date(),
      mockId: `mock_${stepId}_${Date.now()}`,
      originalResult
    };
  }

  private async prepareReplayEnvironment(replayState: ReplayState): Promise<void> {
    // Set random seed for deterministic behavior
    if (replayState.replayInfo.randomSeed) {
      // In a real implementation, you'd seed the random number generator
      Math.random = this.createSeededRandom(replayState.randomSeed);
    }

    // Prepare mock data for dependencies
    for (const dependency of replayState.replayInfo.externalDependencies) {
      if (dependency.mockable) {
        const mockProvider = this.mockProviders.get(dependency.type);
        if (mockProvider) {
          const mockData = await mockProvider.createMock(dependency);
          replayState.mockData.set(dependency.identifier, mockData);
        }
      }
    }
  }

  private captureEnvironmentState(): Record<string, any> {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  private extractDependencies(workflow: WorkflowDefinition): ExternalDependency[] {
    const dependencies: ExternalDependency[] = [];
    
    // This would analyze the workflow to identify external dependencies
    // For now, return empty array
    
    return dependencies;
  }

  private compareEnvironments(env1: Record<string, any>, env2: Record<string, any>): Record<string, any> {
    const differences: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(env1)) {
      if (env2[key] !== value) {
        differences[key] = { original: value, current: env2[key] };
      }
    }
    
    for (const [key, value] of Object.entries(env2)) {
      if (!(key in env1)) {
        differences[key] = { original: undefined, current: value };
      }
    }
    
    return differences;
  }

  private addCosts(cost1: BudgetInfo, cost2: BudgetInfo): BudgetInfo {
    return {
      tokens: (cost1.tokens || 0) + (cost2.tokens || 0),
      computeTime: (cost1.computeTime || 0) + (cost2.computeTime || 0),
      memory: (cost1.memory || 0) + (cost2.memory || 0),
      apiCalls: (cost1.apiCalls || 0) + (cost2.apiCalls || 0),
      monetaryCost: (cost1.monetaryCost || 0) + (cost2.monetaryCost || 0)
    };
  }

  private createFailedReplayOutcome(
    trajectory: Trajectory,
    error: Error,
    startTime: Date,
    replayId: string
  ): ExecutionOutcome {
    const endTime = new Date();
    
    return {
      workflowId: trajectory.workflowId,
      executionId: replayId,
      status: 'failed',
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      totalCost: { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 },
      stepResults: {},
      safetyViolations: [],
      hasViolations: false,
      violationFlags: {
        budgetExceeded: false,
        safetyViolated: false,
        timeoutReached: false,
        criticalError: true
      },
      finalContext: {
        variables: {},
        stepResults: {},
        metadata: { replayError: error.message },
        currentBudget: { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 },
        safetyState: {
          violations: [],
          activeConstraints: [],
          riskLevel: 'critical',
          lastCheck: new Date()
        }
      },
      metadata: {
        replayId,
        replayFailed: true,
        error: error.message
      }
    };
  }

  private generateRandomSeed(): number {
    return Math.floor(Math.random() * 1000000);
  }

  private generateReplayId(): string {
    return `replay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createSeededRandom(seed: number): () => number {
    let state = seed;
    return function() {
      state = (state * 1664525 + 1013904223) % Math.pow(2, 32);
      return state / Math.pow(2, 32);
    };
  }

  private initializeDefaultCheckers(): void {
    this.dependencyCheckers.set('api', new ApiDependencyChecker());
    this.dependencyCheckers.set('file', new FileDependencyChecker());
    this.dependencyCheckers.set('database', new DatabaseDependencyChecker());
    this.dependencyCheckers.set('service', new ServiceDependencyChecker());
  }

  private initializeDefaultMockProviders(): void {
    this.mockProviders.set('api', new ApiMockProvider());
    this.mockProviders.set('file', new FileMockProvider());
    this.mockProviders.set('database', new DatabaseMockProvider());
    this.mockProviders.set('service', new ServiceMockProvider());
  }
}

// Supporting interfaces and implementations
interface DependencyChecker {
  validate(dependency: ExternalDependency): Promise<DependencyCheckResult>;
}

interface DependencyCheckResult {
  isValid: boolean;
  issue: ReplayIssue['type'];
  severity: ReplayIssue['severity'];
  message: string;
}

interface MockProvider {
  createMock(dependency: ExternalDependency): Promise<any>;
}

// Default dependency checkers
class ApiDependencyChecker implements DependencyChecker {
  async validate(dependency: ExternalDependency): Promise<DependencyCheckResult> {
    // Check if API endpoint is accessible
    try {
      const response = await fetch(dependency.identifier, { method: 'HEAD' });
      return {
        isValid: response.ok,
        issue: response.ok ? 'missing_dependency' : 'missing_dependency',
        severity: 'warning',
        message: response.ok ? 'API accessible' : `API not accessible: ${response.status}`
      };
    } catch (error) {
      return {
        isValid: false,
        issue: 'missing_dependency',
        severity: 'error',
        message: `API check failed: ${error.message}`
      };
    }
  }
}

class FileDependencyChecker implements DependencyChecker {
  async validate(dependency: ExternalDependency): Promise<DependencyCheckResult> {
    try {
      const fs = await import('fs/promises');
      await fs.access(dependency.identifier);
      
      if (dependency.checksum) {
        // Verify checksum if provided
        const crypto = await import('crypto');
        const content = await fs.readFile(dependency.identifier);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        
        if (hash !== dependency.checksum) {
          return {
            isValid: false,
            issue: 'checksum_mismatch',
            severity: 'error',
            message: `File checksum mismatch: expected ${dependency.checksum}, got ${hash}`
          };
        }
      }
      
      return {
        isValid: true,
        issue: 'missing_dependency',
        severity: 'warning',
        message: 'File accessible and checksum valid'
      };
    } catch (error) {
      return {
        isValid: false,
        issue: 'missing_dependency',
        severity: 'error',
        message: `File check failed: ${error.message}`
      };
    }
  }
}

class DatabaseDependencyChecker implements DependencyChecker {
  async validate(dependency: ExternalDependency): Promise<DependencyCheckResult> {
    // Database connectivity would be checked here
    return {
      isValid: false,
      issue: 'missing_dependency',
      severity: 'warning',
      message: 'Database dependency check not implemented'
    };
  }
}

class ServiceDependencyChecker implements DependencyChecker {
  async validate(dependency: ExternalDependency): Promise<DependencyCheckResult> {
    // Service availability would be checked here
    return {
      isValid: false,
      issue: 'missing_dependency',
      severity: 'warning',
      message: 'Service dependency check not implemented'
    };
  }
}

// Default mock providers
class ApiMockProvider implements MockProvider {
  async createMock(dependency: ExternalDependency): Promise<any> {
    return {
      mockType: 'api',
      identifier: dependency.identifier,
      data: { mocked: true, timestamp: new Date() }
    };
  }
}

class FileMockProvider implements MockProvider {
  async createMock(dependency: ExternalDependency): Promise<any> {
    return {
      mockType: 'file',
      identifier: dependency.identifier,
      content: 'mocked file content'
    };
  }
}

class DatabaseMockProvider implements MockProvider {
  async createMock(dependency: ExternalDependency): Promise<any> {
    return {
      mockType: 'database',
      identifier: dependency.identifier,
      queryResults: []
    };
  }
}

class ServiceMockProvider implements MockProvider {
  async createMock(dependency: ExternalDependency): Promise<any> {
    return {
      mockType: 'service',
      identifier: dependency.identifier,
      serviceResponse: { status: 'mocked' }
    };
  }
}