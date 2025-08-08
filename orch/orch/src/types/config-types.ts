/**
 * Configuration types for the gRPC orchestration client
 */

export interface GRPCClientConfig {
  /** gRPC server endpoint */
  endpoint: string;
  
  /** Connection timeout in milliseconds */
  connectionTimeout: number;
  
  /** Request timeout in milliseconds */
  requestTimeout: number;
  
  /** Enable TLS/SSL */
  secure: boolean;
  
  /** TLS configuration */
  tls?: TLSConfig;
  
  /** Authentication configuration */
  auth?: AuthConfig;
  
  /** Connection pool configuration */
  connectionPool?: ConnectionPoolConfig;
  
  /** Circuit breaker configuration */
  circuitBreaker: CircuitBreakerConfig;
  
  /** Retry policy configuration */
  retryPolicy: RetryPolicyConfig;
  
  /** Health check configuration */
  healthCheck?: HealthCheckConfig;
  
  /** Logging configuration */
  logging?: LoggingConfig;
  
  /** Metrics collection configuration */
  metrics?: MetricsConfig;
  
  /** Additional gRPC options */
  grpcOptions?: Record<string, any>;
}

export interface TLSConfig {
  /** CA certificate file path or content */
  ca?: string;
  
  /** Client certificate file path or content */
  cert?: string;
  
  /** Client private key file path or content */
  key?: string;
  
  /** Skip certificate verification (insecure) */
  insecure?: boolean;
  
  /** Server name for certificate verification */
  serverName?: string;
}

export interface AuthConfig {
  /** Authentication type */
  type: 'none' | 'basic' | 'bearer' | 'api-key' | 'jwt' | 'mtls';
  
  /** Basic auth credentials */
  basic?: {
    username: string;
    password: string;
  };
  
  /** Bearer token */
  bearer?: {
    token: string;
    refreshToken?: string;
    refreshUrl?: string;
  };
  
  /** API key configuration */
  apiKey?: {
    key: string;
    header?: string;
  };
  
  /** JWT configuration */
  jwt?: {
    token: string;
    secret?: string;
    algorithm?: string;
    expiresIn?: number;
  };
}

export interface ConnectionPoolConfig {
  /** Maximum number of connections in the pool */
  maxConnections: number;
  
  /** Minimum number of idle connections */
  minIdleConnections: number;
  
  /** Maximum idle time for connections in milliseconds */
  maxIdleTime: number;
  
  /** Connection validation query/method */
  validationQuery?: string;
  
  /** Enable connection pooling */
  enabled: boolean;
}

export interface CircuitBreakerConfig {
  /** Enable circuit breaker */
  enabled: boolean;
  
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  
  /** Timeout before attempting to close the circuit (milliseconds) */
  timeout: number;
  
  /** Number of successful requests needed to close the circuit */
  recoveryThreshold: number;
  
  /** Timeout for recovery attempts (milliseconds) */
  recoveryTimeout: number;
  
  /** Monitor window size for failure rate calculation */
  monitoringWindow: number;
  
  /** Minimum number of requests in monitoring window */
  minimumThroughput: number;
}

export interface RetryPolicyConfig {
  /** Enable retries */
  enabled: boolean;
  
  /** Maximum number of retry attempts */
  maxAttempts: number;
  
  /** Initial delay between retries (milliseconds) */
  initialDelay: number;
  
  /** Maximum delay between retries (milliseconds) */
  maxDelay: number;
  
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;
  
  /** Maximum total retry duration (milliseconds) */
  maxDuration: number;
  
  /** Jitter factor for retry delays (0-1) */
  jitter: number;
  
  /** Custom retry conditions */
  retryConditions?: string[];
}

export interface HealthCheckConfig {
  /** Enable health checks */
  enabled: boolean;
  
  /** Health check interval (milliseconds) */
  interval: number;
  
  /** Health check timeout (milliseconds) */
  timeout: number;
  
  /** Number of failed health checks before marking as unhealthy */
  unhealthyThreshold: number;
  
  /** Number of successful health checks before marking as healthy */
  healthyThreshold: number;
  
  /** Custom health check method */
  customCheck?: string;
}

export interface LoggingConfig {
  /** Logging level */
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  
  /** Enable request/response logging */
  logRequests: boolean;
  
  /** Enable error logging */
  logErrors: boolean;
  
  /** Enable performance logging */
  logPerformance: boolean;
  
  /** Maximum log entry size */
  maxLogSize: number;
  
  /** Log format */
  format: 'json' | 'pretty' | 'compact';
  
  /** Custom logger instance */
  customLogger?: any;
}

export interface MetricsConfig {
  /** Enable metrics collection */
  enabled: boolean;
  
  /** Metrics collection interval (milliseconds) */
  interval: number;
  
  /** Metrics to collect */
  collect: {
    requests?: boolean;
    responses?: boolean;
    errors?: boolean;
    latency?: boolean;
    circuitBreaker?: boolean;
    connections?: boolean;
  };
  
  /** Custom metrics configuration */
  custom?: Record<string, any>;
}

export interface ClientOptions {
  /** Request timeout override (milliseconds) */
  timeout?: number;
  
  /** Retry policy override */
  retryPolicy?: Partial<RetryPolicyConfig>;
  
  /** Circuit breaker override */
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  
  /** Request metadata */
  metadata?: Record<string, string>;
  
  /** Request ID for tracing */
  requestId?: string;
  
  /** Enable/disable fallback */
  enableFallback?: boolean;
  
  /** Custom fallback handler */
  fallbackHandler?: (error: any) => Promise<any>;
}

export interface ConnectionState {
  /** Connection status */
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  
  /** Last connection attempt timestamp */
  lastAttempt: Date;
  
  /** Last successful connection timestamp */
  lastSuccess?: Date;
  
  /** Connection error if any */
  error?: Error;
  
  /** Connection metadata */
  metadata?: Record<string, any>;
}

export interface ServiceHealthStatus {
  /** Service name */
  service: string;
  
  /** Health status */
  status: 'healthy' | 'unhealthy' | 'unknown';
  
  /** Last health check timestamp */
  lastCheck: Date;
  
  /** Health check message */
  message?: string;
  
  /** Additional health data */
  metadata?: Record<string, any>;
}

export interface ClientMetrics {
  /** Total requests sent */
  totalRequests: number;
  
  /** Total successful requests */
  successfulRequests: number;
  
  /** Total failed requests */
  failedRequests: number;
  
  /** Average response time (milliseconds) */
  averageResponseTime: number;
  
  /** Circuit breaker state */
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  
  /** Connection pool status */
  connectionPool: {
    total: number;
    active: number;
    idle: number;
  };
  
  /** Error statistics */
  errorStats: Record<string, number>;
  
  /** Last updated timestamp */
  lastUpdated: Date;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: GRPCClientConfig = {
  endpoint: 'localhost:50051',
  connectionTimeout: 30000,
  requestTimeout: 30000,
  secure: false,
  
  connectionPool: {
    enabled: true,
    maxConnections: 10,
    minIdleConnections: 2,
    maxIdleTime: 300000, // 5 minutes
  },
  
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    timeout: 60000, // 1 minute
    recoveryThreshold: 3,
    recoveryTimeout: 30000, // 30 seconds
    monitoringWindow: 60000, // 1 minute
    minimumThroughput: 10,
  },
  
  retryPolicy: {
    enabled: true,
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2.0,
    maxDuration: 300000, // 5 minutes
    jitter: 0.1,
  },
  
  healthCheck: {
    enabled: true,
    interval: 30000, // 30 seconds
    timeout: 5000,
    unhealthyThreshold: 3,
    healthyThreshold: 2,
  },
  
  logging: {
    level: 'info',
    logRequests: true,
    logErrors: true,
    logPerformance: true,
    maxLogSize: 1000000, // 1MB
    format: 'json',
  },
  
  metrics: {
    enabled: true,
    interval: 10000, // 10 seconds
    collect: {
      requests: true,
      responses: true,
      errors: true,
      latency: true,
      circuitBreaker: true,
      connections: true,
    },
  },
};