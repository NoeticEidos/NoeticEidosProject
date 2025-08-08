/**
 * Safety constraint enforcement system
 * Validates and enforces safety constraints during workflow execution
 */

import {
  SafetyConstraint,
  SafetyViolation,
  SafetyState,
  WorkflowStep,
  WorkflowContext,
  BudgetInfo
} from '../types/workflow-types.js';

export interface SafetyValidationResult {
  isValid: boolean;
  violations: SafetyViolation[];
  warnings: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface SafetyMetrics {
  executionId: string;
  totalChecks: number;
  violationCount: number;
  warningCount: number;
  criticalViolations: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  lastCheck: Date;
  checkHistory: SafetyCheckEntry[];
}

export interface SafetyCheckEntry {
  timestamp: Date;
  stepId: string;
  constraintId: string;
  result: 'passed' | 'warning' | 'violation';
  message: string;
  severity: 'warning' | 'error' | 'critical';
  details?: Record<string, any>;
}

export class SafetyEnforcer {
  private executionStates: Map<string, SafetyExecutionState> = new Map();
  private globalConstraints: SafetyConstraint[] = [];
  private violationCallback?: (violation: SafetyViolation) => void;

  constructor() {
    this.initializeDefaultConstraints();
  }

  /**
   * Initialize safety enforcement for an execution
   */
  initialize(executionId: string, constraints: SafetyConstraint[]): void {
    const safetyState: SafetyExecutionState = {
      executionId,
      constraints: [...this.globalConstraints, ...constraints],
      violations: [],
      checkHistory: [],
      riskLevel: 'low',
      lastCheck: new Date(),
      constraintIndex: new Map()
    };

    // Index constraints by ID for quick lookup
    for (const constraint of safetyState.constraints) {
      safetyState.constraintIndex.set(constraint.id, constraint);
    }

    this.executionStates.set(executionId, safetyState);
  }

  /**
   * Validate a workflow step against safety constraints
   */
  validateStep(
    executionId: string,
    step: WorkflowStep,
    context: WorkflowContext
  ): SafetyViolation | null {
    const safetyState = this.executionStates.get(executionId);
    if (!safetyState) {
      throw new Error(`Safety enforcement not initialized for execution ${executionId}`);
    }

    const timestamp = new Date();
    safetyState.lastCheck = timestamp;

    // Check step-specific constraints first
    if (step.safetyConstraints) {
      for (const constraint of step.safetyConstraints) {
        const violation = this.checkConstraint(constraint, step, context, timestamp);
        if (violation) {
          this.recordViolation(safetyState, violation, step.id);
          if (violation.severity === 'critical') {
            return violation;
          }
        }
      }
    }

    // Check global and execution constraints
    for (const constraint of safetyState.constraints) {
      const violation = this.checkConstraint(constraint, step, context, timestamp);
      if (violation) {
        this.recordViolation(safetyState, violation, step.id);
        if (violation.severity === 'critical') {
          return violation;
        }
      }
    }

    // Update risk level
    this.updateRiskLevel(safetyState);

    return null;
  }

  /**
   * Validate entire workflow context
   */
  validateContext(executionId: string, context: WorkflowContext): SafetyValidationResult {
    const safetyState = this.executionStates.get(executionId);
    if (!safetyState) {
      return {
        isValid: false,
        violations: [],
        warnings: ['Safety enforcement not initialized'],
        riskLevel: 'critical'
      };
    }

    const violations: SafetyViolation[] = [];
    const warnings: string[] = [];

    // Check context-level constraints
    for (const constraint of safetyState.constraints) {
      if (constraint.type === 'resource_limit' || constraint.type === 'custom') {
        try {
          const violation = constraint.validator(context, {} as WorkflowStep);
          if (violation) {
            violations.push(violation);
            if (violation.severity === 'warning') {
              warnings.push(violation.message);
            }
          }
        } catch (error) {
          warnings.push(`Constraint validation error for ${constraint.id}: ${error.message}`);
        }
      }
    }

    const riskLevel = this.calculateRiskLevel(violations);
    
    return {
      isValid: violations.filter(v => v.severity === 'critical').length === 0,
      violations,
      warnings,
      riskLevel
    };
  }

  /**
   * Get current safety state
   */
  getCurrentState(executionId: string): SafetyState {
    const safetyState = this.executionStates.get(executionId);
    if (!safetyState) {
      return {
        violations: [],
        activeConstraints: [],
        riskLevel: 'critical',
        lastCheck: new Date()
      };
    }

    return {
      violations: [...safetyState.violations],
      activeConstraints: [...safetyState.constraints],
      riskLevel: safetyState.riskLevel,
      lastCheck: safetyState.lastCheck
    };
  }

  /**
   * Get all violations for execution
   */
  getAllViolations(executionId: string): SafetyViolation[] {
    const safetyState = this.executionStates.get(executionId);
    return safetyState ? [...safetyState.violations] : [];
  }

  /**
   * Get safety metrics
   */
  getMetrics(executionId: string): SafetyMetrics {
    const safetyState = this.executionStates.get(executionId);
    if (!safetyState) {
      throw new Error(`Safety state not found for execution ${executionId}`);
    }

    return {
      executionId,
      totalChecks: safetyState.checkHistory.length,
      violationCount: safetyState.violations.length,
      warningCount: safetyState.violations.filter(v => v.severity === 'warning').length,
      criticalViolations: safetyState.violations.filter(v => v.severity === 'critical').length,
      riskLevel: safetyState.riskLevel,
      lastCheck: safetyState.lastCheck,
      checkHistory: [...safetyState.checkHistory]
    };
  }

  /**
   * Add custom constraint
   */
  addConstraint(executionId: string, constraint: SafetyConstraint): void {
    const safetyState = this.executionStates.get(executionId);
    if (!safetyState) {
      throw new Error(`Safety state not found for execution ${executionId}`);
    }

    safetyState.constraints.push(constraint);
    safetyState.constraintIndex.set(constraint.id, constraint);
  }

  /**
   * Remove constraint
   */
  removeConstraint(executionId: string, constraintId: string): boolean {
    const safetyState = this.executionStates.get(executionId);
    if (!safetyState) {
      return false;
    }

    const index = safetyState.constraints.findIndex(c => c.id === constraintId);
    if (index >= 0) {
      safetyState.constraints.splice(index, 1);
      safetyState.constraintIndex.delete(constraintId);
      return true;
    }

    return false;
  }

  /**
   * Set violation callback
   */
  setViolationCallback(callback: (violation: SafetyViolation) => void): void {
    this.violationCallback = callback;
  }

  /**
   * Add global constraint
   */
  addGlobalConstraint(constraint: SafetyConstraint): void {
    this.globalConstraints.push(constraint);
  }

  /**
   * Cleanup safety state
   */
  cleanup(executionId: string): void {
    this.executionStates.delete(executionId);
  }

  private checkConstraint(
    constraint: SafetyConstraint,
    step: WorkflowStep,
    context: WorkflowContext,
    timestamp: Date
  ): SafetyViolation | null {
    try {
      const violation = constraint.validator(context, step);
      
      // Record check in history
      const safetyState = this.executionStates.get(context.metadata.executionId || '');
      if (safetyState) {
        const checkEntry: SafetyCheckEntry = {
          timestamp,
          stepId: step.id,
          constraintId: constraint.id,
          result: violation ? 'violation' : 'passed',
          message: violation?.message || 'Check passed',
          severity: violation?.severity || 'warning'
        };
        safetyState.checkHistory.push(checkEntry);
      }

      return violation;
    } catch (error) {
      // Create violation for constraint validation error
      return {
        constraintId: constraint.id,
        severity: 'error',
        message: `Constraint validation failed: ${error.message}`,
        timestamp,
        stepId: step.id,
        details: { error: error.message }
      };
    }
  }

  private recordViolation(
    safetyState: SafetyExecutionState,
    violation: SafetyViolation,
    stepId: string
  ): void {
    violation.stepId = stepId;
    safetyState.violations.push(violation);

    if (this.violationCallback) {
      this.violationCallback(violation);
    }
  }

  private updateRiskLevel(safetyState: SafetyExecutionState): void {
    const recentViolations = safetyState.violations.filter(
      v => Date.now() - v.timestamp.getTime() < 60000 // Last minute
    );

    const criticalCount = recentViolations.filter(v => v.severity === 'critical').length;
    const errorCount = recentViolations.filter(v => v.severity === 'error').length;
    const warningCount = recentViolations.filter(v => v.severity === 'warning').length;

    if (criticalCount > 0) {
      safetyState.riskLevel = 'critical';
    } else if (errorCount >= 3) {
      safetyState.riskLevel = 'high';
    } else if (errorCount > 0 || warningCount >= 5) {
      safetyState.riskLevel = 'medium';
    } else {
      safetyState.riskLevel = 'low';
    }
  }

  private calculateRiskLevel(violations: SafetyViolation[]): 'low' | 'medium' | 'high' | 'critical' {
    const criticalCount = violations.filter(v => v.severity === 'critical').length;
    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;

    if (criticalCount > 0) return 'critical';
    if (errorCount >= 3) return 'high';
    if (errorCount > 0 || warningCount >= 5) return 'medium';
    return 'low';
  }

  private initializeDefaultConstraints(): void {
    // Resource limit constraint
    this.globalConstraints.push({
      id: 'resource_limit_tokens',
      type: 'resource_limit',
      description: 'Enforce token usage limits',
      parameters: { maxTokens: 100000 },
      severity: 'error',
      validator: (context: WorkflowContext, step: WorkflowStep) => {
        const maxTokens = 100000;
        const currentTokens = context.currentBudget.tokens || 0;
        
        if (currentTokens > maxTokens) {
          return {
            constraintId: 'resource_limit_tokens',
            severity: 'error' as const,
            message: `Token usage ${currentTokens} exceeds limit ${maxTokens}`,
            timestamp: new Date(),
            details: { currentTokens, maxTokens }
          };
        }
        return null;
      }
    });

    // Execution time constraint
    this.globalConstraints.push({
      id: 'execution_time_limit',
      type: 'execution_time',
      description: 'Enforce execution time limits',
      parameters: { maxTime: 300000 }, // 5 minutes
      severity: 'critical',
      validator: (context: WorkflowContext, step: WorkflowStep) => {
        const maxTime = 300000;
        const currentTime = context.currentBudget.computeTime || 0;
        
        if (currentTime > maxTime) {
          return {
            constraintId: 'execution_time_limit',
            severity: 'critical' as const,
            message: `Execution time ${currentTime}ms exceeds limit ${maxTime}ms`,
            timestamp: new Date(),
            details: { currentTime, maxTime }
          };
        }
        return null;
      }
    });

    // Rate limiting constraint
    this.globalConstraints.push({
      id: 'api_rate_limit',
      type: 'rate_limit',
      description: 'Enforce API call rate limits',
      parameters: { maxCalls: 1000 },
      severity: 'error',
      validator: (context: WorkflowContext, step: WorkflowStep) => {
        const maxCalls = 1000;
        const currentCalls = context.currentBudget.apiCalls || 0;
        
        if (currentCalls > maxCalls) {
          return {
            constraintId: 'api_rate_limit',
            severity: 'error' as const,
            message: `API calls ${currentCalls} exceed limit ${maxCalls}`,
            timestamp: new Date(),
            details: { currentCalls, maxCalls }
          };
        }
        return null;
      }
    });

    // Memory usage constraint
    this.globalConstraints.push({
      id: 'memory_usage_limit',
      type: 'resource_limit',
      description: 'Enforce memory usage limits',
      parameters: { maxMemoryMB: 1024 },
      severity: 'error',
      validator: (context: WorkflowContext, step: WorkflowStep) => {
        const maxMemoryMB = 1024;
        const currentMemoryMB = (context.currentBudget.memory || 0) / (1024 * 1024);
        
        if (currentMemoryMB > maxMemoryMB) {
          return {
            constraintId: 'memory_usage_limit',
            severity: 'error' as const,
            message: `Memory usage ${currentMemoryMB.toFixed(2)}MB exceeds limit ${maxMemoryMB}MB`,
            timestamp: new Date(),
            details: { currentMemoryMB, maxMemoryMB }
          };
        }
        return null;
      }
    });
  }
}

// Supporting interfaces
interface SafetyExecutionState {
  executionId: string;
  constraints: SafetyConstraint[];
  violations: SafetyViolation[];
  checkHistory: SafetyCheckEntry[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  lastCheck: Date;
  constraintIndex: Map<string, SafetyConstraint>;
}