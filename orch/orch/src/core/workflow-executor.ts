/**
 * Core WorkflowExecutor implementation
 * Handles multi-step workflow execution with budget tracking, safety constraints, and replay
 */

import { EventEmitter } from 'events';
import {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
  StepResult,
  ExecutionOutcome,
  Trajectory,
  BudgetInfo,
  SafetyConstraint,
  SafetyViolation,
  ExecutionOptions,
  ReplayInfo,
  TrajectoryStep,
  DecisionPoint,
  ParallelBranch
} from '../types/workflow-types.js';
import { BudgetTracker } from './budget-tracker.js';
import { SafetyEnforcer } from '../safety/safety-enforcer.js';
import { StepExecutor } from '../execution/step-executor.js';
import { ReplayManager } from '../replay/replay-manager.js';
import { WorkflowLogger } from '../monitoring/workflow-logger.js';
import { ToolRegistry } from './tool-registry.js';
import { SafetyManager } from '../safety/managers/SafetyManager.js';

export class WorkflowExecutor extends EventEmitter {
  private budgetTracker: BudgetTracker;
  private safetyEnforcer: SafetyEnforcer;
  private stepExecutor: StepExecutor;
  private replayManager: ReplayManager;
  private logger: WorkflowLogger;
  private toolRegistry: ToolRegistry;
  private safetyManager: SafetyManager;
  private activeExecutions: Map<string, ExecutionState> = new Map();
  private planExecutionDepth: number = 0;
  private readonly MAX_PLAN_DEPTH = 5;

  constructor(safetyManager?: SafetyManager) {
    super();
    this.budgetTracker = new BudgetTracker();
    this.safetyEnforcer = new SafetyEnforcer();
    this.stepExecutor = new StepExecutor();
    this.replayManager = new ReplayManager();
    this.logger = new WorkflowLogger();
    this.toolRegistry = new ToolRegistry();
    this.safetyManager = safetyManager || this.createDefaultSafetyManager();

    this.setupEventHandlers();
  }

  /**
   * Execute a workflow with full budget tracking and safety enforcement
   */
  async execute(
    workflow: WorkflowDefinition,
    options: ExecutionOptions = {}
  ): Promise<ExecutionOutcome> {
    const executionId = this.generateExecutionId();
    const startTime = new Date();

    try {
      // Initialize execution state
      const executionState = await this.initializeExecution(
        executionId,
        workflow,
        options,
        startTime
      );

      this.activeExecutions.set(executionId, executionState);
      this.emit('executionStarted', { executionId, workflow, options });

      // Execute workflow steps
      const outcome = await this.executeWorkflowSteps(executionState);

      // Finalize execution
      await this.finalizeExecution(executionState, outcome);

      return outcome;
    } catch (error) {
      return this.handleExecutionError(executionId, workflow, error, startTime);
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Execute workflow in replay mode using recorded trajectory
   */
  async replay(
    trajectory: Trajectory,
    replayInfo: ReplayInfo,
    options: ExecutionOptions = {}
  ): Promise<ExecutionOutcome> {
    this.logger.info('Starting workflow replay', { 
      executionId: trajectory.executionId,
      workflowId: trajectory.workflowId 
    });

    return this.replayManager.replay(trajectory, replayInfo, options);
  }

  /**
   * Get current execution status
   */
  getExecutionStatus(executionId: string): ExecutionState | null {
    return this.activeExecutions.get(executionId) || null;
  }

  /**
   * Cancel active execution
   */
  async cancelExecution(executionId: string, reason: string = 'User cancelled'): Promise<boolean> {
    const executionState = this.activeExecutions.get(executionId);
    if (!executionState) {
      return false;
    }

    executionState.cancelled = true;
    executionState.cancellationReason = reason;

    this.emit('executionCancelled', { executionId, reason });
    return true;
  }

  private async initializeExecution(
    executionId: string,
    workflow: WorkflowDefinition,
    options: ExecutionOptions,
    startTime: Date
  ): Promise<ExecutionState> {
    // Initialize budget tracker
    const budgetLimit = options.budgetLimit || workflow.budgetLimit;
    if (budgetLimit) {
      this.budgetTracker.initialize(executionId, budgetLimit);
    }

    // Initialize safety enforcer
    const safetyConstraints = [
      ...(workflow.safetyConstraints || []),
      ...(options.customValidators || [])
    ];
    this.safetyEnforcer.initialize(executionId, safetyConstraints);

    // Initialize context
    const context: WorkflowContext = {
      variables: workflow.initialContext?.variables || {},
      stepResults: {},
      metadata: workflow.initialContext?.metadata || {},
      currentBudget: this.budgetTracker.getCurrentBudget(executionId),
      safetyState: this.safetyEnforcer.getCurrentState(executionId)
    };

    // Initialize trajectory if recording enabled
    const trajectory: Trajectory | null = options.recordTrajectory ? {
      executionId,
      workflowId: workflow.id,
      steps: [],
      totalDuration: 0,
      totalCost: { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 },
      contextEvolution: [{ ...context }],
      decisionPoints: [],
      parallelBranches: [],
      replayInfo: options.enableReplay ? this.replayManager.createReplayInfo(workflow) : null!
    } : null;

    return {
      executionId,
      workflow,
      options,
      startTime,
      context,
      trajectory,
      stepResults: new Map(),
      cancelled: false,
      currentStep: null
    };
  }

  private async executeWorkflowSteps(executionState: ExecutionState): Promise<ExecutionOutcome> {
    const { workflow, executionId, startTime, context } = executionState;

    try {
      // Execute root steps
      for (const step of workflow.steps) {
        if (executionState.cancelled) {
          break;
        }

        await this.executeStep(step, executionState);
      }

      // Create final outcome
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      const totalCost = this.budgetTracker.getCurrentBudget(executionId);
      const safetyViolations = this.safetyEnforcer.getAllViolations(executionId);

      const outcome: ExecutionOutcome = {
        workflowId: workflow.id,
        executionId,
        status: this.determineExecutionStatus(executionState, safetyViolations),
        startTime,
        endTime,
        duration,
        totalCost,
        stepResults: this.mapToStepResults(executionState.stepResults),
        safetyViolations,
        hasViolations: safetyViolations.length > 0,
        violationFlags: this.createViolationFlags(executionState, safetyViolations),
        finalContext: context,
        metadata: {
          stepsExecuted: executionState.stepResults.size,
          parallelBranches: executionState.trajectory?.parallelBranches.length || 0,
          decisionPoints: executionState.trajectory?.decisionPoints.length || 0
        }
      };

      return outcome;
    } catch (error) {
      throw new WorkflowExecutionError(`Workflow execution failed: ${error.message}`, error);
    }
  }

  private async executeStep(
    step: WorkflowStep,
    executionState: ExecutionState
  ): Promise<void> {
    const { executionId, context, options } = executionState;
    executionState.currentStep = step.id;

    this.logger.debug('Executing step', { stepId: step.id, type: step.type });
    this.emit('stepStarted', { executionId, stepId: step.id, step });

    // Pre-execution safety checks
    if (options.enableSafetyChecks !== false) {
      // Use enhanced safety validation
      const safetyValid = await this.validateStepWithSafetyManager(step, context, executionId);
      if (!safetyValid) {
        throw new Error(`Safety validation failed for step ${step.id}`);
      }

      // Legacy safety enforcer check
      const safetyViolation = this.safetyEnforcer.validateStep(executionId, step, context);
      if (safetyViolation && safetyViolation.severity === 'critical') {
        throw new SafetyViolationError(safetyViolation);
      }
    }

    // Check budget before execution
    if (step.costEstimate) {
      const budgetCheck = this.budgetTracker.checkBudget(executionId, {
        tokens: step.costEstimate
      });
      if (!budgetCheck.withinBudget) {
        throw new BudgetExceededError(budgetCheck.message);
      }
    }

    const stepStartTime = new Date();
    let stepResult: StepResult;

    try {
      // Execute step based on type
      switch (step.type) {
        case 'action':
          stepResult = await this.executeActionStep(step, context, executionState);
          break;
        case 'decision':
          stepResult = await this.executeDecisionStep(step, executionState);
          break;
        case 'parallel':
          stepResult = await this.executeParallelSteps(step, executionState);
          break;
        case 'sequential':
          stepResult = await this.executeSequentialSteps(step, executionState);
          break;
        case 'condition':
          stepResult = await this.executeConditionalStep(step, executionState);
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      // Update budget with actual cost
      if (stepResult.cost) {
        this.budgetTracker.addCost(executionId, stepResult.cost);
      }

      // Update context with step result
      context.stepResults[step.id] = stepResult;
      context.currentBudget = this.budgetTracker.getCurrentBudget(executionId);
      context.safetyState = this.safetyEnforcer.getCurrentState(executionId);

      // Record trajectory step
      if (executionState.trajectory) {
        this.recordTrajectoryStep(step, stepResult, context, executionState);
      }

      executionState.stepResults.set(step.id, stepResult);
      this.emit('stepCompleted', { executionId, stepId: step.id, result: stepResult });

    } catch (error) {
      stepResult = {
        stepId: step.id,
        status: 'failed',
        startTime: stepStartTime,
        endTime: new Date(),
        error: error as Error,
        cost: { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 }
      };

      executionState.stepResults.set(step.id, stepResult);
      this.emit('stepFailed', { executionId, stepId: step.id, error, result: stepResult });
      throw error;
    }
  }

  private async executeDecisionStep(
    step: WorkflowStep,
    executionState: ExecutionState
  ): Promise<StepResult> {
    const startTime = new Date();
    const { context } = executionState;

    if (!step.condition) {
      throw new Error(`Decision step ${step.id} missing condition`);
    }

    // Evaluate condition
    const conditionResult = await this.evaluateCondition(step.condition, context);
    
    // Record decision point
    if (executionState.trajectory) {
      const decisionPoint: DecisionPoint = {
        stepId: step.id,
        timestamp: new Date(),
        condition: step.condition,
        evaluationResult: conditionResult,
        context: { ...context },
        alternativePaths: step.children?.map(child => child.id) || [],
        chosenPath: conditionResult ? step.children?.[0]?.id || '' : step.children?.[1]?.id || ''
      };
      executionState.trajectory.decisionPoints.push(decisionPoint);
    }

    // Execute appropriate child steps
    if (step.children) {
      const childIndex = conditionResult ? 0 : 1;
      if (step.children[childIndex]) {
        await this.executeStep(step.children[childIndex], executionState);
      }
    }

    return {
      stepId: step.id,
      status: 'completed',
      startTime,
      endTime: new Date(),
      result: { conditionResult },
      cost: { tokens: 1, computeTime: 10, memory: 0, apiCalls: 0, monetaryCost: 0 }
    };
  }

  private async executeParallelSteps(
    step: WorkflowStep,
    executionState: ExecutionState
  ): Promise<StepResult> {
    const startTime = new Date();
    const branchId = `${step.id}-${Date.now()}`;

    // Create parallel branch record
    if (executionState.trajectory) {
      const branch: ParallelBranch = {
        branchId,
        parentStepId: step.id,
        steps: step.children?.map(child => child.id) || [],
        startTime,
        status: 'running'
      };
      executionState.trajectory.parallelBranches.push(branch);
    }

    try {
      // Execute child steps in parallel
      const childPromises = (step.children || []).map(childStep => 
        this.executeStep(childStep, executionState)
      );

      await Promise.all(childPromises);

      // Update branch status
      if (executionState.trajectory) {
        const branch = executionState.trajectory.parallelBranches.find(b => b.branchId === branchId);
        if (branch) {
          branch.status = 'completed';
          branch.endTime = new Date();
        }
      }

      return {
        stepId: step.id,
        status: 'completed',
        startTime,
        endTime: new Date(),
        result: { parallelResults: step.children?.map(child => executionState.stepResults.get(child.id)) },
        cost: this.aggregateParallelCosts(step.children || [], executionState)
      };
    } catch (error) {
      // Update branch status
      if (executionState.trajectory) {
        const branch = executionState.trajectory.parallelBranches.find(b => b.branchId === branchId);
        if (branch) {
          branch.status = 'failed';
          branch.endTime = new Date();
        }
      }
      throw error;
    }
  }

  private async executeSequentialSteps(
    step: WorkflowStep,
    executionState: ExecutionState
  ): Promise<StepResult> {
    const startTime = new Date();

    // Execute child steps sequentially
    for (const childStep of step.children || []) {
      await this.executeStep(childStep, executionState);
    }

    return {
      stepId: step.id,
      status: 'completed',
      startTime,
      endTime: new Date(),
      result: { sequentialResults: step.children?.map(child => executionState.stepResults.get(child.id)) },
      cost: this.aggregateSequentialCosts(step.children || [], executionState)
    };
  }

  private async executeConditionalStep(
    step: WorkflowStep,
    executionState: ExecutionState
  ): Promise<StepResult> {
    const startTime = new Date();
    const { context } = executionState;

    if (!step.condition) {
      throw new Error(`Conditional step ${step.id} missing condition`);
    }

    const conditionResult = await this.evaluateCondition(step.condition, context);

    if (conditionResult && step.children) {
      for (const childStep of step.children) {
        await this.executeStep(childStep, executionState);
      }
    }

    return {
      stepId: step.id,
      status: 'completed',
      startTime,
      endTime: new Date(),
      result: { conditionResult, executed: conditionResult },
      cost: { tokens: 1, computeTime: 5, memory: 0, apiCalls: 0, monetaryCost: 0 }
    };
  }

  private async evaluateCondition(
    condition: any,
    context: WorkflowContext
  ): Promise<boolean> {
    // Implementation depends on condition structure
    // This is a simplified example
    switch (condition.type) {
      case 'equals':
        return condition.left === condition.right;
      case 'custom':
        return condition.customEvaluator ? condition.customEvaluator(context) : false;
      default:
        return false;
    }
  }

  private recordTrajectoryStep(
    step: WorkflowStep,
    result: StepResult,
    context: WorkflowContext,
    executionState: ExecutionState
  ): void {
    if (!executionState.trajectory) return;

    const trajectoryStep: TrajectoryStep = {
      stepId: step.id,
      sequence: executionState.trajectory.steps.length,
      timestamp: new Date(),
      action: step.action?.type || step.type,
      parameters: step.action?.parameters || {},
      result,
      contextBefore: { ...context }, // Should be context before step execution
      contextAfter: { ...context },
      costIncurred: result.cost || { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 },
      safetyChecks: []
    };

    executionState.trajectory.steps.push(trajectoryStep);
    executionState.trajectory.contextEvolution.push({ ...context });
  }

  private aggregateParallelCosts(steps: WorkflowStep[], executionState: ExecutionState): BudgetInfo {
    return steps.reduce((total, step) => {
      const stepResult = executionState.stepResults.get(step.id);
      const cost = stepResult?.cost || { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 };
      return {
        tokens: (total.tokens || 0) + (cost.tokens || 0),
        computeTime: Math.max(total.computeTime || 0, cost.computeTime || 0), // Max for parallel
        memory: (total.memory || 0) + (cost.memory || 0),
        apiCalls: (total.apiCalls || 0) + (cost.apiCalls || 0),
        monetaryCost: (total.monetaryCost || 0) + (cost.monetaryCost || 0)
      };
    }, { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 });
  }

  private aggregateSequentialCosts(steps: WorkflowStep[], executionState: ExecutionState): BudgetInfo {
    return steps.reduce((total, step) => {
      const stepResult = executionState.stepResults.get(step.id);
      const cost = stepResult?.cost || { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 };
      return {
        tokens: (total.tokens || 0) + (cost.tokens || 0),
        computeTime: (total.computeTime || 0) + (cost.computeTime || 0), // Sum for sequential
        memory: (total.memory || 0) + (cost.memory || 0),
        apiCalls: (total.apiCalls || 0) + (cost.apiCalls || 0),
        monetaryCost: (total.monetaryCost || 0) + (cost.monetaryCost || 0)
      };
    }, { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 });
  }

  private determineExecutionStatus(
    executionState: ExecutionState,
    safetyViolations: SafetyViolation[]
  ): ExecutionOutcome['status'] {
    if (executionState.cancelled) {
      return 'cancelled';
    }

    const criticalViolations = safetyViolations.filter(v => v.severity === 'critical');
    if (criticalViolations.length > 0) {
      return 'safety_violation';
    }

    const budgetExceeded = this.budgetTracker.isBudgetExceeded(executionState.executionId);
    if (budgetExceeded) {
      return 'budget_exceeded';
    }

    const hasFailedSteps = Array.from(executionState.stepResults.values())
      .some(result => result.status === 'failed');
    if (hasFailedSteps) {
      return 'failed';
    }

    return 'completed';
  }

  private createViolationFlags(
    executionState: ExecutionState,
    safetyViolations: SafetyViolation[]
  ) {
    return {
      budgetExceeded: this.budgetTracker.isBudgetExceeded(executionState.executionId),
      safetyViolated: safetyViolations.length > 0,
      timeoutReached: false, // TODO: Implement timeout tracking
      criticalError: safetyViolations.some(v => v.severity === 'critical')
    };
  }

  private mapToStepResults(stepResults: Map<string, StepResult>): Record<string, StepResult> {
    const result: Record<string, StepResult> = {};
    for (const [stepId, stepResult] of stepResults) {
      result[stepId] = stepResult;
    }
    return result;
  }

  private async finalizeExecution(
    executionState: ExecutionState,
    outcome: ExecutionOutcome
  ): Promise<void> {
    // Clean up resources
    this.budgetTracker.cleanup(executionState.executionId);
    this.safetyEnforcer.cleanup(executionState.executionId);

    // Emit completion event
    this.emit('executionCompleted', { 
      executionId: executionState.executionId, 
      outcome,
      trajectory: executionState.trajectory 
    });

    this.logger.info('Workflow execution completed', {
      executionId: executionState.executionId,
      status: outcome.status,
      duration: outcome.duration,
      stepsExecuted: outcome.metadata.stepsExecuted
    });
  }

  private handleExecutionError(
    executionId: string,
    workflow: WorkflowDefinition,
    error: any,
    startTime: Date
  ): ExecutionOutcome {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    this.emit('executionFailed', { executionId, workflow, error });

    return {
      workflowId: workflow.id,
      executionId,
      status: 'failed',
      startTime,
      endTime,
      duration,
      totalCost: this.budgetTracker.getCurrentBudget(executionId),
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
        metadata: { error: error.message },
        currentBudget: { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 },
        safetyState: {
          violations: [],
          activeConstraints: [],
          riskLevel: 'critical',
          lastCheck: new Date()
        }
      },
      metadata: { error: error.message }
    };
  }

  private setupEventHandlers(): void {
    this.on('stepStarted', (data) => {
      this.logger.debug('Step started', data);
    });

    this.on('stepCompleted', (data) => {
      this.logger.debug('Step completed', data);
    });

    this.on('stepFailed', (data) => {
      this.logger.error('Step failed', data);
    });
  }

  /**
   * Execute action step with tool registry integration
   */
  private async executeActionStep(
    step: WorkflowStep,
    context: WorkflowContext,
    executionState: ExecutionState
  ): Promise<StepResult> {
    const { executionId } = executionState;
    
    if (!step.action) {
      throw new Error(`Action step ${step.id} missing action definition`);
    }

    const { action } = step;
    
    // Handle plan execution with ou_type
    if (action.type === 'plan_execution' || (action.parameters?.ou_type === 'plan_execution')) {
      return await this.executePlanStep(step, context, executionState);
    }

    // Use tool registry if ou_type is specified
    if (action.parameters?.ou_type) {
      const ou_type = action.parameters.ou_type;
      
      if (this.toolRegistry.hasTool(ou_type)) {
        return await this.toolRegistry.executeTool(ou_type, action, {
          executionId,
          stepId: step.id,
          context,
          timeout: step.timeout
        });
      } else {
        this.logger.warn(`Unknown ou_type: ${ou_type}, falling back to default executor`);
      }
    }

    // Fall back to default step executor
    return await this.stepExecutor.executeAction(step, context, executionState);
  }

  /**
   * Execute plan step with workflow orchestration
   */
  private async executePlanStep(
    step: WorkflowStep,
    context: WorkflowContext,
    executionState: ExecutionState
  ): Promise<StepResult> {
    const startTime = new Date();
    
    // Prevent infinite recursion
    if (this.planExecutionDepth >= this.MAX_PLAN_DEPTH) {
      return {
        stepId: step.id,
        status: 'failed',
        startTime,
        endTime: new Date(),
        error: new Error(`Maximum plan execution depth exceeded (${this.MAX_PLAN_DEPTH})`),
        cost: { tokens: 1, computeTime: 100, memory: 0, apiCalls: 0, monetaryCost: 0 }
      };
    }

    try {
      this.planExecutionDepth++;
      
      const { plan, executionOptions = {} } = step.action!.parameters;
      
      if (!plan || !plan.steps) {
        throw new Error('Plan execution step missing plan or steps');
      }

      // Create sub-workflow definition from plan
      const subWorkflow: WorkflowDefinition = {
        id: plan.id || `subplan_${step.id}`,
        name: plan.name || `Sub-plan for ${step.id}`,
        version: plan.version || '1.0.0',
        steps: this.convertPlanStepsToWorkflowSteps(plan.steps),
        initialContext: {
          variables: { ...context.variables, ...plan.initialContext?.variables },
          stepResults: context.stepResults,
          metadata: { ...context.metadata, parentStepId: step.id }
        },
        budgetLimit: plan.budgetLimit,
        safetyConstraints: plan.safetyConstraints || []
      };

      // Execute sub-workflow
      const subExecutionOptions = {
        ...executionOptions,
        recordTrajectory: executionState.options.recordTrajectory,
        enableSafetyChecks: executionState.options.enableSafetyChecks
      };

      const subOutcome = await this.execute(subWorkflow, subExecutionOptions);
      
      // Update parent context with sub-workflow results
      Object.assign(context.variables, subOutcome.finalContext.variables);
      Object.assign(context.stepResults, subOutcome.stepResults);
      context.metadata.subWorkflowResults = context.metadata.subWorkflowResults || [];
      context.metadata.subWorkflowResults.push({
        workflowId: subWorkflow.id,
        executionId: subOutcome.executionId,
        status: subOutcome.status,
        duration: subOutcome.duration
      });

      return {
        stepId: step.id,
        status: subOutcome.status === 'completed' ? 'completed' : 'failed',
        startTime,
        endTime: new Date(),
        duration: subOutcome.duration,
        result: {
          subWorkflowId: subWorkflow.id,
          subExecutionId: subOutcome.executionId,
          status: subOutcome.status,
          stepResults: subOutcome.stepResults,
          finalContext: subOutcome.finalContext
        },
        cost: subOutcome.totalCost,
        metadata: {
          planExecutionDepth: this.planExecutionDepth,
          subWorkflowMetadata: subOutcome.metadata
        }
      };
    } finally {
      this.planExecutionDepth--;
    }
  }

  /**
   * Convert plan steps to workflow steps
   */
  private convertPlanStepsToWorkflowSteps(planSteps: any[]): WorkflowStep[] {
    return planSteps.map((planStep, index) => ({
      id: planStep.id || `step_${index}`,
      type: planStep.type || 'action',
      name: planStep.name || `Step ${index + 1}`,
      description: planStep.description,
      action: planStep.action || {
        type: planStep.ou_type || 'custom',
        parameters: planStep.args_json ? 
          (typeof planStep.args_json === 'string' ? JSON.parse(planStep.args_json) : planStep.args_json) : 
          planStep.parameters || {}
      },
      condition: planStep.condition,
      children: planStep.children ? this.convertPlanStepsToWorkflowSteps(planStep.children) : undefined,
      dependencies: planStep.dependencies,
      timeout: planStep.timeout || 30000,
      retryPolicy: planStep.retryPolicy,
      costEstimate: planStep.costEstimate,
      safetyConstraints: planStep.safetyConstraints
    }));
  }

  /**
   * Create default safety manager if none provided
   */
  private createDefaultSafetyManager(): SafetyManager {
    return new SafetyManager({
      budgetLimits: {
        maxTokens: 100000,
        maxCost: 10.0,
        maxLatency: 60000,
        windowSize: 3600000 // 1 hour
      },
      depthLimits: {
        maxDepth: 10,
        maxBranching: 5
      },
      capabilities: {
        allowed: ['ocr', 'ner', 'route', 'plan_execution'],
        restricted: [],
        requireApproval: []
      },
      validation: {
        strictMode: true,
        allowUnknownProperties: false,
        coerceTypes: true
      }
    });
  }

  /**
   * Enhanced step validation using SafetyManager
   */
  private async validateStepWithSafetyManager(
    step: WorkflowStep,
    context: WorkflowContext,
    executionId: string
  ): Promise<boolean> {
    try {
      // Convert workflow step to safety manager step format
      const safetyStep = {
        id: step.id,
        type: step.action?.parameters?.ou_type || step.action?.type || step.type,
        args_json: JSON.stringify(step.action?.parameters || {}),
        metadata: {
          timestamp: Date.now(),
          sessionId: executionId,
          depth: this.planExecutionDepth,
          capabilities: step.action?.requiredResources || []
        }
      };

      const validationResult = await this.safetyManager.validateStep(safetyStep);
      
      if (!validationResult.isValid) {
        this.logger.error('Step validation failed', {
          stepId: step.id,
          errors: validationResult.errors,
          warnings: validationResult.warnings
        });
        return false;
      }

      if (validationResult.warnings && validationResult.warnings.length > 0) {
        this.logger.warn('Step validation warnings', {
          stepId: step.id,
          warnings: validationResult.warnings
        });
      }

      return true;
    } catch (error) {
      this.logger.error('Step validation error', { stepId: step.id, error });
      return false;
    }
  }

  /**
   * Get tool registry instance
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Get safety manager instance
   */
  getSafetyManager(): SafetyManager {
    return this.safetyManager;
  }

  /**
   * Get execution metrics for analysis
   */
  getExecutionMetrics(): {
    activeExecutions: number;
    toolMetrics: Record<string, any>;
    budgetStatus: any;
    safetyStats: any;
  } {
    return {
      activeExecutions: this.activeExecutions.size,
      toolMetrics: this.toolRegistry.getAllMetrics(),
      budgetStatus: this.budgetTracker.getBudgetSummary || null,
      safetyStats: this.safetyManager.getStats()
    };
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Supporting interfaces and classes
interface ExecutionState {
  executionId: string;
  workflow: WorkflowDefinition;
  options: ExecutionOptions;
  startTime: Date;
  context: WorkflowContext;
  trajectory: Trajectory | null;
  stepResults: Map<string, StepResult>;
  cancelled: boolean;
  cancellationReason?: string;
  currentStep: string | null;
}

export class WorkflowExecutionError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'WorkflowExecutionError';
  }
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class SafetyViolationError extends Error {
  constructor(public violation: SafetyViolation) {
    super(`Safety violation: ${violation.message}`);
    this.name = 'SafetyViolationError';
  }
}