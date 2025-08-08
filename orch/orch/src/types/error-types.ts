/**
 * Error types and codes for the gRPC orchestration client
 */

export enum GRPCErrorCode {
  // Standard gRPC status codes
  OK = 0,
  CANCELLED = 1,
  UNKNOWN = 2,
  INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4,
  NOT_FOUND = 5,
  ALREADY_EXISTS = 6,
  PERMISSION_DENIED = 7,
  RESOURCE_EXHAUSTED = 8,
  FAILED_PRECONDITION = 9,
  ABORTED = 10,
  OUT_OF_RANGE = 11,
  UNIMPLEMENTED = 12,
  INTERNAL = 13,
  UNAVAILABLE = 14,
  DATA_LOSS = 15,
  UNAUTHENTICATED = 16,
}

export enum OrchestrationErrorCode {
  // Client errors (4xx equivalent) - RETRYABLE
  INVALID_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  VALIDATION_FAILED = 422,
  TOO_MANY_REQUESTS = 429,
  
  // Server errors (5xx equivalent) - RETRYABLE
  INTERNAL_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  SERVICE_UNAVAILABLE = 503,
  TIMEOUT = 504,
  INSUFFICIENT_RESOURCES = 507,
  
  // Circuit breaker specific - NON-RETRYABLE
  CIRCUIT_BREAKER_OPEN = 1000,
  CIRCUIT_BREAKER_HALF_OPEN = 1001,
  
  // Retry specific - NON-RETRYABLE
  RETRY_EXHAUSTED = 1100,
  RETRY_LIMIT_EXCEEDED = 1101,
  
  // Policy specific - DEPENDS ON CONTEXT
  POLICY_EVALUATION_FAILED = 2000,
  POLICY_NOT_FOUND = 2001,
  POLICY_DISABLED = 2002,
  
  // Orchestration specific - DEPENDS ON CONTEXT
  ORCHESTRATION_FAILED = 3000,
  STEP_FAILED = 3001,
  DEPENDENCY_FAILED = 3002,
  
  // v1.1 Workflow specific - RETRYABLE
  WORKFLOW_GENERATION_FAILED = 3100,
  WORKFLOW_EXECUTION_FAILED = 3101,
  WORKFLOW_STEP_TIMEOUT = 3102,
  
  // v1.1 TRPO specific - DEPENDS ON CONTEXT
  TRPO_EVALUATION_FAILED = 3200,
  TRAJECTORY_INVALID = 3201,
  SURROGATE_COMPUTATION_FAILED = 3202,
  
  // v1.1 Streaming specific - RETRYABLE
  STREAM_UNAVAILABLE = 3300,
  STREAM_BUFFER_FULL = 3301,
  STREAM_CONNECTION_LOST = 3302,
  
  // v1.1 Cryptographic specific - NON-RETRYABLE
  SIGNING_KEY_NOT_FOUND = 3400,
  SIGNATURE_INVALID = 3401,
  KEY_GENERATION_FAILED = 3402,
  
  // Resource specific - RETRYABLE
  RESOURCE_UNAVAILABLE = 4000,
  RESOURCE_LOCKED = 4001,
  RESOURCE_QUOTA_EXCEEDED = 4002,
}

/**
 * Error codes that should trigger retries
 */
export const RETRYABLE_ERROR_CODES: Set<OrchestrationErrorCode> = new Set([
  OrchestrationErrorCode.TOO_MANY_REQUESTS,
  OrchestrationErrorCode.INTERNAL_ERROR,
  OrchestrationErrorCode.SERVICE_UNAVAILABLE,
  OrchestrationErrorCode.TIMEOUT,
  OrchestrationErrorCode.INSUFFICIENT_RESOURCES,
  OrchestrationErrorCode.RESOURCE_UNAVAILABLE,
  OrchestrationErrorCode.RESOURCE_LOCKED,
  OrchestrationErrorCode.RESOURCE_QUOTA_EXCEEDED,
  // v1.1 specific retryable errors
  OrchestrationErrorCode.WORKFLOW_GENERATION_FAILED,
  OrchestrationErrorCode.WORKFLOW_EXECUTION_FAILED,
  OrchestrationErrorCode.WORKFLOW_STEP_TIMEOUT,
  OrchestrationErrorCode.STREAM_UNAVAILABLE,
  OrchestrationErrorCode.STREAM_BUFFER_FULL,
  OrchestrationErrorCode.STREAM_CONNECTION_LOST,
]);

/**
 * Error codes that should trigger fallback mechanisms
 */
export const FALLBACK_ERROR_CODES: Set<OrchestrationErrorCode> = new Set([
  OrchestrationErrorCode.CIRCUIT_BREAKER_OPEN,
  OrchestrationErrorCode.CIRCUIT_BREAKER_HALF_OPEN,
  OrchestrationErrorCode.RETRY_EXHAUSTED,
  OrchestrationErrorCode.RETRY_LIMIT_EXCEEDED,
  OrchestrationErrorCode.POLICY_DISABLED,
  OrchestrationErrorCode.NOT_IMPLEMENTED,
  // v1.1 specific fallback-eligible errors
  OrchestrationErrorCode.TRPO_EVALUATION_FAILED,
  OrchestrationErrorCode.SURROGATE_COMPUTATION_FAILED,
]);

/**
 * Error codes that indicate permanent failures (no retry, no fallback)
 */
export const PERMANENT_ERROR_CODES: Set<OrchestrationErrorCode> = new Set([
  OrchestrationErrorCode.INVALID_REQUEST,
  OrchestrationErrorCode.UNAUTHORIZED,
  OrchestrationErrorCode.FORBIDDEN,
  OrchestrationErrorCode.NOT_FOUND,
  OrchestrationErrorCode.CONFLICT,
  OrchestrationErrorCode.VALIDATION_FAILED,
  // v1.1 specific permanent errors
  OrchestrationErrorCode.TRAJECTORY_INVALID,
  OrchestrationErrorCode.SIGNING_KEY_NOT_FOUND,
  OrchestrationErrorCode.SIGNATURE_INVALID,
  OrchestrationErrorCode.KEY_GENERATION_FAILED,
]);

export interface OrchestrationError extends Error {
  code: OrchestrationErrorCode;
  grpcCode?: GRPCErrorCode;
  details?: Record<string, any>;
  retryable: boolean;
  fallbackEligible: boolean;
  permanent: boolean;
  timestamp: Date;
  requestId?: string;
}

export class OrchestrationClientError extends Error implements OrchestrationError {
  public readonly code: OrchestrationErrorCode;
  public readonly grpcCode?: GRPCErrorCode;
  public readonly details?: Record<string, any>;
  public readonly retryable: boolean;
  public readonly fallbackEligible: boolean;
  public readonly permanent: boolean;
  public readonly timestamp: Date;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: OrchestrationErrorCode,
    grpcCode?: GRPCErrorCode,
    details?: Record<string, any>,
    requestId?: string
  ) {
    super(message);
    this.name = 'OrchestrationClientError';
    this.code = code;
    this.grpcCode = grpcCode;
    this.details = details;
    this.requestId = requestId;
    this.timestamp = new Date();
    
    // Determine error behavior based on code
    this.retryable = RETRYABLE_ERROR_CODES.has(code);
    this.fallbackEligible = FALLBACK_ERROR_CODES.has(code);
    this.permanent = PERMANENT_ERROR_CODES.has(code);
    
    // Set prototype for proper instanceof checks
    Object.setPrototypeOf(this, OrchestrationClientError.prototype);
  }

  public toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      grpcCode: this.grpcCode,
      details: this.details,
      retryable: this.retryable,
      fallbackEligible: this.fallbackEligible,
      permanent: this.permanent,
      timestamp: this.timestamp.toISOString(),
      requestId: this.requestId,
      stack: this.stack,
    };
  }
}

export interface CircuitBreakerError extends OrchestrationError {
  state: 'OPEN' | 'HALF_OPEN' | 'CLOSED';
  failureCount: number;
  lastFailureTime: Date;
  nextAttemptTime: Date;
}

export class CircuitBreakerOpenError extends OrchestrationClientError implements CircuitBreakerError {
  public readonly state: 'OPEN' | 'HALF_OPEN' | 'CLOSED';
  public readonly failureCount: number;
  public readonly lastFailureTime: Date;
  public readonly nextAttemptTime: Date;

  constructor(
    failureCount: number,
    lastFailureTime: Date,
    nextAttemptTime: Date,
    requestId?: string
  ) {
    super(
      `Circuit breaker is OPEN. ${failureCount} consecutive failures. Next attempt at ${nextAttemptTime.toISOString()}`,
      OrchestrationErrorCode.CIRCUIT_BREAKER_OPEN,
      GRPCErrorCode.UNAVAILABLE,
      { failureCount, lastFailureTime, nextAttemptTime },
      requestId
    );
    
    this.name = 'CircuitBreakerOpenError';
    this.state = 'OPEN';
    this.failureCount = failureCount;
    this.lastFailureTime = lastFailureTime;
    this.nextAttemptTime = nextAttemptTime;
  }
}

export interface RetryExhaustedError extends OrchestrationError {
  attempts: number;
  maxAttempts: number;
  totalDuration: number;
  lastError: OrchestrationError;
}

export class RetryExhaustedClientError extends OrchestrationClientError implements RetryExhaustedError {
  public readonly attempts: number;
  public readonly maxAttempts: number;
  public readonly totalDuration: number;
  public readonly lastError: OrchestrationError;

  constructor(
    attempts: number,
    maxAttempts: number,
    totalDuration: number,
    lastError: OrchestrationError,
    requestId?: string
  ) {
    super(
      `Retry attempts exhausted: ${attempts}/${maxAttempts} over ${totalDuration}ms. Last error: ${lastError.message}`,
      OrchestrationErrorCode.RETRY_EXHAUSTED,
      lastError.grpcCode,
      { attempts, maxAttempts, totalDuration, lastError },
      requestId
    );
    
    this.name = 'RetryExhaustedClientError';
    this.attempts = attempts;
    this.maxAttempts = maxAttempts;
    this.totalDuration = totalDuration;
    this.lastError = lastError;
  }
}

/**
 * Utility functions for error handling
 */
export class ErrorUtils {
  public static isRetryableError(error: any): boolean {
    if (error instanceof OrchestrationClientError) {
      return error.retryable;
    }
    
    // Check gRPC status codes
    if (error.code !== undefined) {
      const grpcCode = error.code as GRPCErrorCode;
      return [
        GRPCErrorCode.UNAVAILABLE,
        GRPCErrorCode.RESOURCE_EXHAUSTED,
        GRPCErrorCode.DEADLINE_EXCEEDED,
        GRPCErrorCode.INTERNAL,
      ].includes(grpcCode);
    }
    
    return false;
  }

  public static isFallbackEligibleError(error: any): boolean {
    if (error instanceof OrchestrationClientError) {
      return error.fallbackEligible;
    }
    
    return false;
  }

  public static isPermanentError(error: any): boolean {
    if (error instanceof OrchestrationClientError) {
      return error.permanent;
    }
    
    // Check gRPC status codes for permanent errors
    if (error.code !== undefined) {
      const grpcCode = error.code as GRPCErrorCode;
      return [
        GRPCErrorCode.INVALID_ARGUMENT,
        GRPCErrorCode.NOT_FOUND,
        GRPCErrorCode.PERMISSION_DENIED,
        GRPCErrorCode.UNAUTHENTICATED,
        GRPCErrorCode.UNIMPLEMENTED,
      ].includes(grpcCode);
    }
    
    return false;
  }

  public static fromGRPCError(grpcError: any, requestId?: string): OrchestrationClientError {
    const grpcCode = grpcError.code as GRPCErrorCode;
    let orchCode: OrchestrationErrorCode;
    
    // Map gRPC codes to orchestration codes with v1.1 enhancements
    switch (grpcCode) {
      case GRPCErrorCode.INVALID_ARGUMENT:
        // Check for v1.1 specific validation errors
        if (grpcError.message?.includes('trajectory')) {
          orchCode = OrchestrationErrorCode.TRAJECTORY_INVALID;
        } else if (grpcError.message?.includes('workflow')) {
          orchCode = OrchestrationErrorCode.WORKFLOW_GENERATION_FAILED;
        } else {
          orchCode = OrchestrationErrorCode.INVALID_REQUEST;
        }
        break;
      case GRPCErrorCode.NOT_FOUND:
        if (grpcError.message?.includes('signing key') || grpcError.message?.includes('key')) {
          orchCode = OrchestrationErrorCode.SIGNING_KEY_NOT_FOUND;
        } else {
          orchCode = OrchestrationErrorCode.NOT_FOUND;
        }
        break;
      case GRPCErrorCode.PERMISSION_DENIED:
        orchCode = OrchestrationErrorCode.FORBIDDEN;
        break;
      case GRPCErrorCode.UNAUTHENTICATED:
        orchCode = OrchestrationErrorCode.UNAUTHORIZED;
        break;
      case GRPCErrorCode.RESOURCE_EXHAUSTED:
        // Check for v1.1 specific resource issues
        if (grpcError.message?.includes('stream') || grpcError.message?.includes('buffer')) {
          orchCode = OrchestrationErrorCode.STREAM_BUFFER_FULL;
        } else {
          orchCode = OrchestrationErrorCode.TOO_MANY_REQUESTS;
        }
        break;
      case GRPCErrorCode.DEADLINE_EXCEEDED:
        if (grpcError.message?.includes('workflow') || grpcError.message?.includes('step')) {
          orchCode = OrchestrationErrorCode.WORKFLOW_STEP_TIMEOUT;
        } else {
          orchCode = OrchestrationErrorCode.TIMEOUT;
        }
        break;
      case GRPCErrorCode.UNAVAILABLE:
        if (grpcError.message?.includes('stream')) {
          orchCode = OrchestrationErrorCode.STREAM_UNAVAILABLE;
        } else {
          orchCode = OrchestrationErrorCode.SERVICE_UNAVAILABLE;
        }
        break;
      case GRPCErrorCode.INTERNAL:
        // Check for v1.1 specific internal errors
        if (grpcError.message?.includes('TRPO') || grpcError.message?.includes('surrogate')) {
          orchCode = OrchestrationErrorCode.TRPO_EVALUATION_FAILED;
        } else if (grpcError.message?.includes('workflow')) {
          orchCode = OrchestrationErrorCode.WORKFLOW_EXECUTION_FAILED;
        } else {
          orchCode = OrchestrationErrorCode.INTERNAL_ERROR;
        }
        break;
      case GRPCErrorCode.UNIMPLEMENTED:
        orchCode = OrchestrationErrorCode.NOT_IMPLEMENTED;
        break;
      case GRPCErrorCode.ABORTED:
        if (grpcError.message?.includes('stream')) {
          orchCode = OrchestrationErrorCode.STREAM_CONNECTION_LOST;
        } else {
          orchCode = OrchestrationErrorCode.INTERNAL_ERROR;
        }
        break;
      default:
        orchCode = OrchestrationErrorCode.INTERNAL_ERROR;
    }
    
    return new OrchestrationClientError(
      grpcError.message || grpcError.details || 'Unknown gRPC error',
      orchCode,
      grpcCode,
      grpcError.metadata || {},
      requestId
    );
  }
}