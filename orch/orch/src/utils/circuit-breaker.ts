/**
 * Circuit Breaker Pattern Implementation with Exponential Backoff
 * Provides fault tolerance and prevents cascading failures
 */

import { CircuitBreakerConfig } from '../types/config-types';
import { CircuitBreakerOpenError, OrchestrationClientError, ErrorUtils, OrchestrationErrorCode } from '../types/error-types';
import { EventEmitter } from 'events';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerMetrics {
  requestCount: number;
  failureCount: number;
  successCount: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  state: CircuitBreakerState;
  stateTransitions: number;
  averageResponseTime: number;
  failureRate: number;
}

export interface CircuitBreakerEvents {
  stateChange: [CircuitBreakerState, CircuitBreakerState];
  requestSuccess: [number]; // response time
  requestFailure: [Error];
  circuitOpened: [number]; // failure count
  circuitClosed: [number]; // success count
  circuitHalfOpened: [];
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private requestCount: number = 0;
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private nextAttemptTime: Date | null = null;
  private stateTransitions: number = 0;
  private responseTimes: number[] = [];
  private readonly maxResponseTimeSamples = 100;
  private monitoringWindowStart: Date = new Date();

  constructor(private readonly config: CircuitBreakerConfig) {
    super();
    this.validateConfig();
  }

  private validateConfig(): void {
    if (this.config.failureThreshold <= 0) {
      throw new Error('failureThreshold must be greater than 0');
    }
    if (this.config.timeout <= 0) {
      throw new Error('timeout must be greater than 0');
    }
    if (this.config.recoveryThreshold <= 0) {
      throw new Error('recoveryThreshold must be greater than 0');
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  public async execute<T>(fn: () => Promise<T>, requestId?: string): Promise<T> {
    if (!this.config.enabled) {
      return fn();
    }

    this.checkAndUpdateState();

    if (this.state === CircuitBreakerState.OPEN) {
      const error = new CircuitBreakerOpenError(
        this.failureCount,
        this.lastFailureTime!,
        this.nextAttemptTime!,
        requestId
      );
      this.emit('requestFailure', error);
      throw error;
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const result = await fn();
      const responseTime = Date.now() - startTime;
      this.onSuccess(responseTime);
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(responseTime: number): void {
    this.successCount++;
    this.lastSuccessTime = new Date();
    
    // Track response times
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > this.maxResponseTimeSamples) {
      this.responseTimes.shift();
    }

    this.emit('requestSuccess', responseTime);

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.successCount >= this.config.recoveryThreshold) {
        this.transitionTo(CircuitBreakerState.CLOSED);
        this.resetCounts();
      }
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    
    this.emit('requestFailure', error);

    // Only count failures that should trigger circuit breaker
    if (this.shouldTriggerCircuitBreaker(error)) {
      if (this.state === CircuitBreakerState.CLOSED) {
        if (this.shouldOpenCircuit()) {
          this.transitionTo(CircuitBreakerState.OPEN);
          this.setNextAttemptTime();
        }
      } else if (this.state === CircuitBreakerState.HALF_OPEN) {
        // Any failure in half-open state returns to open
        this.transitionTo(CircuitBreakerState.OPEN);
        this.setNextAttemptTime();
      }
    }
  }

  /**
   * Check if error should trigger circuit breaker with v1.1 enhancements
   */
  private shouldTriggerCircuitBreaker(error: Error): boolean {
    // Don't trigger on permanent errors (4xx client errors)
    if (ErrorUtils.isPermanentError(error)) {
      return false;
    }

    // v1.1 specific error handling
    if (error instanceof OrchestrationClientError) {
      // Don't trigger circuit breaker for validation errors in v1.1 methods
      if (error.code === OrchestrationErrorCode.VALIDATION_FAILED) {
        return false;
      }
      
      // Don't trigger for authentication/authorization issues
      if (error.code === OrchestrationErrorCode.UNAUTHORIZED || 
          error.code === OrchestrationErrorCode.FORBIDDEN) {
        return false;
      }
      
      // Trigger for v1.1 specific retryable errors
      if (error.code === OrchestrationErrorCode.RESOURCE_UNAVAILABLE ||
          error.code === OrchestrationErrorCode.RESOURCE_LOCKED ||
          error.code === OrchestrationErrorCode.RESOURCE_QUOTA_EXCEEDED) {
        return true;
      }
    }

    // Trigger on retryable errors and temporary failures
    return ErrorUtils.isRetryableError(error) || 
           error instanceof OrchestrationClientError;
  }

  /**
   * Determine if circuit should open based on failure rate with v1.1 logic
   */
  private shouldOpenCircuit(): boolean {
    const now = new Date();
    const windowElapsed = now.getTime() - this.monitoringWindowStart.getTime();
    
    // Check if minimum throughput is met
    if (this.requestCount < this.config.minimumThroughput) {
      return false;
    }

    // Check if monitoring window has enough data
    if (windowElapsed < this.config.monitoringWindow) {
      // Use simple failure count for early detection
      return this.failureCount >= this.config.failureThreshold;
    }

    // Calculate failure rate over the monitoring window
    const failureRate = this.requestCount > 0 ? this.failureCount / this.requestCount : 0;
    const threshold = this.config.failureThreshold / this.config.minimumThroughput;
    
    // v1.1 enhancement: Consider recent failure trend
    const recentFailures = this.getRecentFailureCount();
    const recentFailureRate = recentFailures / Math.min(this.requestCount, 10); // Last 10 requests
    
    // Open if either overall failure rate is high OR recent failure rate is very high
    return failureRate >= threshold || (recentFailureRate >= 0.8 && recentFailures >= 3);
  }

  /**
   * Get count of failures in recent requests (for enhanced circuit breaking)
   */
  private getRecentFailureCount(): number {
    // This is a simplified implementation
    // In a full implementation, you'd track recent requests with timestamps
    const recentWindow = 30000; // 30 seconds
    const now = new Date();
    
    if (!this.lastFailureTime) {
      return 0;
    }
    
    const timeSinceLastFailure = now.getTime() - this.lastFailureTime.getTime();
    
    if (timeSinceLastFailure <= recentWindow) {
      // Estimate recent failures based on current failure count
      // In a full implementation, this would be tracked more precisely
      return Math.min(this.failureCount, 5);
    }
    
    return 0;
  }

  /**
   * Check current state and update if necessary
   */
  private checkAndUpdateState(): void {
    if (this.state === CircuitBreakerState.OPEN && this.canAttemptReset()) {
      this.transitionTo(CircuitBreakerState.HALF_OPEN);
      this.resetCounts();
    }

    // Reset monitoring window periodically
    const now = new Date();
    const windowElapsed = now.getTime() - this.monitoringWindowStart.getTime();
    if (windowElapsed >= this.config.monitoringWindow) {
      this.resetMonitoringWindow();
    }
  }

  /**
   * Check if circuit can attempt to reset from OPEN to HALF_OPEN
   */
  private canAttemptReset(): boolean {
    if (!this.nextAttemptTime) {
      return true;
    }
    return new Date() >= this.nextAttemptTime;
  }

  /**
   * Set the next attempt time using exponential backoff
   */
  private setNextAttemptTime(): void {
    const baseTimeout = this.config.timeout;
    const jitter = Math.random() * 0.1; // 10% jitter
    const backoffMultiplier = Math.min(Math.pow(2, this.stateTransitions), 8); // Cap at 8x
    const timeout = baseTimeout * backoffMultiplier * (1 + jitter);
    
    this.nextAttemptTime = new Date(Date.now() + timeout);
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;
    this.stateTransitions++;
    
    this.emit('stateChange', oldState, newState);
    
    switch (newState) {
      case CircuitBreakerState.OPEN:
        this.emit('circuitOpened', this.failureCount);
        break;
      case CircuitBreakerState.CLOSED:
        this.emit('circuitClosed', this.successCount);
        break;
      case CircuitBreakerState.HALF_OPEN:
        this.emit('circuitHalfOpened');
        break;
    }
  }

  /**
   * Reset failure and success counts
   */
  private resetCounts(): void {
    this.failureCount = 0;
    this.successCount = 0;
  }

  /**
   * Reset monitoring window
   */
  private resetMonitoringWindow(): void {
    this.monitoringWindowStart = new Date();
    this.requestCount = 0;
    this.failureCount = 0;
    this.successCount = 0;
  }

  /**
   * Get current circuit breaker metrics
   */
  public getMetrics(): CircuitBreakerMetrics {
    const averageResponseTime = this.responseTimes.length > 0 
      ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
      : 0;

    const failureRate = this.requestCount > 0 
      ? this.failureCount / this.requestCount 
      : 0;

    return {
      requestCount: this.requestCount,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      state: this.state,
      stateTransitions: this.stateTransitions,
      averageResponseTime,
      failureRate,
    };
  }

  /**
   * Get current state
   */
  public getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Check if circuit is healthy (closed state)
   */
  public isHealthy(): boolean {
    return this.state === CircuitBreakerState.CLOSED;
  }

  /**
   * Force reset the circuit breaker to closed state
   */
  public reset(): void {
    this.transitionTo(CircuitBreakerState.CLOSED);
    this.resetCounts();
    this.resetMonitoringWindow();
    this.nextAttemptTime = null;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.responseTimes = [];
    this.stateTransitions = 0;
  }

  /**
   * Force open the circuit breaker
   */
  public forceOpen(): void {
    this.transitionTo(CircuitBreakerState.OPEN);
    this.setNextAttemptTime();
  }

  /**
   * Get time until next attempt (only relevant in OPEN state)
   */
  public getTimeUntilNextAttempt(): number {
    if (this.state !== CircuitBreakerState.OPEN || !this.nextAttemptTime) {
      return 0;
    }
    return Math.max(0, this.nextAttemptTime.getTime() - Date.now());
  }

  // EventEmitter type safety
  public emit<K extends keyof CircuitBreakerEvents>(
    event: K,
    ...args: CircuitBreakerEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  public on<K extends keyof CircuitBreakerEvents>(
    event: K,
    listener: (...args: CircuitBreakerEvents[K]) => void
  ): this {
    return super.on(event, listener);
  }

  public off<K extends keyof CircuitBreakerEvents>(
    event: K,
    listener: (...args: CircuitBreakerEvents[K]) => void
  ): this {
    return super.off(event, listener);
  }
}