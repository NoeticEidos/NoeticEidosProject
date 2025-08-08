/**
 * Retry Handler with Exponential Backoff and Jitter
 * Implements intelligent retry logic for gRPC operations
 */

import { RetryPolicyConfig } from '../types/config-types';
import { 
  OrchestrationClientError, 
  RetryExhaustedClientError, 
  ErrorUtils,
  OrchestrationErrorCode 
} from '../types/error-types';

export interface RetryContext {
  attempt: number;
  maxAttempts: number;
  totalDuration: number;
  lastError: Error;
  startTime: Date;
  requestId?: string;
}

export interface RetryMetrics {
  totalAttempts: number;
  totalDuration: number;
  averageAttemptDuration: number;
  successfulRetries: number;
  failedRetries: number;
  retriesExhausted: number;
}

export class RetryHandler {
  private metrics: RetryMetrics = {
    totalAttempts: 0,
    totalDuration: 0,
    averageAttemptDuration: 0,
    successfulRetries: 0,
    failedRetries: 0,
    retriesExhausted: 0,
  };

  constructor(private readonly config: RetryPolicyConfig) {
    this.validateConfig();
  }

  private validateConfig(): void {
    if (this.config.maxAttempts <= 0) {
      throw new Error('maxAttempts must be greater than 0');
    }
    if (this.config.initialDelay <= 0) {
      throw new Error('initialDelay must be greater than 0');
    }
    if (this.config.maxDelay <= this.config.initialDelay) {
      throw new Error('maxDelay must be greater than initialDelay');
    }
    if (this.config.backoffMultiplier <= 1) {
      throw new Error('backoffMultiplier must be greater than 1');
    }
    if (this.config.jitter < 0 || this.config.jitter > 1) {
      throw new Error('jitter must be between 0 and 1');
    }
  }

  /**
   * Execute a function with retry logic
   */
  public async executeWithRetry<T>(
    fn: () => Promise<T>,
    requestId?: string
  ): Promise<T> {
    if (!this.config.enabled) {
      return fn();
    }

    const startTime = new Date();
    let lastError: Error;
    let totalDuration = 0;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      const context: RetryContext = {
        attempt,
        maxAttempts: this.config.maxAttempts,
        totalDuration,
        lastError: lastError!,
        startTime,
        requestId,
      };

      try {
        const attemptStartTime = Date.now();
        const result = await fn();
        const attemptDuration = Date.now() - attemptStartTime;
        
        // Update metrics on success
        this.updateMetricsOnSuccess(attempt, totalDuration + attemptDuration);
        
        return result;
      } catch (error) {
        const attemptDuration = Date.now() - Date.now();
        totalDuration += attemptDuration;
        lastError = error as Error;
        
        // Check if we should retry this error
        if (!this.shouldRetry(lastError, context)) {
          this.updateMetricsOnFailure(attempt, totalDuration, false);
          throw lastError;
        }

        // Check if we've exceeded max duration
        if (totalDuration >= this.config.maxDuration) {
          this.updateMetricsOnFailure(attempt, totalDuration, true);
          throw new RetryExhaustedClientError(
            attempt,
            this.config.maxAttempts,
            totalDuration,
            lastError as OrchestrationClientError,
            requestId
          );
        }

        // If this is the last attempt, don't wait
        if (attempt >= this.config.maxAttempts) {
          this.updateMetricsOnFailure(attempt, totalDuration, true);
          throw new RetryExhaustedClientError(
            attempt,
            this.config.maxAttempts,
            totalDuration,
            lastError as OrchestrationClientError,
            requestId
          );
        }

        // Calculate delay and wait
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
        totalDuration += delay;
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new RetryExhaustedClientError(
      this.config.maxAttempts,
      this.config.maxAttempts,
      totalDuration,
      lastError! as OrchestrationClientError,
      requestId
    );
  }

  /**
   * Determine if an error should be retried
   */
  private shouldRetry(error: Error, context: RetryContext): boolean {
    // Check if error is retryable
    if (!ErrorUtils.isRetryableError(error)) {
      return false;
    }

    // Check if error is in non-retryable list
    if (error instanceof OrchestrationClientError) {
      if (this.config.retryConditions?.includes('non_retryable_codes')) {
        const nonRetryableCodes = [
          OrchestrationErrorCode.CIRCUIT_BREAKER_OPEN,
          OrchestrationErrorCode.CIRCUIT_BREAKER_HALF_OPEN,
          OrchestrationErrorCode.RETRY_EXHAUSTED,
          OrchestrationErrorCode.RETRY_LIMIT_EXCEEDED,
        ];
        
        if (nonRetryableCodes.includes(error.code)) {
          return false;
        }
      }
    }

    // Check custom retry conditions
    if (this.config.retryConditions) {
      for (const condition of this.config.retryConditions) {
        if (!this.evaluateRetryCondition(condition, error, context)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Evaluate custom retry condition
   */
  private evaluateRetryCondition(
    condition: string, 
    error: Error, 
    context: RetryContext
  ): boolean {
    switch (condition) {
      case 'max_duration_not_exceeded':
        return context.totalDuration < this.config.maxDuration;
      
      case 'exponential_backoff_limit':
        const maxAllowedDelay = this.config.initialDelay * 
          Math.pow(this.config.backoffMultiplier, context.attempt - 1);
        return maxAllowedDelay <= this.config.maxDelay;
      
      case 'circuit_breaker_compatible':
        // Don't retry if circuit breaker is open
        if (error instanceof OrchestrationClientError) {
          return error.code !== OrchestrationErrorCode.CIRCUIT_BREAKER_OPEN;
        }
        return true;
      
      case 'rate_limit_aware':
        // Special handling for rate limit errors
        if (error instanceof OrchestrationClientError) {
          if (error.code === OrchestrationErrorCode.TOO_MANY_REQUESTS) {
            // Use longer delay for rate limiting
            return context.attempt <= Math.floor(this.config.maxAttempts / 2);
          }
        }
        return true;
      
      default:
        // Unknown condition, default to allow retry
        return true;
    }
  }

  /**
   * Calculate delay for exponential backoff with jitter
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff: initialDelay * (backoffMultiplier ^ (attempt - 1))
    const exponentialDelay = this.config.initialDelay * 
      Math.pow(this.config.backoffMultiplier, attempt - 1);
    
    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitterRange = cappedDelay * this.config.jitter;
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;
    
    // Ensure delay is never negative
    return Math.max(0, cappedDelay + jitter);
  }

  /**
   * Sleep for specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update metrics on successful retry
   */
  private updateMetricsOnSuccess(attempts: number, totalDuration: number): void {
    this.metrics.totalAttempts += attempts;
    this.metrics.totalDuration += totalDuration;
    
    if (attempts > 1) {
      this.metrics.successfulRetries++;
    }
    
    this.updateAverageAttemptDuration();
  }

  /**
   * Update metrics on failed retry
   */
  private updateMetricsOnFailure(
    attempts: number, 
    totalDuration: number, 
    exhausted: boolean
  ): void {
    this.metrics.totalAttempts += attempts;
    this.metrics.totalDuration += totalDuration;
    this.metrics.failedRetries++;
    
    if (exhausted) {
      this.metrics.retriesExhausted++;
    }
    
    this.updateAverageAttemptDuration();
  }

  /**
   * Update average attempt duration
   */
  private updateAverageAttemptDuration(): void {
    if (this.metrics.totalAttempts > 0) {
      this.metrics.averageAttemptDuration = 
        this.metrics.totalDuration / this.metrics.totalAttempts;
    }
  }

  /**
   * Get current retry metrics
   */
  public getMetrics(): RetryMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      totalAttempts: 0,
      totalDuration: 0,
      averageAttemptDuration: 0,
      successfulRetries: 0,
      failedRetries: 0,
      retriesExhausted: 0,
    };
  }

  /**
   * Get retry configuration
   */
  public getConfig(): RetryPolicyConfig {
    return { ...this.config };
  }

  /**
   * Create a delay calculator for external use
   */
  public createDelayCalculator(): (attempt: number) => number {
    return (attempt: number) => this.calculateDelay(attempt);
  }

  /**
   * Check if an error should be retried (external utility)
   */
  public static shouldRetryError(error: Error): boolean {
    return ErrorUtils.isRetryableError(error) && !ErrorUtils.isPermanentError(error);
  }

  /**
   * Create a simple retry function without full context
   */
  public static async simpleRetry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt >= maxAttempts || !RetryHandler.shouldRetryError(lastError)) {
          throw lastError;
        }
        
        // Simple exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
}