/**
 * Structured logging utility for the gRPC orchestration client
 */

import { LoggingConfig } from '../types/config-types';
import { OrchestrationError } from '../types/error-types';

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  component: string;
  requestId?: string;
  metadata?: Record<string, any>;
  error?: Error;
  duration?: number;
  operation?: string;
}

export interface LogContext {
  requestId?: string;
  operation?: string;
  component?: string;
  metadata?: Record<string, any>;
}

export class Logger {
  private readonly levelMap: Record<string, LogLevel> = {
    'trace': LogLevel.TRACE,
    'debug': LogLevel.DEBUG,
    'info': LogLevel.INFO,
    'warn': LogLevel.WARN,
    'error': LogLevel.ERROR,
    'fatal': LogLevel.FATAL,
  };

  private readonly component: string;
  private context: LogContext = {};

  constructor(
    component: string,
    private readonly config: LoggingConfig
  ) {
    this.component = component;
  }

  /**
   * Set context for all subsequent log entries
   */
  public setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear logging context
   */
  public clearContext(): void {
    this.context = {};
  }

  /**
   * Create a child logger with additional context
   */
  public child(context: LogContext): Logger {
    const childLogger = new Logger(this.component, this.config);
    childLogger.setContext({ ...this.context, ...context });
    return childLogger;
  }

  /**
   * Log at TRACE level
   */
  public trace(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.TRACE, message, metadata);
  }

  /**
   * Log at DEBUG level
   */
  public debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Log at INFO level
   */
  public info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Log at WARN level
   */
  public warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Log at ERROR level
   */
  public error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, metadata, error);
  }

  /**
   * Log at FATAL level
   */
  public fatal(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log(LogLevel.FATAL, message, metadata, error);
  }

  /**
   * Log a request
   */
  public logRequest(
    method: string,
    request: any,
    requestId?: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.logRequests) {
      return;
    }

    this.log(LogLevel.INFO, `Request: ${method}`, {
      ...metadata,
      method,
      request: this.sanitizeForLogging(request),
      type: 'request',
    });
  }

  /**
   * Log a response
   */
  public logResponse(
    method: string,
    response: any,
    duration: number,
    requestId?: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.logRequests) {
      return;
    }

    this.log(LogLevel.INFO, `Response: ${method}`, {
      ...metadata,
      method,
      response: this.sanitizeForLogging(response),
      duration,
      type: 'response',
    });
  }

  /**
   * Log an error with context
   */
  public logError(
    error: Error,
    operation?: string,
    requestId?: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.logErrors) {
      return;
    }

    const errorMetadata: Record<string, any> = {
      ...metadata,
      operation,
      errorType: error.constructor.name,
      type: 'error',
    };

    if ((error as any).code !== undefined) {
      errorMetadata.errorCode = (error as any).code;
      errorMetadata.grpcCode = (error as any).grpcCode;
      errorMetadata.retryable = (error as any).retryable;
      errorMetadata.fallbackEligible = (error as any).fallbackEligible;
      errorMetadata.permanent = (error as any).permanent;
      errorMetadata.details = (error as any).details;
    }

    this.log(LogLevel.ERROR, `Error in ${operation || 'operation'}: ${error.message}`, errorMetadata, error);
  }

  /**
   * Log performance metrics
   */
  public logPerformance(
    operation: string,
    duration: number,
    requestId?: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.logPerformance) {
      return;
    }

    const perfLevel = duration > 5000 ? LogLevel.WARN : LogLevel.INFO;
    
    this.log(perfLevel, `Performance: ${operation}`, {
      ...metadata,
      operation,
      duration,
      type: 'performance',
    });
  }

  /**
   * Log circuit breaker state change
   */
  public logCircuitBreakerStateChange(
    from: string,
    to: string,
    failureCount?: number,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.WARN, `Circuit breaker state change: ${from} -> ${to}`, {
      ...metadata,
      from,
      to,
      failureCount,
      type: 'circuit_breaker',
    });
  }

  /**
   * Log retry attempt
   */
  public logRetryAttempt(
    attempt: number,
    maxAttempts: number,
    error: Error,
    delay: number,
    requestId?: string,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.DEBUG, `Retry attempt ${attempt}/${maxAttempts} after ${delay}ms`, {
      ...metadata,
      attempt,
      maxAttempts,
      delay,
      error: error.message,
      errorType: error.constructor.name,
      type: 'retry',
    });
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, any>,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message: this.truncateMessage(message),
      component: this.component,
      requestId: this.context.requestId,
      operation: this.context.operation,
      metadata: {
        ...this.context.metadata,
        ...metadata,
      },
      error: error ? this.serializeError(error) : undefined,
    };

    this.output(entry);
  }

  /**
   * Check if message should be logged based on level
   */
  private shouldLog(level: LogLevel): boolean {
    const configuredLevel = this.levelMap[this.config.level] ?? LogLevel.INFO;
    return level >= configuredLevel;
  }

  /**
   * Truncate message if too long
   */
  private truncateMessage(message: string): string {
    if (message.length <= this.config.maxLogSize) {
      return message;
    }
    return message.substring(0, this.config.maxLogSize - 3) + '...';
  }

  /**
   * Sanitize objects for logging (remove sensitive data)
   */
  private sanitizeForLogging(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.truncateMessage(obj);
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    const sanitized: any = Array.isArray(obj) ? [] : {};
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth'];

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));
      
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeForLogging(value);
      } else if (typeof value === 'string') {
        sanitized[key] = this.truncateMessage(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Serialize error for logging
   */
  private serializeError(error: Error): any {
    const serialized: any = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    // Add additional properties for custom error types
    if ((error as any).code !== undefined) {
      serialized.code = (error as any).code;
      serialized.grpcCode = (error as any).grpcCode;
      serialized.details = (error as any).details;
      serialized.retryable = (error as any).retryable;
      serialized.fallbackEligible = (error as any).fallbackEligible;
      serialized.permanent = (error as any).permanent;
      serialized.requestId = (error as any).requestId;
      serialized.timestamp = (error as any).timestamp;
    }

    return serialized;
  }

  /**
   * Output log entry
   */
  private output(entry: LogEntry): void {
    if (this.config.customLogger) {
      this.outputToCustomLogger(entry);
    } else {
      this.outputToConsole(entry);
    }
  }

  /**
   * Output to custom logger
   */
  private outputToCustomLogger(entry: LogEntry): void {
    const logger = this.config.customLogger;
    const levelName = LogLevel[entry.level].toLowerCase();
    
    if (typeof logger[levelName] === 'function') {
      if (entry.error) {
        logger[levelName](entry.message, entry.error, entry.metadata);
      } else {
        logger[levelName](entry.message, entry.metadata);
      }
    } else if (typeof logger.log === 'function') {
      logger.log(levelName, entry.message, entry.metadata, entry.error);
    }
  }

  /**
   * Output to console
   */
  private outputToConsole(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const timestamp = entry.timestamp.toISOString();
    
    let output: string;
    
    switch (this.config.format) {
      case 'json':
        output = JSON.stringify({
          timestamp,
          level: levelName,
          component: entry.component,
          message: entry.message,
          requestId: entry.requestId,
          operation: entry.operation,
          metadata: entry.metadata,
          error: entry.error,
        });
        break;
        
      case 'pretty':
        const context = entry.requestId ? ` [${entry.requestId}]` : '';
        const operation = entry.operation ? ` (${entry.operation})` : '';
        output = `${timestamp} [${levelName}] ${entry.component}${context}${operation}: ${entry.message}`;
        if (entry.metadata && Object.keys(entry.metadata).length > 0) {
          output += `\n  Metadata: ${JSON.stringify(entry.metadata, null, 2)}`;
        }
        if (entry.error) {
          output += `\n  Error: ${entry.error}`;
        }
        break;
        
      case 'compact':
      default:
        const parts = [
          timestamp,
          levelName,
          entry.component,
          entry.requestId || '',
          entry.message,
        ].filter(Boolean);
        output = parts.join(' | ');
        break;
    }
    
    // Use appropriate console method
    switch (entry.level) {
      case LogLevel.TRACE:
      case LogLevel.DEBUG:
        console.debug(output);
        break;
      case LogLevel.INFO:
        console.info(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Get level name from level number
   */
  public static getLevelName(level: LogLevel): string {
    return LogLevel[level] || 'UNKNOWN';
  }

  /**
   * Create a timer for measuring operation duration
   */
  public timer(operation: string): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.logPerformance(operation, duration, this.context.requestId);
    };
  }
}