/**
 * Step execution engine with error handling and retry logic
 * Handles execution of individual workflow steps
 */

import {
  WorkflowStep,
  WorkflowAction,
  WorkflowContext,
  StepResult,
  BudgetInfo,
  RetryPolicy
} from '../types/workflow-types.js';

export interface ExecutionState {
  executionId: string;
  workflow: any;
  options: any;
  startTime: Date;
  context: WorkflowContext;
  trajectory: any;
  stepResults: Map<string, StepResult>;
  cancelled: boolean;
  cancellationReason?: string;
  currentStep: string | null;
}

export interface ActionExecutor {
  type: string;
  execute(action: WorkflowAction, context: WorkflowContext, executionState: ExecutionState): Promise<any>;
  estimateCost(action: WorkflowAction, context: WorkflowContext): BudgetInfo;
}

export class StepExecutor {
  private actionExecutors: Map<string, ActionExecutor> = new Map();
  private defaultRetryPolicy: RetryPolicy = {
    maxRetries: 3,
    backoffStrategy: 'exponential',
    baseDelay: 1000,
    maxDelay: 30000,
    retryableErrors: ['TIMEOUT', 'NETWORK_ERROR', 'RATE_LIMIT', 'TEMPORARY_FAILURE']
  };

  constructor() {
    this.initializeDefaultExecutors();
  }

  /**
   * Execute an action step with retry logic and error handling
   */
  async executeAction(
    step: WorkflowStep,
    context: WorkflowContext,
    executionState: ExecutionState
  ): Promise<StepResult> {
    if (!step.action) {
      throw new Error(`Action step ${step.id} missing action definition`);
    }

    const startTime = new Date();
    const retryPolicy = step.retryPolicy || this.defaultRetryPolicy;
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= retryPolicy.maxRetries) {
      try {
        const result = await this.executeActionAttempt(step, context, executionState, attempt);
        
        return {
          stepId: step.id,
          status: 'completed',
          startTime,
          endTime: new Date(),
          duration: Date.now() - startTime.getTime(),
          result: result.data,
          cost: result.cost,
          metadata: {
            attempts: attempt + 1,
            lastAttemptTime: new Date(),
            retryHistory: attempt > 0 ? this.getRetryHistory(step.id, attempt) : undefined
          }
        };
      } catch (error) {
        lastError = error as Error;
        attempt++;

        // Check if error is retryable
        if (!this.isRetryableError(error as Error, retryPolicy) || attempt > retryPolicy.maxRetries) {
          break;
        }

        // Apply backoff delay
        const delay = this.calculateBackoffDelay(attempt, retryPolicy);
        await this.sleep(delay);

        // Log retry attempt
        console.warn(`Retrying step ${step.id}, attempt ${attempt}/${retryPolicy.maxRetries} after ${delay}ms delay`);
      }
    }

    // All retries exhausted, return failed result
    return {
      stepId: step.id,
      status: 'failed',
      startTime,
      endTime: new Date(),
      duration: Date.now() - startTime.getTime(),
      error: lastError,
      cost: this.estimateFailedStepCost(step),
      metadata: {
        attempts: attempt,
        lastError: lastError?.message,
        retryExhausted: true
      }
    };
  }

  /**
   * Register custom action executor
   */
  registerActionExecutor(executor: ActionExecutor): void {
    this.actionExecutors.set(executor.type, executor);
  }

  /**
   * Get registered action executor
   */
  getActionExecutor(actionType: string): ActionExecutor | null {
    return this.actionExecutors.get(actionType) || null;
  }

  /**
   * Estimate cost for a step
   */
  estimateStepCost(step: WorkflowStep, context: WorkflowContext): BudgetInfo {
    if (step.action) {
      const executor = this.actionExecutors.get(step.action.type);
      if (executor) {
        return executor.estimateCost(step.action, context);
      }
    }

    return step.costEstimate ? 
      { tokens: step.costEstimate, computeTime: 100, memory: 0, apiCalls: 0, monetaryCost: 0 } :
      { tokens: 10, computeTime: 100, memory: 0, apiCalls: 0, monetaryCost: 0 };
  }

  private async executeActionAttempt(
    step: WorkflowStep,
    context: WorkflowContext,
    executionState: ExecutionState,
    attempt: number
  ): Promise<{ data: any; cost: BudgetInfo }> {
    const action = step.action!;
    const executor = this.actionExecutors.get(action.type);

    if (!executor) {
      throw new Error(`No executor registered for action type: ${action.type}`);
    }

    // Execute with timeout if specified
    const timeout = step.timeout || 30000; // 30 second default
    const executionPromise = executor.execute(action, context, executionState);
    
    let result: any;
    if (timeout > 0) {
      result = await Promise.race([
        executionPromise,
        this.createTimeoutPromise(timeout, `Step ${step.id} timed out after ${timeout}ms`)
      ]);
    } else {
      result = await executionPromise;
    }

    // Calculate actual cost
    const cost = executor.estimateCost(action, context);

    return { data: result, cost };
  }

  private isRetryableError(error: Error, retryPolicy: RetryPolicy): boolean {
    if (!retryPolicy.retryableErrors || retryPolicy.retryableErrors.length === 0) {
      return false;
    }

    const errorMessage = error.message.toUpperCase();
    return retryPolicy.retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError.toUpperCase())
    );
  }

  private calculateBackoffDelay(attempt: number, retryPolicy: RetryPolicy): number {
    const { backoffStrategy, baseDelay, maxDelay } = retryPolicy;
    let delay: number;

    switch (backoffStrategy) {
      case 'linear':
        delay = baseDelay * attempt;
        break;
      case 'exponential':
        delay = baseDelay * Math.pow(2, attempt - 1);
        break;
      case 'fixed':
      default:
        delay = baseDelay;
        break;
    }

    return Math.min(delay, maxDelay || delay);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async createTimeoutPromise(timeout: number, message: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeout);
    });
  }

  private getRetryHistory(stepId: string, attempts: number): Array<{ attempt: number; timestamp: Date; error?: string }> {
    // This would be implemented to track retry history
    // For now, return empty array
    return [];
  }

  private estimateFailedStepCost(step: WorkflowStep): BudgetInfo {
    return {
      tokens: 1, // Minimal cost for failed step
      computeTime: 100,
      memory: 0,
      apiCalls: 0,
      monetaryCost: 0
    };
  }

  private initializeDefaultExecutors(): void {
    // HTTP Request Executor
    this.registerActionExecutor(new HttpRequestExecutor());
    
    // File Operation Executor
    this.registerActionExecutor(new FileOperationExecutor());
    
    // Shell Command Executor
    this.registerActionExecutor(new ShellCommandExecutor());
    
    // Data Processing Executor
    this.registerActionExecutor(new DataProcessingExecutor());
    
    // Delay/Sleep Executor
    this.registerActionExecutor(new DelayExecutor());
    
    // Variable Assignment Executor
    this.registerActionExecutor(new VariableExecutor());
    
    // Conditional Logic Executor
    this.registerActionExecutor(new ConditionalExecutor());
  }
}

// Default Action Executors

class HttpRequestExecutor implements ActionExecutor {
  type = 'http_request';

  async execute(action: WorkflowAction, context: WorkflowContext): Promise<any> {
    const { method = 'GET', url, headers = {}, body, timeout = 30000 } = action.parameters;
    
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  }

  estimateCost(action: WorkflowAction, context: WorkflowContext): BudgetInfo {
    return {
      tokens: 5,
      computeTime: 1000, // 1 second
      memory: 1024 * 1024, // 1MB
      apiCalls: 1,
      monetaryCost: 0.001
    };
  }
}

class FileOperationExecutor implements ActionExecutor {
  type = 'file_operation';

  async execute(action: WorkflowAction, context: WorkflowContext): Promise<any> {
    const { operation, path, content, encoding = 'utf8' } = action.parameters;
    
    const fs = await import('fs/promises');
    
    switch (operation) {
      case 'read':
        return await fs.readFile(path, encoding);
      case 'write':
        await fs.writeFile(path, content, encoding);
        return { success: true, path };
      case 'delete':
        await fs.unlink(path);
        return { success: true, path };
      case 'exists':
        try {
          await fs.access(path);
          return { exists: true, path };
        } catch {
          return { exists: false, path };
        }
      default:
        throw new Error(`Unsupported file operation: ${operation}`);
    }
  }

  estimateCost(action: WorkflowAction, context: WorkflowContext): BudgetInfo {
    const { operation, content } = action.parameters;
    const contentSize = content ? content.length : 0;
    
    return {
      tokens: Math.ceil(contentSize / 1000),
      computeTime: 100 + Math.ceil(contentSize / 10000),
      memory: contentSize,
      apiCalls: 0,
      monetaryCost: 0
    };
  }
}

class ShellCommandExecutor implements ActionExecutor {
  type = 'shell_command';

  async execute(action: WorkflowAction, context: WorkflowContext): Promise<any> {
    const { command, args = [], timeout = 30000, cwd } = action.parameters;
    
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { 
        cwd,
        stdio: 'pipe',
        timeout
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, exitCode: code });
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
        }
      });
      
      child.on('error', reject);
    });
  }

  estimateCost(action: WorkflowAction, context: WorkflowContext): BudgetInfo {
    return {
      tokens: 10,
      computeTime: 5000, // 5 seconds
      memory: 10 * 1024 * 1024, // 10MB
      apiCalls: 0,
      monetaryCost: 0
    };
  }
}

class DataProcessingExecutor implements ActionExecutor {
  type = 'data_processing';

  async execute(action: WorkflowAction, context: WorkflowContext): Promise<any> {
    const { operation, data, parameters = {} } = action.parameters;
    
    switch (operation) {
      case 'transform':
        return this.transformData(data, parameters);
      case 'filter':
        return this.filterData(data, parameters);
      case 'aggregate':
        return this.aggregateData(data, parameters);
      case 'sort':
        return this.sortData(data, parameters);
      default:
        throw new Error(`Unsupported data processing operation: ${operation}`);
    }
  }

  estimateCost(action: WorkflowAction, context: WorkflowContext): BudgetInfo {
    const { data } = action.parameters;
    const dataSize = JSON.stringify(data || {}).length;
    
    return {
      tokens: Math.ceil(dataSize / 100),
      computeTime: Math.max(100, dataSize / 1000),
      memory: dataSize * 2,
      apiCalls: 0,
      monetaryCost: 0
    };
  }

  private transformData(data: any, parameters: any): any {
    // Implementation would depend on transformation rules
    return data;
  }

  private filterData(data: any[], parameters: any): any[] {
    if (!Array.isArray(data)) return data;
    
    const { condition } = parameters;
    if (!condition) return data;
    
    return data.filter(item => this.evaluateCondition(item, condition));
  }

  private aggregateData(data: any[], parameters: any): any {
    if (!Array.isArray(data)) return data;
    
    const { groupBy, aggregations } = parameters;
    // Simplified aggregation logic
    return data;
  }

  private sortData(data: any[], parameters: any): any[] {
    if (!Array.isArray(data)) return data;
    
    const { field, order = 'asc' } = parameters;
    return data.sort((a, b) => {
      const aVal = field ? a[field] : a;
      const bVal = field ? b[field] : b;
      
      if (order === 'desc') {
        return bVal > aVal ? 1 : -1;
      } else {
        return aVal > bVal ? 1 : -1;
      }
    });
  }

  private evaluateCondition(item: any, condition: any): boolean {
    // Simplified condition evaluation
    return true;
  }
}

class DelayExecutor implements ActionExecutor {
  type = 'delay';

  async execute(action: WorkflowAction, context: WorkflowContext): Promise<any> {
    const { duration } = action.parameters;
    await new Promise(resolve => setTimeout(resolve, duration));
    return { delayed: duration };
  }

  estimateCost(action: WorkflowAction, context: WorkflowContext): BudgetInfo {
    const { duration } = action.parameters;
    return {
      tokens: 1,
      computeTime: duration,
      memory: 0,
      apiCalls: 0,
      monetaryCost: 0
    };
  }
}

class VariableExecutor implements ActionExecutor {
  type = 'variable';

  async execute(action: WorkflowAction, context: WorkflowContext): Promise<any> {
    const { operation, name, value, expression } = action.parameters;
    
    switch (operation) {
      case 'set':
        context.variables[name] = value;
        return { name, value };
      case 'get':
        return { name, value: context.variables[name] };
      case 'evaluate':
        // Simplified expression evaluation
        const result = this.evaluateExpression(expression, context);
        return { expression, result };
      default:
        throw new Error(`Unsupported variable operation: ${operation}`);
    }
  }

  estimateCost(action: WorkflowAction, context: WorkflowContext): BudgetInfo {
    return {
      tokens: 2,
      computeTime: 10,
      memory: 1024,
      apiCalls: 0,
      monetaryCost: 0
    };
  }

  private evaluateExpression(expression: string, context: WorkflowContext): any {
    // Simplified expression evaluation
    // In a real implementation, you'd use a proper expression parser
    return expression;
  }
}

class ConditionalExecutor implements ActionExecutor {
  type = 'conditional';

  async execute(action: WorkflowAction, context: WorkflowContext): Promise<any> {
    const { condition, trueValue, falseValue } = action.parameters;
    
    const conditionResult = this.evaluateCondition(condition, context);
    return {
      condition,
      result: conditionResult,
      value: conditionResult ? trueValue : falseValue
    };
  }

  estimateCost(action: WorkflowAction, context: WorkflowContext): BudgetInfo {
    return {
      tokens: 5,
      computeTime: 50,
      memory: 1024,
      apiCalls: 0,
      monetaryCost: 0
    };
  }

  private evaluateCondition(condition: any, context: WorkflowContext): boolean {
    // Simplified condition evaluation
    // Real implementation would handle complex condition logic
    return Boolean(condition);
  }
}