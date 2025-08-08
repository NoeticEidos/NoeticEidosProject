/**
 * Core types for WorkflowExecutor system
 * Defines interfaces for workflows, steps, outcomes, trajectories, and replay
 */

export interface WorkflowStep {
  id: string;
  type: 'action' | 'decision' | 'parallel' | 'sequential' | 'condition';
  name: string;
  description?: string;
  action?: WorkflowAction;
  condition?: WorkflowCondition;
  children?: WorkflowStep[];
  dependencies?: string[];
  timeout?: number;
  retryPolicy?: RetryPolicy;
  costEstimate?: number;
  safetyConstraints?: SafetyConstraint[];
}

export interface WorkflowAction {
  type: string;
  parameters: Record<string, any>;
  expectedDuration?: number;
  expectedCost?: number;
  requiredResources?: string[];
}

export interface WorkflowCondition {
  type: 'equals' | 'contains' | 'greater' | 'less' | 'exists' | 'custom';
  left: string | number | boolean;
  right?: string | number | boolean;
  customEvaluator?: (context: WorkflowContext) => boolean;
}

export interface WorkflowContext {
  variables: Record<string, any>;
  stepResults: Record<string, StepResult>;
  metadata: Record<string, any>;
  currentBudget: BudgetInfo;
  safetyState: SafetyState;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  description?: string;
  steps: WorkflowStep[];
  initialContext?: Partial<WorkflowContext>;
  budgetLimit?: BudgetInfo;
  safetyConstraints?: SafetyConstraint[];
  replayable?: boolean;
  metadata?: Record<string, any>;
}

export interface StepResult {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  result?: any;
  error?: Error;
  cost?: BudgetInfo;
  safetyViolations?: SafetyViolation[];
  metadata?: Record<string, any>;
}

export interface BudgetInfo {
  tokens?: number;
  computeTime?: number;
  memory?: number;
  apiCalls?: number;
  monetaryCost?: number;
  customMetrics?: Record<string, number>;
}

export interface SafetyConstraint {
  id: string;
  type: 'resource_limit' | 'execution_time' | 'rate_limit' | 'content_filter' | 'custom';
  description: string;
  parameters: Record<string, any>;
  severity: 'warning' | 'error' | 'critical';
  validator: (context: WorkflowContext, step: WorkflowStep) => SafetyViolation | null;
}

export interface SafetyViolation {
  constraintId: string;
  severity: 'warning' | 'error' | 'critical';
  message: string;
  timestamp: Date;
  stepId?: string;
  details?: Record<string, any>;
}

export interface SafetyState {
  violations: SafetyViolation[];
  activeConstraints: SafetyConstraint[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  lastCheck: Date;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number;
  maxDelay?: number;
  retryableErrors?: string[];
}

export interface ExecutionOutcome {
  workflowId: string;
  executionId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'timeout' | 'budget_exceeded' | 'safety_violation';
  startTime: Date;
  endTime: Date;
  duration: number;
  totalCost: BudgetInfo;
  stepResults: Record<string, StepResult>;
  safetyViolations: SafetyViolation[];
  hasViolations: boolean;
  violationFlags: {
    budgetExceeded: boolean;
    safetyViolated: boolean;
    timeoutReached: boolean;
    criticalError: boolean;
  };
  finalContext: WorkflowContext;
  metadata: Record<string, any>;
}

export interface Trajectory {
  executionId: string;
  workflowId: string;
  steps: TrajectoryStep[];
  totalDuration: number;
  totalCost: BudgetInfo;
  contextEvolution: WorkflowContext[];
  decisionPoints: DecisionPoint[];
  parallelBranches: ParallelBranch[];
  replayInfo: ReplayInfo;
}

export interface TrajectoryStep {
  stepId: string;
  sequence: number;
  timestamp: Date;
  action: string;
  parameters: Record<string, any>;
  result: StepResult;
  contextBefore: WorkflowContext;
  contextAfter: WorkflowContext;
  costIncurred: BudgetInfo;
  safetyChecks: SafetyCheck[];
}

export interface DecisionPoint {
  stepId: string;
  timestamp: Date;
  condition: WorkflowCondition;
  evaluationResult: boolean;
  context: WorkflowContext;
  alternativePaths: string[];
  chosenPath: string;
}

export interface ParallelBranch {
  branchId: string;
  parentStepId: string;
  steps: string[];
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed';
}

export interface SafetyCheck {
  constraintId: string;
  timestamp: Date;
  result: 'passed' | 'warning' | 'violation';
  details?: Record<string, any>;
}

export interface ReplayInfo {
  version: string;
  replayable: boolean;
  deterministicInputs: Record<string, any>;
  randomSeed?: number;
  environmentState: Record<string, any>;
  externalDependencies: ExternalDependency[];
  replayInstructions: ReplayInstruction[];
}

export interface ExternalDependency {
  type: 'api' | 'file' | 'database' | 'service';
  identifier: string;
  version?: string;
  checksum?: string;
  mockable: boolean;
}

export interface ReplayInstruction {
  stepId: string;
  instruction: 'use_recorded' | 'mock' | 'skip' | 'recalculate';
  data?: any;
  conditions?: Record<string, any>;
}

export interface ExecutionOptions {
  budgetLimit?: BudgetInfo;
  timeout?: number;
  parallelExecution?: boolean;
  enableSafetyChecks?: boolean;
  recordTrajectory?: boolean;
  enableReplay?: boolean;
  dryRun?: boolean;
  debugMode?: boolean;
  customValidators?: SafetyConstraint[];
}