/**
 * Main entry point for the gRPC Orchestration Client Library v1.1
 */

// Core client
export { PolicyServiceClient } from './client/policy-service-client';

// Types
export * from './types';

// Utilities
export { CircuitBreaker, CircuitBreakerState } from './utils/circuit-breaker';
export { RetryHandler } from './utils/retry-handler';
export { Logger, LogLevel } from './utils/logger';

// Configuration
export { DEFAULT_CONFIG } from './types/config-types';

// Error handling
export {
  OrchestrationClientError,
  CircuitBreakerOpenError,
  RetryExhaustedClientError,
  ErrorUtils,
  RETRYABLE_ERROR_CODES,
  FALLBACK_ERROR_CODES,
  PERMANENT_ERROR_CODES
} from './types/error-types';

// Version
export const VERSION = '1.1.0';