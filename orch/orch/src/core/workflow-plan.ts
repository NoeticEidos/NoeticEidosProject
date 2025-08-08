/**
 * WorkflowPlan type definitions for plan execution
 * Defines the structure for executable workflow plans
 */

import { BudgetInfo, SafetyConstraint } from '../types/workflow-types.js';

export interface WorkflowPlan {
  id: string;
  name: string;
  version: string;
  description?: string;
  steps: PlanStep[];
  initialContext?: {
    variables?: Record<string, any>;
    metadata?: Record<string, any>;
  };
  budgetLimit?: BudgetInfo;
  safetyConstraints?: SafetyConstraint[];
  executionOptions?: PlanExecutionOptions;
}

export interface PlanStep {
  id: string;
  type: 'action' | 'decision' | 'parallel' | 'sequential' | 'condition';
  name: string;
  description?: string;
  ou_type?: string; // Output type for tool registry
  args_json?: string | Record<string, any>; // Step arguments
  action?: {
    type: string;
    parameters: Record<string, any>;
  };
  condition?: {
    type: string;
    expression: string;
    customEvaluator?: (context: any) => boolean;
  };
  children?: PlanStep[];
  dependencies?: string[];
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffStrategy: 'linear' | 'exponential' | 'fixed';
    baseDelay: number;
    maxDelay?: number;
    retryableErrors?: string[];
  };
  costEstimate?: number;
  safetyConstraints?: SafetyConstraint[];
  metadata?: Record<string, any>;
}

export interface PlanExecutionOptions {
  dryRun?: boolean;
  enableParallelism?: boolean;
  maxConcurrency?: number;
  timeoutMs?: number;
  budgetLimit?: BudgetInfo;
  customValidators?: SafetyConstraint[];
  recordTrajectory?: boolean;
  enableReplay?: boolean;
}

export interface PlanExecutionResult {
  planId: string;
  executionId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'timeout';
  startTime: Date;
  endTime: Date;
  duration: number;
  stepResults: Record<string, any>;
  totalCost: BudgetInfo;
  safetyViolations: any[];
  finalContext: {
    variables: Record<string, any>;
    metadata: Record<string, any>;
  };
  metadata: {
    stepsExecuted: number;
    failedSteps: string[];
    skippedSteps: string[];
  };
}

/**
 * Utility functions for working with workflow plans
 */
export class WorkflowPlanUtils {
  /**
   * Validate a workflow plan structure
   */
  static validatePlan(plan: WorkflowPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!plan.id) errors.push('Plan ID is required');
    if (!plan.name) errors.push('Plan name is required');
    if (!plan.version) errors.push('Plan version is required');
    if (!plan.steps || plan.steps.length === 0) errors.push('Plan must have at least one step');

    // Validate steps
    for (const step of plan.steps) {
      const stepErrors = this.validateStep(step);
      errors.push(...stepErrors.map(err => `Step ${step.id}: ${err}`));
    }

    // Check for circular dependencies
    const circularDeps = this.findCircularDependencies(plan.steps);
    if (circularDeps.length > 0) {
      errors.push(`Circular dependencies found: ${circularDeps.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a single plan step
   */
  static validateStep(step: PlanStep): string[] {
    const errors: string[] = [];

    if (!step.id) errors.push('Step ID is required');
    if (!step.name) errors.push('Step name is required');
    if (!step.type) errors.push('Step type is required');

    if (step.type === 'action') {
      if (!step.action && !step.ou_type) {
        errors.push('Action steps must have either action definition or ou_type');
      }
      
      if (step.args_json) {
        try {
          if (typeof step.args_json === 'string') {
            JSON.parse(step.args_json);
          }
        } catch {
          errors.push('args_json must be valid JSON string');
        }
      }
    }

    if (step.type === 'decision' || step.type === 'condition') {
      if (!step.condition) {
        errors.push('Decision/condition steps must have condition definition');
      }
    }

    return errors;
  }

  /**
   * Find circular dependencies in plan steps
   */
  static findCircularDependencies(steps: PlanStep[]): string[] {
    const graph = new Map<string, string[]>();
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const circularDeps: string[] = [];

    // Build dependency graph
    for (const step of steps) {
      graph.set(step.id, step.dependencies || []);
    }

    // DFS to detect cycles
    const dfs = (stepId: string): boolean => {
      if (recursionStack.has(stepId)) {
        circularDeps.push(stepId);
        return true;
      }

      if (visited.has(stepId)) return false;

      visited.add(stepId);
      recursionStack.add(stepId);

      const dependencies = graph.get(stepId) || [];
      for (const dep of dependencies) {
        if (dfs(dep)) return true;
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        dfs(step.id);
      }
    }

    return circularDeps;
  }

  /**
   * Sort steps based on dependencies (topological sort)
   */
  static sortStepsByDependencies(steps: PlanStep[]): PlanStep[] {
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const stepMap = new Map<string, PlanStep>();

    // Initialize
    for (const step of steps) {
      stepMap.set(step.id, step);
      graph.set(step.id, step.dependencies || []);
      inDegree.set(step.id, 0);
    }

    // Calculate in-degrees
    for (const step of steps) {
      for (const dep of step.dependencies || []) {
        if (inDegree.has(dep)) {
          inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
        }
      }
    }

    // Topological sort
    const queue: string[] = [];
    const result: PlanStep[] = [];

    // Add steps with no dependencies
    for (const [stepId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(stepId);
      }
    }

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentStep = stepMap.get(currentId)!;
      result.push(currentStep);

      // Update in-degrees of dependent steps
      for (const step of steps) {
        if ((step.dependencies || []).includes(currentId)) {
          const newDegree = (inDegree.get(step.id) || 0) - 1;
          inDegree.set(step.id, newDegree);
          
          if (newDegree === 0) {
            queue.push(step.id);
          }
        }
      }
    }

    return result;
  }

  /**
   * Estimate total cost for plan execution
   */
  static estimatePlanCost(plan: WorkflowPlan): BudgetInfo {
    const totalCost: BudgetInfo = {
      tokens: 0,
      computeTime: 0,
      memory: 0,
      apiCalls: 0,
      monetaryCost: 0
    };

    for (const step of plan.steps) {
      const stepCost = this.estimateStepCost(step);
      this.accumulateCosts(totalCost, stepCost);
    }

    return totalCost;
  }

  /**
   * Estimate cost for a single step
   */
  static estimateStepCost(step: PlanStep): BudgetInfo {
    // Base cost estimation
    const baseCost: BudgetInfo = {
      tokens: step.costEstimate || 10,
      computeTime: 1000,
      memory: 1024 * 1024,
      apiCalls: 1,
      monetaryCost: 0.001
    };

    // Adjust based on step type
    switch (step.ou_type) {
      case 'ocr':
        return {
          tokens: 50,
          computeTime: 2000,
          memory: 5 * 1024 * 1024,
          apiCalls: 1,
          monetaryCost: 0.01
        };
      case 'ner':
        return {
          tokens: 20,
          computeTime: 500,
          memory: 2 * 1024 * 1024,
          apiCalls: 1,
          monetaryCost: 0.005
        };
      case 'route':
        return {
          tokens: 5,
          computeTime: 100,
          memory: 1024,
          apiCalls: 0,
          monetaryCost: 0.001
        };
      case 'plan_execution':
        return {
          tokens: 100,
          computeTime: 5000,
          memory: 10 * 1024 * 1024,
          apiCalls: 5,
          monetaryCost: 0.05
        };
      default:
        return baseCost;
    }
  }

  /**
   * Accumulate costs
   */
  private static accumulateCosts(target: BudgetInfo, addition: BudgetInfo): void {
    target.tokens = (target.tokens || 0) + (addition.tokens || 0);
    target.computeTime = (target.computeTime || 0) + (addition.computeTime || 0);
    target.memory = (target.memory || 0) + (addition.memory || 0);
    target.apiCalls = (target.apiCalls || 0) + (addition.apiCalls || 0);
    target.monetaryCost = (target.monetaryCost || 0) + (addition.monetaryCost || 0);

    if (addition.customMetrics) {
      target.customMetrics = target.customMetrics || {};
      for (const [metric, value] of Object.entries(addition.customMetrics)) {
        target.customMetrics[metric] = (target.customMetrics[metric] || 0) + value;
      }
    }
  }

  /**
   * Convert plan to workflow definition
   */
  static planToWorkflowDefinition(plan: WorkflowPlan): any {
    return {
      id: plan.id,
      name: plan.name,
      version: plan.version,
      description: plan.description,
      steps: plan.steps.map(step => ({
        id: step.id,
        type: step.type,
        name: step.name,
        description: step.description,
        action: step.action || {
          type: step.ou_type || 'custom',
          parameters: {
            ...(typeof step.args_json === 'string' ? 
              JSON.parse(step.args_json) : 
              step.args_json || {}),
            ou_type: step.ou_type
          }
        },
        condition: step.condition,
        children: step.children,
        dependencies: step.dependencies,
        timeout: step.timeout,
        retryPolicy: step.retryPolicy,
        costEstimate: step.costEstimate,
        safetyConstraints: step.safetyConstraints
      })),
      initialContext: plan.initialContext,
      budgetLimit: plan.budgetLimit,
      safetyConstraints: plan.safetyConstraints
    };
  }
}