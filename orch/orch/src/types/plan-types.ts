/**
 * Types for WorkflowPlan execution and integration
 */

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
  budgetLimit?: {
    tokens?: number;
    computeTime?: number;
    memory?: number;
    apiCalls?: number;
    monetaryCost?: number;
  };
  safetyConstraints?: any[];
  executionOptions?: PlanExecutionOptions;
}

export interface PlanStep {
  id: string;
  type: 'action' | 'decision' | 'parallel' | 'sequential' | 'condition';
  name: string;
  description?: string;
  ou_type?: string;
  args_json?: string | Record<string, any>;
  action?: {
    type: string;
    parameters: Record<string, any>;
  };
  condition?: any;
  children?: PlanStep[];
  dependencies?: string[];
  timeout?: number;
  retryPolicy?: any;
  costEstimate?: number;
  safetyConstraints?: any[];
  metadata?: Record<string, any>;
}

export interface PlanExecutionOptions {
  dryRun?: boolean;
  enableParallelism?: boolean;
  maxConcurrency?: number;
  timeoutMs?: number;
  budgetLimit?: any;
  customValidators?: any[];
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
  totalCost: any;
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