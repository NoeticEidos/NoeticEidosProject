/**
 * Tool Registry for dynamic tool loading and execution
 * Manages registration and execution of workflow tools based on ou_type
 */

import { WorkflowAction, WorkflowContext, StepResult, BudgetInfo } from '../types/workflow-types.js';
import { ActionExecutor } from '../execution/step-executor.js';

export interface ToolDefinition {
  ou_type: string;
  name: string;
  description: string;
  executor: ActionExecutor;
  costMultiplier: number;
  timeout: number;
  retryable: boolean;
  capabilities: string[];
}

export interface ToolExecutionContext {
  executionId: string;
  stepId: string;
  context: WorkflowContext;
  timeout?: number;
  retryAttempt?: number;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private executionMetrics: Map<string, ToolMetrics> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * Register a tool with the registry
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.ou_type, tool);
    this.executionMetrics.set(tool.ou_type, {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      totalCost: { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 }
    });
  }

  /**
   * Execute a tool based on ou_type
   */
  async executeTool(
    ou_type: string, 
    action: WorkflowAction, 
    executionContext: ToolExecutionContext
  ): Promise<StepResult> {
    const tool = this.tools.get(ou_type);
    if (!tool) {
      throw new Error(`Tool not found for ou_type: ${ou_type}`);
    }

    const startTime = new Date();
    const metrics = this.executionMetrics.get(ou_type)!;
    metrics.totalExecutions++;

    try {
      // Set execution timeout
      const timeout = executionContext.timeout || tool.timeout;
      const executionPromise = tool.executor.execute(action, executionContext.context, {
        executionId: executionContext.executionId,
        stepResults: new Map(),
        workflow: null,
        options: {},
        startTime: new Date(),
        context: executionContext.context,
        trajectory: null,
        cancelled: false,
        currentStep: executionContext.stepId
      });

      let result: any;
      if (timeout > 0) {
        result = await Promise.race([
          executionPromise,
          this.createTimeoutPromise(timeout, `Tool ${ou_type} timed out after ${timeout}ms`)
        ]);
      } else {
        result = await executionPromise;
      }

      // Calculate cost with tool multiplier
      const baseCost = tool.executor.estimateCost(action, executionContext.context);
      const adjustedCost = this.adjustCostWithMultiplier(baseCost, tool.costMultiplier);

      // Update metrics
      metrics.successfulExecutions++;
      this.updateAverageExecutionTime(metrics, Date.now() - startTime.getTime());
      this.accumulateCost(metrics.totalCost, adjustedCost);

      return {
        stepId: executionContext.stepId,
        status: 'completed',
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        result,
        cost: adjustedCost,
        metadata: {
          toolName: tool.name,
          ou_type,
          retryAttempt: executionContext.retryAttempt || 0
        }
      };
    } catch (error) {
      metrics.failedExecutions++;
      this.updateAverageExecutionTime(metrics, Date.now() - startTime.getTime());

      return {
        stepId: executionContext.stepId,
        status: 'failed',
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        error: error as Error,
        cost: { tokens: 1, computeTime: 100, memory: 0, apiCalls: 0, monetaryCost: 0 },
        metadata: {
          toolName: tool.name,
          ou_type,
          errorMessage: (error as Error).message,
          retryAttempt: executionContext.retryAttempt || 0
        }
      };
    }
  }

  /**
   * Get tool definition by ou_type
   */
  getTool(ou_type: string): ToolDefinition | null {
    return this.tools.get(ou_type) || null;
  }

  /**
   * Check if tool exists for ou_type
   */
  hasTool(ou_type: string): boolean {
    return this.tools.has(ou_type);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool execution metrics
   */
  getToolMetrics(ou_type: string): ToolMetrics | null {
    return this.executionMetrics.get(ou_type) || null;
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, ToolMetrics> {
    const metrics: Record<string, ToolMetrics> = {};
    for (const [ou_type, toolMetrics] of this.executionMetrics) {
      metrics[ou_type] = { ...toolMetrics };
    }
    return metrics;
  }

  /**
   * Reset metrics for a tool
   */
  resetToolMetrics(ou_type: string): boolean {
    if (!this.executionMetrics.has(ou_type)) {
      return false;
    }

    this.executionMetrics.set(ou_type, {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      totalCost: { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 }
    });

    return true;
  }

  /**
   * Unregister a tool
   */
  unregisterTool(ou_type: string): boolean {
    const removed = this.tools.delete(ou_type);
    if (removed) {
      this.executionMetrics.delete(ou_type);
    }
    return removed;
  }

  private registerDefaultTools(): void {
    // Register OCR tool
    this.registerTool({
      ou_type: 'ocr',
      name: 'OCR Tool',
      description: 'Optical Character Recognition',
      executor: new OCRToolExecutor(),
      costMultiplier: 1.2,
      timeout: 30000,
      retryable: true,
      capabilities: ['vision', 'text-extraction']
    });

    // Register NER tool  
    this.registerTool({
      ou_type: 'ner',
      name: 'NER Tool', 
      description: 'Named Entity Recognition',
      executor: new NERToolExecutor(),
      costMultiplier: 1.0,
      timeout: 15000,
      retryable: true,
      capabilities: ['nlp', 'entity-extraction']
    });

    // Register Route tool
    this.registerTool({
      ou_type: 'route',
      name: 'Route Tool',
      description: 'Request routing and decision making',
      executor: new RouteToolExecutor(),
      costMultiplier: 0.8,
      timeout: 10000,
      retryable: true,
      capabilities: ['routing', 'decision']
    });

    // Register generic plan execution tool
    this.registerTool({
      ou_type: 'plan_execution',
      name: 'Plan Execution Tool',
      description: 'Execute workflow plans and sub-workflows',
      executor: new PlanExecutionToolExecutor(),
      costMultiplier: 1.5,
      timeout: 60000,
      retryable: false,
      capabilities: ['workflow', 'orchestration']
    });
  }

  private adjustCostWithMultiplier(cost: BudgetInfo, multiplier: number): BudgetInfo {
    return {
      tokens: Math.ceil((cost.tokens || 0) * multiplier),
      computeTime: Math.ceil((cost.computeTime || 0) * multiplier),
      memory: Math.ceil((cost.memory || 0) * multiplier),
      apiCalls: Math.ceil((cost.apiCalls || 0) * multiplier),
      monetaryCost: (cost.monetaryCost || 0) * multiplier,
      customMetrics: cost.customMetrics ? 
        Object.fromEntries(
          Object.entries(cost.customMetrics).map(([k, v]) => [k, v * multiplier])
        ) : undefined
    };
  }

  private updateAverageExecutionTime(metrics: ToolMetrics, executionTime: number): void {
    const totalTime = metrics.averageExecutionTime * (metrics.totalExecutions - 1);
    metrics.averageExecutionTime = (totalTime + executionTime) / metrics.totalExecutions;
  }

  private accumulateCost(totalCost: BudgetInfo, newCost: BudgetInfo): void {
    totalCost.tokens = (totalCost.tokens || 0) + (newCost.tokens || 0);
    totalCost.computeTime = (totalCost.computeTime || 0) + (newCost.computeTime || 0);
    totalCost.memory = (totalCost.memory || 0) + (newCost.memory || 0);
    totalCost.apiCalls = (totalCost.apiCalls || 0) + (newCost.apiCalls || 0);
    totalCost.monetaryCost = (totalCost.monetaryCost || 0) + (newCost.monetaryCost || 0);

    if (newCost.customMetrics) {
      totalCost.customMetrics = totalCost.customMetrics || {};
      for (const [metric, value] of Object.entries(newCost.customMetrics)) {
        totalCost.customMetrics[metric] = (totalCost.customMetrics[metric] || 0) + value;
      }
    }
  }

  private async createTimeoutPromise(timeout: number, message: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeout);
    });
  }
}

interface ToolMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  totalCost: BudgetInfo;
}

// Default tool executors
class OCRToolExecutor implements ActionExecutor {
  type = 'ocr';

  async execute(action: WorkflowAction, context: WorkflowContext): Promise<any> {
    // OCR implementation would go here
    const { imageUrl, options = {} } = action.parameters;
    
    // Simulate OCR processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      text: `Extracted text from ${imageUrl}`,
      confidence: 0.95,
      boundingBoxes: [],
      processingTime: 1000,
      ...options
    };
  }

  estimateCost(action: WorkflowAction, context: WorkflowContext): BudgetInfo {
    return {
      tokens: 50,
      computeTime: 2000,
      memory: 5 * 1024 * 1024,
      apiCalls: 1,
      monetaryCost: 0.01
    };
  }
}

class NERToolExecutor implements ActionExecutor {
  type = 'ner';

  async execute(action: WorkflowAction, context: WorkflowContext): Promise<any> {
    const { text, entityTypes = [] } = action.parameters;
    
    // Simulate NER processing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      entities: [
        { type: 'PERSON', text: 'Sample Person', start: 0, end: 13, confidence: 0.9 },
        { type: 'ORG', text: 'Sample Corp', start: 20, end: 31, confidence: 0.85 }
      ],
      processingTime: 500,
      entityTypes
    };
  }

  estimateCost(action: WorkflowAction, context: WorkflowContext): BudgetInfo {
    const textLength = action.parameters.text?.length || 0;
    return {
      tokens: Math.ceil(textLength / 4),
      computeTime: 500 + Math.ceil(textLength / 10),
      memory: textLength * 2,
      apiCalls: 1,
      monetaryCost: 0.005
    };
  }
}

class RouteToolExecutor implements ActionExecutor {
  type = 'route';

  async execute(action: WorkflowAction, context: WorkflowContext): Promise<any> {
    const { request, routes, options = {} } = action.parameters;
    
    // Simple routing logic
    const selectedRoute = routes[0] || null;
    
    return {
      selectedRoute: selectedRoute?.id,
      confidence: 0.8,
      reasoning: 'First available route selected',
      alternatives: routes.slice(1, 3).map((r: any) => ({
        route: r.id,
        score: 0.6,
        reason: 'Alternative route'
      }))
    };
  }

  estimateCost(action: WorkflowAction, context: WorkflowContext): BudgetInfo {
    const routeCount = action.parameters.routes?.length || 0;
    return {
      tokens: routeCount * 5,
      computeTime: 100 + routeCount * 50,
      memory: routeCount * 1024,
      apiCalls: 0,
      monetaryCost: 0.001
    };
  }
}

class PlanExecutionToolExecutor implements ActionExecutor {
  type = 'plan_execution';

  async execute(action: WorkflowAction, context: WorkflowContext): Promise<any> {
    const { plan, executionOptions = {} } = action.parameters;
    
    // This would execute a sub-workflow/plan
    // For now, simulate execution
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      planId: plan.id || 'unknown',
      status: 'completed',
      stepsExecuted: plan.steps?.length || 0,
      executionTime: 2000,
      results: plan.steps?.map((step: any, idx: number) => ({
        stepId: step.id || `step_${idx}`,
        status: 'completed',
        result: { success: true }
      })) || []
    };
  }

  estimateCost(action: WorkflowAction, context: WorkflowContext): BudgetInfo {
    const stepCount = action.parameters.plan?.steps?.length || 1;
    return {
      tokens: stepCount * 20,
      computeTime: stepCount * 1000,
      memory: stepCount * 2 * 1024 * 1024,
      apiCalls: stepCount,
      monetaryCost: stepCount * 0.01
    };
  }
}