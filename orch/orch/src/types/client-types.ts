/**
 * Client-specific types for the gRPC orchestration service
 */

import { Observable } from 'rxjs';
import { ClientOptions, ServiceHealthStatus, ClientMetrics } from './config-types';
import { OrchestrationError } from './error-types';

// Forward declarations
export interface PolicyMetadata {
  id: string;
  name: string;
  version: string;
  tags: string[];
  owner: string;
  team: string;
  labels: Record<string, string>;
  environments: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Re-export proto types - these would be generated from the .proto file
export interface Policy {
  id: string;
  name: string;
  description: string;
  spec: PolicySpec;
  status: PolicyStatus;
  createdAt: Date;
  updatedAt: Date;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  version: string;
  tags?: string[];
  metadata?: PolicyMetadata;
}

export interface PolicySpec {
  rules: Rule[];
  config: PolicyConfig;
  dependencies: string[];
  variables: Record<string, any>;
}

export interface Rule {
  id: string;
  name: string;
  condition: string;
  actions: Action[];
  priority: number;
  enabled: boolean;
  metadata: Record<string, string>;
}

export interface Action {
  type: string;
  parameters: Record<string, any>;
  target: string;
  retryPolicy: RetryPolicy;
}

export interface PolicyConfig {
  timeout: number;
  maxRetries: number;
  retryPolicy: RetryPolicy;
  circuitBreaker: CircuitBreakerConfig;
  settings: Record<string, any>;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: ErrorCode[];
  nonRetryableErrors: ErrorCode[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  timeout: number;
  recoveryThreshold: number;
  recoveryTimeout: number;
  enabled: boolean;
}

export interface PolicyStatus {
  state: PolicyState;
  message: string;
  lastEvaluated: Date;
  evaluationCount: number;
  successCount: number;
  failureCount: number;
  conditions: PolicyCondition[];
}

export interface PolicyCondition {
  type: string;
  status: ConditionStatus;
  reason: string;
  message: string;
  lastTransitionTime: Date;
}

export interface Orchestration {
  id: string;
  name: string;
  description: string;
  spec: OrchestrationSpec;
  status: OrchestrationStatus;
  createdAt: Date;
  updatedAt: Date;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  version: string;
}

export interface OrchestrationSpec {
  steps: Step[];
  config: OrchestrationConfig;
  variables: Record<string, any>;
  dependencies: string[];
  triggers: TriggerSpec;
}

export interface Step {
  id: string;
  name: string;
  type: string;
  parameters: Record<string, any>;
  dependsOn: string[];
  config: StepConfig;
  outputs: Record<string, string>;
  conditions: ConditionalExecution[];
}

export interface StepConfig {
  timeout: number;
  retryPolicy: RetryPolicy;
  allowFailure: boolean;
  settings: Record<string, any>;
}

export interface ConditionalExecution {
  condition: string;
  actions: Action[];
}

export interface TriggerSpec {
  triggers: Trigger[];
}

export interface Trigger {
  type: string;
  config: Record<string, any>;
  enabled: boolean;
}

export interface OrchestrationConfig {
  executionMode: ExecutionMode;
  timeout: number;
  maxParallelExecutions: number;
  resourceLimits: ResourceLimits;
  settings: Record<string, any>;
}

export interface ResourceLimits {
  memoryLimit: number;
  cpuLimit: number;
  diskLimit: number;
  networkLimit: number;
}

export interface OrchestrationStatus {
  state: OrchestrationState;
  message: string;
  lastExecuted: Date;
  executionCount: number;
  successCount: number;
  failureCount: number;
  conditions: OrchestrationCondition[];
  currentExecution: ExecutionSummary;
}

export interface OrchestrationCondition {
  type: string;
  status: ConditionStatus;
  reason: string;
  message: string;
  lastTransitionTime: Date;
}

export interface ExecutionSummary {
  executionId: string;
  state: ExecutionState;
  startedAt: Date;
  completedAt: Date;
  completedSteps: number;
  totalSteps: number;
  currentStep: string;
}

export interface Execution {
  id: string;
  orchestrationId: string;
  state: ExecutionState;
  startedAt: Date;
  completedAt: Date;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  steps: StepExecution[];
  metrics: ExecutionMetrics;
  errorMessage: string;
  labels: Record<string, string>;
}

export interface StepExecution {
  stepId: string;
  name: string;
  state: ExecutionState;
  startedAt: Date;
  completedAt: Date;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  errorMessage: string;
  retryCount: number;
  metrics: StepMetrics;
}

export interface ExecutionMetrics {
  totalDuration: number;
  memoryUsage: number;
  cpuUsage: number;
  networkCalls: number;
  customMetrics: Record<string, number>;
}

export interface StepMetrics {
  duration: number;
  memoryUsage: number;
  cpuUsage: number;
  networkCalls: number;
  customMetrics: Record<string, number>;
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  spec: Record<string, any>;
  status: ResourceStatus;
  createdAt: Date;
  updatedAt: Date;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

export interface ResourceStatus {
  state: ResourceState;
  message: string;
  data: Record<string, any>;
  conditions: ResourceCondition[];
}

export interface ResourceCondition {
  type: string;
  status: ConditionStatus;
  reason: string;
  message: string;
  lastTransitionTime: Date;
}

// Enums
export enum PolicyState {
  UNSPECIFIED = 'UNSPECIFIED',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DRAFT = 'DRAFT',
  ARCHIVED = 'ARCHIVED',
  ERROR = 'ERROR',
}

export enum OrchestrationState {
  UNSPECIFIED = 'UNSPECIFIED',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DRAFT = 'DRAFT',
  ARCHIVED = 'ARCHIVED',
  ERROR = 'ERROR',
}

export enum ExecutionState {
  UNSPECIFIED = 'UNSPECIFIED',
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMEOUT = 'TIMEOUT',
  PAUSED = 'PAUSED',
}

export enum ResourceState {
  UNSPECIFIED = 'UNSPECIFIED',
  AVAILABLE = 'AVAILABLE',
  IN_USE = 'IN_USE',
  UNAVAILABLE = 'UNAVAILABLE',
  ERROR = 'ERROR',
  PENDING = 'PENDING',
}

export enum ConditionStatus {
  UNSPECIFIED = 'UNSPECIFIED',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  UNKNOWN = 'UNKNOWN',
}

export enum ExecutionMode {
  UNSPECIFIED = 'UNSPECIFIED',
  SEQUENTIAL = 'SEQUENTIAL',
  PARALLEL = 'PARALLEL',
  MIXED = 'MIXED',
}

export enum HealthStatus {
  UNSPECIFIED = 'UNSPECIFIED',
  HEALTHY = 'HEALTHY',
  UNHEALTHY = 'UNHEALTHY',
  DEGRADED = 'DEGRADED',
  UNKNOWN = 'UNKNOWN',
}

export enum LogLevel {
  UNSPECIFIED = 'UNSPECIFIED',
  TRACE = 'TRACE',
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

export enum ErrorCode {
  UNSPECIFIED = 'UNSPECIFIED',
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  INSUFFICIENT_RESOURCES = 'INSUFFICIENT_RESOURCES',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  CIRCUIT_BREAKER_HALF_OPEN = 'CIRCUIT_BREAKER_HALF_OPEN',
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',
  RETRY_LIMIT_EXCEEDED = 'RETRY_LIMIT_EXCEEDED',
}

// Request/Response interfaces
export interface CreatePolicyRequest {
  policy: Policy;
  validateOnly?: boolean;
}

export interface CreatePolicyResponse {
  policy: Policy;
  validationErrors: ValidationError[];
}

export interface GetPolicyRequest {
  id: string;
  version?: string;
}

export interface GetPolicyResponse {
  policy: Policy;
}

export interface UpdatePolicyRequest {
  policy: Policy;
  validateOnly?: boolean;
  updateMask?: string;
}

export interface UpdatePolicyResponse {
  policy: Policy;
  validationErrors: ValidationError[];
}

export interface DeletePolicyRequest {
  id: string;
  force?: boolean;
}

export interface DeletePolicyResponse {
  success: boolean;
  message: string;
}

export interface ListPoliciesRequest {
  filter?: string;
  pageSize?: number;
  pageToken?: string;
  orderBy?: string;
  labels?: Record<string, string>;
}

export interface ListPoliciesResponse {
  policies: Policy[];
  nextPageToken: string;
  totalCount: number;
}

export interface ValidatePolicyRequest {
  policy: Policy;
  strictMode?: boolean;
}

export interface ValidatePolicyResponse {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface EvaluatePolicyRequest {
  policyId: string;
  context: Record<string, any>;
  inputs: Record<string, any>;
  options?: EvaluationOptions;
}

export interface EvaluatePolicyResponse {
  result: boolean;
  actions: ActionResult[];
  metrics: EvaluationMetrics;
  traceId: string;
  ruleEvaluations: RuleEvaluation[];
}

export interface BatchEvaluatePolicyRequest {
  requests: EvaluatePolicyRequest[];
  options?: BatchOptions;
}

export interface BatchEvaluatePolicyResponse {
  responses: EvaluatePolicyResponse[];
  metrics: BatchMetrics;
}

export interface ValidationError {
  field: string;
  message: string;
  code: ErrorCode;
  details: Record<string, string>;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
  details: Record<string, string>;
}

export interface ActionResult {
  actionType: string;
  success: boolean;
  message: string;
  result: Record<string, any>;
  duration: number;
}

export interface EvaluationMetrics {
  duration: number;
  rulesEvaluated: number;
  actionsExecuted: number;
  customMetrics: Record<string, number>;
}

export interface RuleEvaluation {
  ruleId: string;
  result: boolean;
  condition: string;
  duration: number;
  errorMessage: string;
}

export interface EvaluationOptions {
  traceEnabled?: boolean;
  timeout?: number;
  metadata?: Record<string, string>;
}

export interface BatchOptions {
  maxParallel?: number;
  timeout?: number;
  failFast?: boolean;
}

export interface BatchMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalDuration: number;
  averageDuration: number;
}

// Stream types
export interface StreamEvaluatePolicyRequest {
  evaluate?: EvaluatePolicyRequest;
  control?: StreamControlMessage;
}

export interface StreamEvaluatePolicyResponse {
  result?: EvaluatePolicyResponse;
  status?: StreamStatusMessage;
  error?: StreamErrorMessage;
}

export interface StreamControlMessage {
  type: StreamControlType;
  parameters?: Record<string, any>;
}

export interface StreamStatusMessage {
  status: StreamStatus;
  message: string;
  metadata?: Record<string, any>;
}

export interface StreamErrorMessage {
  code: ErrorCode;
  message: string;
  details?: Record<string, string>;
}

export enum StreamControlType {
  UNSPECIFIED = 'UNSPECIFIED',
  PAUSE = 'PAUSE',
  RESUME = 'RESUME',
  CANCEL = 'CANCEL',
  CONFIGURE = 'CONFIGURE',
}

export enum StreamStatus {
  UNSPECIFIED = 'UNSPECIFIED',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

// v1.1 New Types
export interface SampleWorkflowRequest {
  complexity?: WorkflowComplexity;
  parameters?: Record<string, any>;
  constraints?: WorkflowConstraints;
}

export interface SampleWorkflowResponse {
  plan: WorkflowPlan;
  recommendations: string[];
  confidenceScore: number;
}

export interface BatchSampleWorkflowsRequest {
  requests: SampleWorkflowRequest[];
  failOnFirstError?: boolean;
  maxParallel?: number;
}

export interface BatchSampleWorkflowsResponse {
  responses: SampleWorkflowResponse[];
  errors: BatchError[];
  averageProcessingTimeMs: number;
}

export interface EvaluateSurrogateRequest {
  trajectory: TrajectoryPoint[];
  returnDetailedMetrics?: boolean;
}

export interface EvaluateSurrogateResponse {
  surrogateLoss: number;
  klDivergence: number;
  policyEntropy: number;
  advantageVariance: number;
  actionProbabilities: number[];
  detailedMetrics?: TRPOMetrics;
}

export interface LogExecutionRequest {
  executionId: string;
  stepId?: string;
  eventType: ExecutionEventType;
  message: string;
  data?: Record<string, any>;
  timestamp?: Date;
}

export interface LogExecutionResponse {
  success: boolean;
  logId: string;
}

export interface StreamTrajectoriesRequest {
  sessionId?: string;
  filters?: TrajectoryFilters;
}

export interface StreamTrajectoriesResponse {
  trajectory?: TrajectoryData;
  sessionInfo?: SessionInfo;
  error?: StreamErrorMessage;
}

export interface GetSigningKeysRequest {
  keyType?: string;
  keySize?: number;
  includePrivate?: boolean;
}

export interface GetSigningKeysResponse {
  keys: SigningKey[];
}

export interface GetPolicyMetadataRequest {
  policyId: string;
  includeRules?: boolean;
  includeMetrics?: boolean;
}

export interface GetPolicyMetadataResponse {
  metadata: PolicyMetadata;
  rules?: PolicyRule[];
  metrics?: PolicyMetrics;
}

export interface HealthRequest {
  component?: string;
}

export interface HealthResponse {
  status: HealthStatus;
  message: string;
  details: Record<string, string>;
  timestamp: Date;
}

// Supporting types
export enum WorkflowComplexity {
  SIMPLE = 'WORKFLOW_COMPLEXITY_SIMPLE',
  MODERATE = 'WORKFLOW_COMPLEXITY_MODERATE',
  COMPLEX = 'WORKFLOW_COMPLEXITY_COMPLEX',
  ENTERPRISE = 'WORKFLOW_COMPLEXITY_ENTERPRISE',
}

export interface WorkflowConstraints {
  maxSteps?: number;
  maxDurationSeconds?: number;
  resourceLimits?: ResourceLimits;
}

export interface WorkflowPlan {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  parameters: Record<string, any>;
  createdAt: Date;
  status: WorkflowStatus;
  estimatedDurationSeconds: number;
}

export interface WorkflowStep {
  id: string;
  name: string;
  action: string;
  parameters: Record<string, any>;
  dependencies: string[];
  timeoutSeconds: number;
  parallelExecution: boolean;
  status: WorkflowStepStatus;
  result: string;
  startedAt?: Date;
  completedAt?: Date;
}

export enum WorkflowStatus {
  PENDING = 'WORKFLOW_STATUS_PENDING',
  RUNNING = 'WORKFLOW_STATUS_RUNNING',
  COMPLETED = 'WORKFLOW_STATUS_COMPLETED',
  FAILED = 'WORKFLOW_STATUS_FAILED',
  CANCELLED = 'WORKFLOW_STATUS_CANCELLED',
}

export enum WorkflowStepStatus {
  PENDING = 'WORKFLOW_STEP_STATUS_PENDING',
  RUNNING = 'WORKFLOW_STEP_STATUS_RUNNING',
  COMPLETED = 'WORKFLOW_STEP_STATUS_COMPLETED',
  FAILED = 'WORKFLOW_STEP_STATUS_FAILED',
  SKIPPED = 'WORKFLOW_STEP_STATUS_SKIPPED',
}

export interface TrajectoryPoint {
  state: Record<string, any>;
  action: Record<string, any>;
  reward: number;
  nextState: Record<string, any>;
  done: boolean;
  timestamp: Date;
}

export interface TRPOMetrics {
  policyLoss: number;
  valueLoss: number;
  entropyLoss: number;
  klDivergence: number;
  advantageMean: number;
  advantageStd: number;
  explainedVariance: number;
  gradientNorm: number;
  trajectoryLength: number;
  rewardDistribution: number[];
}

export enum ExecutionEventType {
  START = 'EXECUTION_EVENT_START',
  STEP_START = 'EXECUTION_EVENT_STEP_START',
  STEP_END = 'EXECUTION_EVENT_STEP_END',
  ERROR = 'EXECUTION_EVENT_ERROR',
  WARNING = 'EXECUTION_EVENT_WARNING',
  END = 'EXECUTION_EVENT_END',
}

export interface TrajectoryFilters {
  startTime?: Date;
  endTime?: Date;
  minReward?: number;
  maxReward?: number;
  policyId?: string;
}

export interface TrajectoryData {
  id: string;
  sessionId: string;
  points: TrajectoryPoint[];
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface SessionInfo {
  id: string;
  startTime: Date;
  endTime?: Date;
  status: SessionStatus;
  metadata: Record<string, any>;
}

export enum SessionStatus {
  ACTIVE = 'SESSION_STATUS_ACTIVE',
  COMPLETED = 'SESSION_STATUS_COMPLETED',
  TERMINATED = 'SESSION_STATUS_TERMINATED',
  ERROR = 'SESSION_STATUS_ERROR',
}

export interface SigningKey {
  id: string;
  type: string;
  publicKey: string;
  privateKey?: string;
  createdAt: Date;
  expiresAt: Date;
  isTestKey: boolean;
}

export interface PolicyRule {
  id: string;
  condition: string;
  action: string;
  priority: number;
  enabled: boolean;
  parameters: Record<string, any>;
}

export interface PolicyMetrics {
  evaluationCount: number;
  successCount: number;
  failureCount: number;
  averageExecutionTime: number;
  lastEvaluated: Date;
}

export interface BatchError {
  index: number;
  errorCode: string;
  errorMessage: string;
}

// Client interface
export interface IPolicyServiceClient {
  // Policy Management
  createPolicy(request: CreatePolicyRequest, options?: ClientOptions): Promise<CreatePolicyResponse>;
  getPolicy(request: GetPolicyRequest, options?: ClientOptions): Promise<GetPolicyResponse>;
  updatePolicy(request: UpdatePolicyRequest, options?: ClientOptions): Promise<UpdatePolicyResponse>;
  deletePolicy(request: DeletePolicyRequest, options?: ClientOptions): Promise<DeletePolicyResponse>;
  listPolicies(request: ListPoliciesRequest, options?: ClientOptions): Promise<ListPoliciesResponse>;
  validatePolicy(request: ValidatePolicyRequest, options?: ClientOptions): Promise<ValidatePolicyResponse>;

  // Policy Evaluation
  evaluatePolicy(request: EvaluatePolicyRequest, options?: ClientOptions): Promise<EvaluatePolicyResponse>;
  batchEvaluatePolicy(request: BatchEvaluatePolicyRequest, options?: ClientOptions): Promise<BatchEvaluatePolicyResponse>;
  streamEvaluatePolicy(options?: ClientOptions): Observable<StreamEvaluatePolicyResponse>;

  // v1.1 Workflow Methods
  sampleWorkflow(request: SampleWorkflowRequest, options?: ClientOptions): Promise<SampleWorkflowResponse>;
  batchSampleWorkflows(request: BatchSampleWorkflowsRequest, options?: ClientOptions): Promise<BatchSampleWorkflowsResponse>;

  // v1.1 TRPO Methods
  evaluateSurrogate(request: EvaluateSurrogateRequest, options?: ClientOptions): Promise<EvaluateSurrogateResponse>;

  // v1.1 Execution Methods
  logExecution(request: LogExecutionRequest, options?: ClientOptions): Promise<LogExecutionResponse>;
  streamTrajectories(request?: StreamTrajectoriesRequest, options?: ClientOptions): Observable<StreamTrajectoriesResponse>;

  // v1.1 Metadata and Keys
  getSigningKeys(request?: GetSigningKeysRequest, options?: ClientOptions): Promise<GetSigningKeysResponse>;
  getPolicyMetadata(request: GetPolicyMetadataRequest, options?: ClientOptions): Promise<GetPolicyMetadataResponse>;

  // Health and Metrics
  health(request?: HealthRequest, options?: ClientOptions): Promise<HealthResponse>;
  getHealthCheck(options?: ClientOptions): Promise<ServiceHealthStatus>;
  getMetrics(options?: ClientOptions): Promise<ClientMetrics>;

  // Connection Management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // Error Handling
  onError(callback: (error: OrchestrationError) => void): void;
  offError(callback: (error: OrchestrationError) => void): void;
}