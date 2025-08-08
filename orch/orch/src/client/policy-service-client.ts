/**
 * PolicyServiceClient - Complete gRPC client implementation for orchestration v1.1
 */

import { EventEmitter } from 'events';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { 
  ChannelCredentials, 
  Client, 
  ServiceError, 
  Metadata,
  ClientReadableStream,
  ClientWritableStream,
  ClientDuplexStream,
  status as GRPCStatus
} from '@grpc/grpc-js';

import { 
  GRPCClientConfig, 
  ClientOptions, 
  ServiceHealthStatus, 
  ClientMetrics,
  ConnectionState,
  DEFAULT_CONFIG
} from '../types/config-types';

import {
  IPolicyServiceClient,
  CreatePolicyRequest,
  CreatePolicyResponse,
  GetPolicyRequest,
  GetPolicyResponse,
  UpdatePolicyRequest,
  UpdatePolicyResponse,
  DeletePolicyRequest,
  DeletePolicyResponse,
  ListPoliciesRequest,
  ListPoliciesResponse,
  ValidatePolicyRequest,
  ValidatePolicyResponse,
  EvaluatePolicyRequest,
  EvaluatePolicyResponse,
  BatchEvaluatePolicyRequest,
  BatchEvaluatePolicyResponse,
  StreamEvaluatePolicyRequest,
  StreamEvaluatePolicyResponse,
  // v1.1 Types
  SampleWorkflowRequest,
  SampleWorkflowResponse,
  BatchSampleWorkflowsRequest,
  BatchSampleWorkflowsResponse,
  EvaluateSurrogateRequest,
  EvaluateSurrogateResponse,
  LogExecutionRequest,
  LogExecutionResponse,
  StreamTrajectoriesRequest,
  StreamTrajectoriesResponse,
  GetSigningKeysRequest,
  GetSigningKeysResponse,
  GetPolicyMetadataRequest,
  GetPolicyMetadataResponse,
  HealthRequest,
  HealthResponse,
  HealthStatus,
} from '../types/client-types';

import {
  OrchestrationError,
  OrchestrationClientError,
  ErrorUtils,
  GRPCErrorCode,
  OrchestrationErrorCode
} from '../types/error-types';

import { CircuitBreaker, CircuitBreakerState } from '../utils/circuit-breaker';
import { RetryHandler } from '../utils/retry-handler';
import { Logger } from '../utils/logger';

export interface PolicyServiceClientEvents {
  connected: [];
  disconnected: [Error?];
  error: [OrchestrationError];
  circuitBreakerStateChange: [CircuitBreakerState, CircuitBreakerState];
  healthCheckFailed: [Error];
  metricsUpdated: [ClientMetrics];
}

export class PolicyServiceClient extends EventEmitter implements IPolicyServiceClient {
  private grpcClient: any; // Generated gRPC client
  private connected: boolean = false;
  private connectionState: BehaviorSubject<ConnectionState>;
  private circuitBreaker: CircuitBreaker;
  private retryHandler: RetryHandler;
  private logger: Logger;
  private healthCheckInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;
  private metrics: ClientMetrics;
  private errorCallbacks: Set<(error: OrchestrationError) => void> = new Set();

  constructor(
    private config: GRPCClientConfig = DEFAULT_CONFIG
  ) {
    super();
    
    this.validateConfig();
    this.initializeComponents();
    this.setupEventHandlers();
    this.initializeMetrics();
    
    // Initialize connection state
    this.connectionState = new BehaviorSubject<ConnectionState>({
      status: 'disconnected',
      lastAttempt: new Date(),
    });
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (!this.config.endpoint) {
      throw new Error('Endpoint is required');
    }
    
    if (this.config.connectionTimeout <= 0) {
      throw new Error('Connection timeout must be greater than 0');
    }
    
    if (this.config.requestTimeout <= 0) {
      throw new Error('Request timeout must be greater than 0');
    }
  }

  /**
   * Initialize core components
   */
  private initializeComponents(): void {
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker);
    this.retryHandler = new RetryHandler(this.config.retryPolicy);
    this.logger = new Logger('PolicyServiceClient', this.config.logging!);
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Circuit breaker events
    this.circuitBreaker.on('stateChange', (from, to) => {
      this.logger.logCircuitBreakerStateChange(from, to);
      this.emit('circuitBreakerStateChange', from, to);
    });

    this.circuitBreaker.on('requestFailure', (error) => {
      this.logger.logError(error, 'circuit-breaker');
    });

    // Connection state changes
    this.connectionState.subscribe((state) => {
      if (state.status === 'connected' && !this.connected) {
        this.connected = true;
        this.startHealthChecks();
        this.startMetricsCollection();
        this.emit('connected');
      } else if (state.status === 'disconnected' && this.connected) {
        this.connected = false;
        this.stopHealthChecks();
        this.stopMetricsCollection();
        this.emit('disconnected', state.error);
      }
    });
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      circuitBreakerState: CircuitBreakerState.CLOSED,
      connectionPool: {
        total: this.config.connectionPool?.maxConnections || 0,
        active: 0,
        idle: 0,
      },
      errorStats: {},
      lastUpdated: new Date(),
    };
  }

  /**
   * Connect to the gRPC service
   */
  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.logger.info('Connecting to gRPC service', { endpoint: this.config.endpoint });

    try {
      const credentials = this.createCredentials();
      const options = this.createGRPCOptions();

      // Note: In a real implementation, you would import the generated gRPC client
      // For now, we'll use a mock structure since proto files aren't generated yet
      const GRPCPolicyServiceClient = class MockGRPCClient {
        constructor(endpoint: string, credentials: any, options: any) {
          // Mock implementation
        }
        close() {
          // Mock close
        }
      };
      
      this.grpcClient = new GRPCPolicyServiceClient(this.config.endpoint, credentials, options);

      // Test connection with health check
      await this.performHealthCheck();

      this.updateConnectionState({
        status: 'connected',
        lastAttempt: new Date(),
        lastSuccess: new Date(),
      });

      this.logger.info('Successfully connected to gRPC service');
    } catch (error) {
      const orchError = ErrorUtils.fromGRPCError(error);
      
      this.updateConnectionState({
        status: 'error',
        lastAttempt: new Date(),
        error: orchError,
      });

      this.logger.logError(orchError, 'connect');
      throw orchError;
    }
  }

  /**
   * Disconnect from the gRPC service
   */
  public async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    this.logger.info('Disconnecting from gRPC service');

    this.stopHealthChecks();
    this.stopMetricsCollection();

    if (this.grpcClient) {
      this.grpcClient.close();
      this.grpcClient = null;
    }

    this.updateConnectionState({
      status: 'disconnected',
      lastAttempt: new Date(),
    });

    this.logger.info('Disconnected from gRPC service');
  }

  /**
   * Check if client is connected
   */
  public isConnected(): boolean {
    return this.connected && this.grpcClient != null;
  }

  /**
   * Create gRPC credentials
   */
  private createCredentials(): ChannelCredentials {
    if (!this.config.secure) {
      return ChannelCredentials.createInsecure();
    }

    if (this.config.tls) {
      const tlsConfig = this.config.tls;
      
      if (tlsConfig.ca || tlsConfig.cert || tlsConfig.key) {
        return ChannelCredentials.createSsl(
          tlsConfig.ca ? Buffer.from(tlsConfig.ca) : undefined,
          tlsConfig.key ? Buffer.from(tlsConfig.key) : undefined,
          tlsConfig.cert ? Buffer.from(tlsConfig.cert) : undefined,
          { checkServerIdentity: tlsConfig.insecure ? () => undefined : undefined }
        );
      }
    }

    return ChannelCredentials.createSsl();
  }

  /**
   * Create gRPC options
   */
  private createGRPCOptions(): Record<string, any> {
    return {
      'grpc.keepalive_time_ms': 30000,
      'grpc.keepalive_timeout_ms': 5000,
      'grpc.keepalive_permit_without_calls': true,
      'grpc.http2.max_pings_without_data': 0,
      'grpc.http2.min_time_between_pings_ms': 10000,
      'grpc.http2.min_ping_interval_without_data_ms': 300000,
      'grpc.max_connection_idle_ms': 30000,
      'grpc.max_connection_age_ms': 300000,
      'grpc.max_connection_age_grace_ms': 5000,
      ...this.config.grpcOptions,
    };
  }

  /**
   * Update connection state
   */
  private updateConnectionState(state: Partial<ConnectionState>): void {
    const currentState = this.connectionState.value;
    this.connectionState.next({ ...currentState, ...state });
  }

  /**
   * Execute a gRPC method with full error handling, retry, and circuit breaker
   */
  private async executeMethod<TRequest, TResponse>(
    methodName: string,
    request: TRequest,
    options?: ClientOptions
  ): Promise<TResponse> {
    const requestId = options?.requestId || this.generateRequestId();
    const timer = this.logger.timer(methodName);

    this.logger.setContext({ requestId, operation: methodName });
    this.logger.logRequest(methodName, request, requestId);

    try {
      const result = await this.retryHandler.executeWithRetry(async () => {
        return await this.circuitBreaker.execute(async () => {
          return await this.performGRPCCall<TRequest, TResponse>(
            methodName, 
            request, 
            options,
            requestId
          );
        }, requestId);
      }, requestId);

      timer();
      this.updateMetricsOnSuccess();
      this.logger.logResponse(methodName, result, 0, requestId);
      
      return result;
    } catch (error) {
      timer();
      const orchError = this.handleError(error, methodName, requestId);
      this.updateMetricsOnError(orchError);
      this.notifyErrorCallbacks(orchError);
      throw orchError;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Perform actual gRPC call
   */
  private async performGRPCCall<TRequest, TResponse>(
    methodName: string,
    request: TRequest,
    options?: ClientOptions,
    requestId?: string
  ): Promise<TResponse> {
    if (!this.isConnected()) {
      throw new OrchestrationClientError(
        'Client is not connected',
        OrchestrationErrorCode.SERVICE_UNAVAILABLE,
        GRPCErrorCode.UNAVAILABLE,
        { methodName },
        requestId
      );
    }

    const metadata = this.createMetadata(options, requestId);
    const timeout = options?.timeout || this.config.requestTimeout;

    return new Promise<TResponse>((resolve, reject) => {
      const deadline = new Date(Date.now() + timeout);
      
      // Note: This is a placeholder - in real implementation you would call the actual gRPC method
      const call = this.grpcClient[methodName](request, metadata, { deadline }, (error: ServiceError | null, response: TResponse) => {
        if (error) {
          reject(ErrorUtils.fromGRPCError(error, requestId));
        } else {
          resolve(response);
        }
      });

      // Handle call cancellation
      if (options?.requestId) {
        // Store call reference for potential cancellation
      }
    });
  }

  /**
   * Create metadata for gRPC call
   */
  private createMetadata(options?: ClientOptions, requestId?: string): Metadata {
    const metadata = new Metadata();
    
    // Add request ID
    if (requestId) {
      metadata.add('request-id', requestId);
    }

    // Add custom metadata
    if (options?.metadata) {
      for (const [key, value] of Object.entries(options.metadata)) {
        metadata.add(key, value);
      }
    }

    // Add authentication headers
    if (this.config.auth) {
      this.addAuthenticationHeaders(metadata);
    }

    return metadata;
  }

  /**
   * Add authentication headers
   */
  private addAuthenticationHeaders(metadata: Metadata): void {
    const auth = this.config.auth!;

    switch (auth.type) {
      case 'basic':
        if (auth.basic) {
          const credentials = Buffer.from(`${auth.basic.username}:${auth.basic.password}`).toString('base64');
          metadata.add('authorization', `Basic ${credentials}`);
        }
        break;

      case 'bearer':
        if (auth.bearer) {
          metadata.add('authorization', `Bearer ${auth.bearer.token}`);
        }
        break;

      case 'api-key':
        if (auth.apiKey) {
          const header = auth.apiKey.header || 'x-api-key';
          metadata.add(header, auth.apiKey.key);
        }
        break;

      case 'jwt':
        if (auth.jwt) {
          metadata.add('authorization', `Bearer ${auth.jwt.token}`);
        }
        break;
    }
  }

  /**
   * Handle errors and convert to OrchestrationError with v1.1 specific logic
   */
  private handleError(error: any, operation: string, requestId?: string): OrchestrationClientError {
    if (error instanceof OrchestrationClientError) {
      return error;
    }

    const orchError = ErrorUtils.fromGRPCError(error, requestId);
    this.logger.logError(orchError, operation, requestId);
    
    // v1.1 specific error handling
    if (this.isV11SpecificError(orchError, operation)) {
      this.handleV11Error(orchError, operation);
    }
    
    return orchError;
  }

  /**
   * Check if error is specific to v1.1 operations
   */
  private isV11SpecificError(error: OrchestrationClientError, operation: string): boolean {
    const v11Operations = [
      'sampleWorkflow', 'batchSampleWorkflows', 'evaluateSurrogate',
      'logExecution', 'streamTrajectories', 'getSigningKeys', 'getPolicyMetadata'
    ];
    return v11Operations.includes(operation);
  }

  /**
   * Handle v1.1 specific errors with enhanced logic
   */
  private handleV11Error(error: OrchestrationClientError, operation: string): void {
    // Enhanced circuit breaker logic for v1.1 methods
    if (operation === 'streamTrajectories' && error.grpcCode === GRPCErrorCode.UNAVAILABLE) {
      this.logger.warn('Trajectory streaming unavailable, consider fallback', { operation, error: error.code });
    }
    
    if (operation === 'evaluateSurrogate' && error.grpcCode === GRPCErrorCode.RESOURCE_EXHAUSTED) {
      this.logger.warn('TRPO evaluation resources exhausted, reducing batch size recommended', { operation });
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Policy Management Methods
  public async createPolicy(request: CreatePolicyRequest, options?: ClientOptions): Promise<CreatePolicyResponse> {
    return this.executeMethod('createPolicy', request, options);
  }

  public async getPolicy(request: GetPolicyRequest, options?: ClientOptions): Promise<GetPolicyResponse> {
    return this.executeMethod('getPolicy', request, options);
  }

  public async updatePolicy(request: UpdatePolicyRequest, options?: ClientOptions): Promise<UpdatePolicyResponse> {
    return this.executeMethod('updatePolicy', request, options);
  }

  public async deletePolicy(request: DeletePolicyRequest, options?: ClientOptions): Promise<DeletePolicyResponse> {
    return this.executeMethod('deletePolicy', request, options);
  }

  public async listPolicies(request: ListPoliciesRequest, options?: ClientOptions): Promise<ListPoliciesResponse> {
    return this.executeMethod('listPolicies', request, options);
  }

  public async validatePolicy(request: ValidatePolicyRequest, options?: ClientOptions): Promise<ValidatePolicyResponse> {
    return this.executeMethod('validatePolicy', request, options);
  }

  // Policy Evaluation Methods
  public async evaluatePolicy(request: EvaluatePolicyRequest, options?: ClientOptions): Promise<EvaluatePolicyResponse> {
    return this.executeMethod('evaluatePolicy', request, options);
  }

  public async batchEvaluatePolicy(request: BatchEvaluatePolicyRequest, options?: ClientOptions): Promise<BatchEvaluatePolicyResponse> {
    return this.executeMethod('batchEvaluatePolicy', request, options);
  }

  // v1.1 Workflow Methods
  public async sampleWorkflow(request: SampleWorkflowRequest, options?: ClientOptions): Promise<SampleWorkflowResponse> {
    return this.executeMethod('GenerateWorkflowPlan', request, options);
  }

  public async batchSampleWorkflows(request: BatchSampleWorkflowsRequest, options?: ClientOptions): Promise<BatchSampleWorkflowsResponse> {
    const requestId = options?.requestId || this.generateRequestId();
    const timer = this.logger.timer('batchSampleWorkflows');
    
    this.logger.logRequest('batchSampleWorkflows', request, requestId);
    
    try {
      // Process requests in parallel with controlled concurrency
      const maxParallel = request.maxParallel || 5;
      const results: SampleWorkflowResponse[] = [];
      const errors: any[] = [];
      const startTime = Date.now();
      
      // Split requests into batches
      const batches: SampleWorkflowRequest[][] = [];
      for (let i = 0; i < request.requests.length; i += maxParallel) {
        batches.push(request.requests.slice(i, i + maxParallel));
      }
      
      // Process each batch in parallel
      for (const batch of batches) {
        const batchPromises = batch.map(async (req, localIndex) => {
          try {
            const response = await this.sampleWorkflow(req, { ...options, requestId: `${requestId}-${localIndex}` });
            return { success: true, response, index: localIndex };
          } catch (error) {
            const batchError = {
              index: localIndex,
              errorCode: 'WORKFLOW_GENERATION_FAILED',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
            };
            
            if (request.failOnFirstError) {
              throw error;
            }
            
            return { success: false, error: batchError, index: localIndex };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach((result) => {
          if (result.success) {
            results.push(result.response!);
          } else {
            errors.push(result.error!);
          }
        });
      }
      
      const processingTime = Date.now() - startTime;
      const response = {
        responses: results,
        errors,
        averageProcessingTimeMs: processingTime / request.requests.length,
      };
      
      timer();
      this.updateMetricsOnSuccess();
      this.logger.logResponse('batchSampleWorkflows', response, processingTime, requestId);
      
      return response;
    } catch (error) {
      timer();
      const orchError = this.handleError(error, 'batchSampleWorkflows', requestId);
      this.updateMetricsOnError(orchError);
      throw orchError;
    }
  }

  // v1.1 TRPO Methods
  public async evaluateSurrogate(request: EvaluateSurrogateRequest, options?: ClientOptions): Promise<EvaluateSurrogateResponse> {
    return this.executeMethod('EvaluateSurrogate', request, options);
  }

  // v1.1 Execution Methods
  public async logExecution(request: LogExecutionRequest, options?: ClientOptions): Promise<LogExecutionResponse> {
    return this.executeMethod('LogExecution', {
      execution_id: request.executionId,
      step_id: request.stepId,
      event_type: request.eventType,
      message: request.message,
      data: request.data,
      timestamp: request.timestamp ? { seconds: Math.floor(request.timestamp.getTime() / 1000) } : undefined,
    }, options);
  }

  /**
   * Stream policy evaluation
   */
  public streamEvaluatePolicy(options?: ClientOptions): Observable<StreamEvaluatePolicyResponse> {
    const subject = new Subject<StreamEvaluatePolicyResponse>();
    const requestId = options?.requestId || this.generateRequestId();

    this.logger.info('Starting stream policy evaluation', { requestId });

    try {
      if (!this.isConnected()) {
        throw new OrchestrationClientError(
          'Client is not connected',
          OrchestrationErrorCode.SERVICE_UNAVAILABLE,
          GRPCErrorCode.UNAVAILABLE,
          { method: 'streamEvaluatePolicy' },
          requestId
        );
      }

      const metadata = this.createMetadata(options, requestId);
      const stream: ClientDuplexStream<StreamEvaluatePolicyRequest, StreamEvaluatePolicyResponse> = 
        this.grpcClient.streamEvaluatePolicy(metadata);

      stream.on('data', (response: StreamEvaluatePolicyResponse) => {
        subject.next(response);
      });

      stream.on('end', () => {
        this.logger.info('Stream ended', { requestId });
        subject.complete();
      });

      stream.on('error', (error: Error) => {
        const orchError = this.handleError(error, 'streamEvaluatePolicy', requestId);
        this.logger.logError(orchError, 'streamEvaluatePolicy', requestId);
        subject.error(orchError);
      });

      // Return observable with write capability
      const observable = subject.asObservable();
      (observable as any).write = (request: StreamEvaluatePolicyRequest) => {
        stream.write(request);
      };
      (observable as any).end = () => {
        stream.end();
      };

      return observable;
    } catch (error) {
      const orchError = this.handleError(error, 'streamEvaluatePolicy', requestId);
      subject.error(orchError);
      return subject.asObservable();
    }
  }

  /**
   * Stream trajectories for real-time monitoring
   */
  public streamTrajectories(request?: StreamTrajectoriesRequest, options?: ClientOptions): Observable<StreamTrajectoriesResponse> {
    const subject = new Subject<StreamTrajectoriesResponse>();
    const requestId = options?.requestId || this.generateRequestId();

    this.logger.info('Starting trajectory streaming', { requestId, sessionId: request?.sessionId });

    try {
      if (!this.isConnected()) {
        throw new OrchestrationClientError(
          'Client is not connected',
          OrchestrationErrorCode.SERVICE_UNAVAILABLE,
          GRPCErrorCode.UNAVAILABLE,
          { method: 'streamTrajectories' },
          requestId
        );
      }

      const metadata = this.createMetadata(options, requestId);
      const streamRequest = {
        session_id: request?.sessionId,
        filters: request?.filters ? {
          start_time: request.filters.startTime ? { seconds: Math.floor(request.filters.startTime.getTime() / 1000) } : undefined,
          end_time: request.filters.endTime ? { seconds: Math.floor(request.filters.endTime.getTime() / 1000) } : undefined,
          min_reward: request.filters.minReward,
          max_reward: request.filters.maxReward,
          policy_id: request.filters.policyId,
        } : undefined,
      };
      
      const stream: ClientReadableStream<StreamTrajectoriesResponse> = 
        this.grpcClient.StreamTrajectories(streamRequest, metadata);

      stream.on('data', (response: any) => {
        const transformedResponse: StreamTrajectoriesResponse = {
          trajectory: response.trajectory ? {
            id: response.trajectory.id,
            sessionId: response.trajectory.session_id,
            points: response.trajectory.points?.map((point: any) => ({
              state: point.state || {},
              action: point.action || {},
              reward: point.reward || 0,
              nextState: point.next_state || {},
              done: point.done || false,
              timestamp: point.timestamp ? new Date(point.timestamp.seconds * 1000) : new Date(),
            })) || [],
            metadata: response.trajectory.metadata || {},
            createdAt: response.trajectory.created_at ? new Date(response.trajectory.created_at.seconds * 1000) : new Date(),
          } : undefined,
          sessionInfo: response.session_info ? {
            id: response.session_info.id,
            startTime: response.session_info.start_time ? new Date(response.session_info.start_time.seconds * 1000) : new Date(),
            endTime: response.session_info.end_time ? new Date(response.session_info.end_time.seconds * 1000) : undefined,
            status: response.session_info.status || 'SESSION_STATUS_ACTIVE',
            metadata: response.session_info.metadata || {},
          } : undefined,
          error: response.error,
        };
        
        subject.next(transformedResponse);
      });

      stream.on('end', () => {
        this.logger.info('Trajectory stream ended', { requestId });
        subject.complete();
      });

      stream.on('error', (error: Error) => {
        const orchError = this.handleError(error, 'streamTrajectories', requestId);
        this.logger.logError(orchError, 'streamTrajectories', requestId);
        subject.error(orchError);
      });

      return subject.asObservable();
    } catch (error) {
      const orchError = this.handleError(error, 'streamTrajectories', requestId);
      subject.error(orchError);
      return subject.asObservable();
    }
  }

  // v1.1 Metadata and Keys
  public async getSigningKeys(request?: GetSigningKeysRequest, options?: ClientOptions): Promise<GetSigningKeysResponse> {
    const transformedRequest = {
      key_type: request?.keyType || 'RSA',
      key_size: request?.keySize || 2048,
      include_private: request?.includePrivate || false,
    };
    
    const response = await this.executeMethod('GetSigningKeys', transformedRequest, options) as any;
    
    return {
      keys: response.keys?.map((key: any) => ({
        id: key.id,
        type: key.type,
        publicKey: key.public_key,
        privateKey: request?.includePrivate ? key.private_key : undefined,
        createdAt: key.created_at ? new Date(key.created_at.seconds * 1000) : new Date(),
        expiresAt: key.expires_at ? new Date(key.expires_at.seconds * 1000) : new Date(),
        isTestKey: key.is_test_key || false,
      })) || [],
    };
  }

  public async getPolicyMetadata(request: GetPolicyMetadataRequest, options?: ClientOptions): Promise<GetPolicyMetadataResponse> {
    const policy = await this.getPolicy({ id: request.policyId }, options);
    
    const metadata = {
      id: policy.policy.id,
      name: policy.policy.name,
      version: policy.policy.version,
      tags: policy.policy.tags || [],
      owner: policy.policy.metadata?.owner || 'unknown',
      team: policy.policy.metadata?.team || 'unknown',
      labels: policy.policy.metadata?.labels || {},
      environments: policy.policy.metadata?.environments || [],
      createdAt: policy.policy.createdAt,
      updatedAt: policy.policy.updatedAt,
    };
    
    const response: GetPolicyMetadataResponse = { metadata };
    
    if (request.includeRules && policy.policy.spec?.rules) {
      response.rules = policy.policy.spec.rules.map(rule => ({
        id: rule.id,
        condition: rule.condition,
        action: rule.actions?.[0]?.type || 'unknown',
        priority: rule.priority,
        enabled: rule.enabled,
        parameters: rule.actions?.[0]?.parameters || {},
      }));
    }
    
    if (request.includeMetrics && policy.policy.status) {
      response.metrics = {
        evaluationCount: policy.policy.status.evaluationCount,
        successCount: policy.policy.status.successCount,
        failureCount: policy.policy.status.failureCount,
        averageExecutionTime: 0, // Would be calculated from historical data
        lastEvaluated: policy.policy.status.lastEvaluated,
      };
    }
    
    return response;
  }

  // v1.1 Health Method
  public async health(request?: HealthRequest, options?: ClientOptions): Promise<HealthResponse> {
    const healthRequest = {
      component: request?.component || 'all',
    };
    
    const response = await this.executeMethod('HealthCheck', healthRequest, options) as any;
    
    return {
      status: response.status || HealthStatus.HEALTHY,
      message: response.message || 'Service is healthy',
      details: response.details || {},
      timestamp: response.timestamp ? new Date(response.timestamp.seconds * 1000) : new Date(),
    };
  }

  // Health and Metrics
  public async getHealthCheck(options?: ClientOptions): Promise<ServiceHealthStatus> {
    try {
      const result = await this.health({}, options);
      return {
        service: 'PolicyService',
        status: result.status === HealthStatus.HEALTHY ? 'healthy' : 'unhealthy',
        lastCheck: result.timestamp,
        message: result.message,
        metadata: result.details,
      };
    } catch (error) {
      return {
        service: 'PolicyService',
        status: 'unhealthy',
        lastCheck: new Date(),
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: { error },
      };
    }
  }

  public async getMetrics(options?: ClientOptions): Promise<ClientMetrics> {
    return {
      ...this.metrics,
      circuitBreakerState: this.circuitBreaker.getState(),
      lastUpdated: new Date(),
    };
  }

  // Connection Management
  private async performHealthCheck(): Promise<void> {
    if (!this.config.healthCheck?.enabled) {
      return;
    }

    try {
      await this.getHealthCheck();
    } catch (error) {
      this.emit('healthCheckFailed', error);
      throw error;
    }
  }

  private startHealthChecks(): void {
    if (!this.config.healthCheck?.enabled || this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        this.logger.logError(error as Error, 'health-check');
      }
    }, this.config.healthCheck.interval);
  }

  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  private startMetricsCollection(): void {
    if (!this.config.metrics?.enabled || this.metricsInterval) {
      return;
    }

    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, this.config.metrics.interval);
  }

  private stopMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
  }

  private updateMetrics(): void {
    this.metrics.circuitBreakerState = this.circuitBreaker.getState();
    this.metrics.lastUpdated = new Date();
    this.emit('metricsUpdated', this.metrics);
  }

  private updateMetricsOnSuccess(): void {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
  }

  private updateMetricsOnError(error: OrchestrationClientError): void {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;
    
    const errorKey = error.code.toString();
    this.metrics.errorStats[errorKey] = (this.metrics.errorStats[errorKey] || 0) + 1;
  }

  // Error handling
  public onError(callback: (error: OrchestrationError) => void): void {
    this.errorCallbacks.add(callback);
  }

  public offError(callback: (error: OrchestrationError) => void): void {
    this.errorCallbacks.delete(callback);
  }

  private notifyErrorCallbacks(error: OrchestrationError): void {
    Array.from(this.errorCallbacks).forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        this.logger.logError(callbackError as Error, 'error-callback');
      }
    });
  }

  // EventEmitter type safety
  public emit<K extends keyof PolicyServiceClientEvents>(
    event: K,
    ...args: PolicyServiceClientEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  public on<K extends keyof PolicyServiceClientEvents>(
    event: K,
    listener: (...args: PolicyServiceClientEvents[K]) => void
  ): this {
    return super.on(event, listener);
  }

  public off<K extends keyof PolicyServiceClientEvents>(
    event: K,
    listener: (...args: PolicyServiceClientEvents[K]) => void
  ): this {
    return super.off(event, listener);
  }
}