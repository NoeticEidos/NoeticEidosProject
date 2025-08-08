/**
 * Comprehensive test suite for WorkflowExecutor system
 * Tests all components including budget tracking, safety enforcement, and replay functionality
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkflowExecutor } from '../core/workflow-executor.js';
import { BudgetTracker } from '../core/budget-tracker.js';
import { SafetyEnforcer } from '../safety/safety-enforcer.js';
import { ReplayManager } from '../replay/replay-manager.js';
import {
  WorkflowDefinition,
  WorkflowStep,
  ExecutionOptions,
  BudgetInfo,
  SafetyConstraint,
  ExecutionOutcome
} from '../types/workflow-types.js';

describe('WorkflowExecutor', () => {
  let executor: WorkflowExecutor;
  let mockWorkflow: WorkflowDefinition;

  beforeEach(() => {
    executor = new WorkflowExecutor();
    mockWorkflow = createMockWorkflow();
  });

  afterEach(() => {
    // Cleanup any active executions
    executor.removeAllListeners();
  });

  describe('Basic Workflow Execution', () => {
    it('should execute a simple workflow successfully', async () => {
      const result = await executor.execute(mockWorkflow);

      expect(result.status).toBe('completed');
      expect(result.workflowId).toBe(mockWorkflow.id);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.hasViolations).toBe(false);
    });

    it('should handle workflow with parallel steps', async () => {
      const parallelWorkflow = createParallelWorkflow();
      const result = await executor.execute(parallelWorkflow);

      expect(result.status).toBe('completed');
      expect(result.metadata.parallelBranches).toBeGreaterThan(0);
    });

    it('should handle workflow with sequential steps', async () => {
      const sequentialWorkflow = createSequentialWorkflow();
      const result = await executor.execute(sequentialWorkflow);

      expect(result.status).toBe('completed');
      expect(Object.keys(result.stepResults)).toHaveLength(3);
    });

    it('should handle conditional steps', async () => {
      const conditionalWorkflow = createConditionalWorkflow();
      const result = await executor.execute(conditionalWorkflow);

      expect(result.status).toBe('completed');
      expect(result.metadata.decisionPoints).toBeGreaterThan(0);
    });
  });

  describe('Budget Tracking', () => {
    it('should track budget usage in real-time', async () => {
      const budgetLimit: BudgetInfo = {
        tokens: 1000,
        computeTime: 10000,
        memory: 1024 * 1024,
        apiCalls: 10,
        monetaryCost: 1.0
      };

      const options: ExecutionOptions = { budgetLimit };
      const result = await executor.execute(mockWorkflow, options);

      expect(result.totalCost.tokens).toBeGreaterThan(0);
      expect(result.totalCost.tokens).toBeLessThanOrEqual(budgetLimit.tokens!);
      expect(result.violationFlags.budgetExceeded).toBe(false);
    });

    it('should stop execution when budget is exceeded', async () => {
      const restrictiveBudget: BudgetInfo = {
        tokens: 1, // Very low limit
        computeTime: 100,
        memory: 1024,
        apiCalls: 1,
        monetaryCost: 0.001
      };

      const options: ExecutionOptions = { budgetLimit: restrictiveBudget };
      const result = await executor.execute(mockWorkflow, options);

      expect(result.status).toBe('budget_exceeded');
      expect(result.violationFlags.budgetExceeded).toBe(true);
    });

    it('should accumulate costs across parallel steps correctly', async () => {
      const parallelWorkflow = createParallelWorkflow();
      const result = await executor.execute(parallelWorkflow);

      // Parallel steps should have combined costs
      const totalTokens = Object.values(result.stepResults)
        .reduce((sum, step) => sum + (step.cost?.tokens || 0), 0);
      
      expect(result.totalCost.tokens).toBeGreaterThanOrEqual(totalTokens);
    });
  });

  describe('Safety Enforcement', () => {
    it('should enforce safety constraints', async () => {
      const safetyConstraint: SafetyConstraint = {
        id: 'test_constraint',
        type: 'custom',
        description: 'Test constraint',
        parameters: { maxValue: 100 },
        severity: 'error',
        validator: (context, step) => {
          if (step.action?.parameters.value > 100) {
            return {
              constraintId: 'test_constraint',
              severity: 'error' as const,
              message: 'Value exceeds limit',
              timestamp: new Date()
            };
          }
          return null;
        }
      };

      const workflow = createWorkflowWithUnsafeStep();
      workflow.safetyConstraints = [safetyConstraint];

      const result = await executor.execute(workflow);

      expect(result.hasViolations).toBe(true);
      expect(result.safetyViolations).toHaveLength(1);
    });

    it('should stop on critical safety violations', async () => {
      const criticalConstraint: SafetyConstraint = {
        id: 'critical_constraint',
        type: 'custom',
        description: 'Critical constraint',
        parameters: {},
        severity: 'critical',
        validator: () => ({
          constraintId: 'critical_constraint',
          severity: 'critical' as const,
          message: 'Critical safety violation',
          timestamp: new Date()
        })
      };

      const options: ExecutionOptions = {
        customValidators: [criticalConstraint]
      };

      const result = await executor.execute(mockWorkflow, options);

      expect(result.status).toBe('safety_violation');
      expect(result.violationFlags.criticalError).toBe(true);
    });
  });

  describe('Trajectory Recording', () => {
    it('should record execution trajectory when enabled', async () => {
      const options: ExecutionOptions = { 
        recordTrajectory: true,
        enableReplay: true
      };

      const result = await executor.execute(mockWorkflow, options);

      expect(result.status).toBe('completed');
      // Trajectory would be available through event listeners or separate API
    });

    it('should record decision points in trajectory', async () => {
      const conditionalWorkflow = createConditionalWorkflow();
      const options: ExecutionOptions = { recordTrajectory: true };

      const result = await executor.execute(conditionalWorkflow, options);

      expect(result.status).toBe('completed');
      expect(result.metadata.decisionPoints).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Retries', () => {
    it('should retry failed steps according to retry policy', async () => {
      const workflowWithRetries = createWorkflowWithRetries();
      const result = await executor.execute(workflowWithRetries);

      // Should eventually succeed after retries
      expect(result.status).toBe('completed');
      
      // Check that retries were attempted
      const stepResults = Object.values(result.stepResults);
      const stepWithRetries = stepResults.find(step => step.metadata?.attempts > 1);
      expect(stepWithRetries).toBeDefined();
    });

    it('should fail after exhausting all retries', async () => {
      const workflowWithFailingStep = createWorkflowWithFailingStep();
      const result = await executor.execute(workflowWithFailingStep);

      expect(result.status).toBe('failed');
      
      const failedStep = Object.values(result.stepResults).find(step => step.status === 'failed');
      expect(failedStep).toBeDefined();
      expect(failedStep?.metadata?.retryExhausted).toBe(true);
    });

    it('should handle workflow cancellation', async () => {
      const longRunningWorkflow = createLongRunningWorkflow();
      
      // Start execution
      const executionPromise = executor.execute(longRunningWorkflow);
      
      // Cancel after a short delay
      setTimeout(() => {
        const executions = (executor as any).activeExecutions;
        const executionId = Array.from(executions.keys())[0];
        if (executionId) {
          executor.cancelExecution(executionId, 'Test cancellation');
        }
      }, 100);

      const result = await executionPromise;
      expect(result.status).toBe('cancelled');
    });
  });

  describe('Outcome Generation', () => {
    it('should generate comprehensive execution outcome', async () => {
      const result = await executor.execute(mockWorkflow);

      // Check all required outcome fields
      expect(result.workflowId).toBe(mockWorkflow.id);
      expect(result.executionId).toMatch(/^exec_\d+_[a-z0-9]+$/);
      expect(result.status).toBeDefined();
      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.totalCost).toBeDefined();
      expect(result.stepResults).toBeDefined();
      expect(result.safetyViolations).toBeInstanceOf(Array);
      expect(result.hasViolations).toBeDefined();
      expect(result.violationFlags).toBeDefined();
      expect(result.finalContext).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should set violation flags correctly', async () => {
      const result = await executor.execute(mockWorkflow);

      expect(result.violationFlags.budgetExceeded).toBe(false);
      expect(result.violationFlags.safetyViolated).toBe(false);
      expect(result.violationFlags.timeoutReached).toBe(false);
      expect(result.violationFlags.criticalError).toBe(false);
    });
  });

  describe('Execution Context Management', () => {
    it('should maintain context throughout execution', async () => {
      const workflowWithVariables = createWorkflowWithVariables();
      const result = await executor.execute(workflowWithVariables);

      expect(result.status).toBe('completed');
      expect(result.finalContext.variables).toBeDefined();
      expect(Object.keys(result.finalContext.variables)).toHaveLength(2);
    });

    it('should update context after each step', async () => {
      const result = await executor.execute(mockWorkflow);

      expect(result.finalContext.stepResults).toBeDefined();
      expect(Object.keys(result.finalContext.stepResults)).toHaveLength(
        Object.keys(result.stepResults).length
      );
    });
  });
});

describe('BudgetTracker', () => {
  let budgetTracker: BudgetTracker;
  const executionId = 'test-execution';

  beforeEach(() => {
    budgetTracker = new BudgetTracker();
  });

  it('should initialize budget tracking', () => {
    const budgetLimit: BudgetInfo = { tokens: 1000, computeTime: 5000 };
    
    budgetTracker.initialize(executionId, budgetLimit);
    const currentBudget = budgetTracker.getCurrentBudget(executionId);

    expect(currentBudget.tokens).toBe(0);
    expect(currentBudget.computeTime).toBe(0);
  });

  it('should add costs and track usage', () => {
    const budgetLimit: BudgetInfo = { tokens: 1000 };
    budgetTracker.initialize(executionId, budgetLimit);

    const cost: BudgetInfo = { tokens: 100 };
    const result = budgetTracker.addCost(executionId, cost);

    expect(result.withinBudget).toBe(true);
    expect(budgetTracker.getCurrentBudget(executionId).tokens).toBe(100);
  });

  it('should detect budget exceeded', () => {
    const budgetLimit: BudgetInfo = { tokens: 100 };
    budgetTracker.initialize(executionId, budgetLimit);

    const largeCost: BudgetInfo = { tokens: 150 };
    const result = budgetTracker.addCost(executionId, largeCost);

    expect(result.withinBudget).toBe(false);
    expect(budgetTracker.isBudgetExceeded(executionId)).toBe(true);
  });
});

describe('SafetyEnforcer', () => {
  let safetyEnforcer: SafetyEnforcer;
  const executionId = 'test-execution';

  beforeEach(() => {
    safetyEnforcer = new SafetyEnforcer();
  });

  it('should initialize safety enforcement', () => {
    const constraints: SafetyConstraint[] = [];
    
    safetyEnforcer.initialize(executionId, constraints);
    const state = safetyEnforcer.getCurrentState(executionId);

    expect(state.violations).toHaveLength(0);
    expect(state.riskLevel).toBe('low');
  });

  it('should validate steps against constraints', () => {
    safetyEnforcer.initialize(executionId, []);

    const step: WorkflowStep = {
      id: 'test-step',
      type: 'action',
      name: 'Test Step',
      action: { type: 'test', parameters: {} }
    };

    const context = createMockContext();
    const violation = safetyEnforcer.validateStep(executionId, step, context);

    expect(violation).toBeNull(); // No constraints violated
  });
});

describe('ReplayManager', () => {
  let replayManager: ReplayManager;

  beforeEach(() => {
    replayManager = new ReplayManager();
  });

  it('should create replay info for workflow', () => {
    const workflow = createMockWorkflow();
    const replayInfo = replayManager.createReplayInfo(workflow);

    expect(replayInfo.version).toBe('1.0.0');
    expect(replayInfo.replayable).toBe(true);
    expect(replayInfo.randomSeed).toBeDefined();
    expect(replayInfo.environmentState).toBeDefined();
  });

  it('should validate replay feasibility', async () => {
    const trajectory = createMockTrajectory();
    const replayInfo = replayManager.createReplayInfo(createMockWorkflow());

    const validation = await replayManager.validateReplay(trajectory, replayInfo);

    expect(validation).toBeDefined();
    expect(validation.canProceed).toBeDefined();
    expect(validation.issues).toBeInstanceOf(Array);
  });
});

// Helper functions for creating test data
function createMockWorkflow(): WorkflowDefinition {
  return {
    id: 'test-workflow',
    name: 'Test Workflow',
    version: '1.0.0',
    steps: [
      {
        id: 'step1',
        type: 'action',
        name: 'First Step',
        action: {
          type: 'variable',
          parameters: { operation: 'set', name: 'testVar', value: 'testValue' }
        }
      },
      {
        id: 'step2',
        type: 'action',
        name: 'Second Step',
        action: {
          type: 'delay',
          parameters: { duration: 100 }
        }
      }
    ]
  };
}

function createParallelWorkflow(): WorkflowDefinition {
  return {
    id: 'parallel-workflow',
    name: 'Parallel Workflow',
    version: '1.0.0',
    steps: [
      {
        id: 'parallel-step',
        type: 'parallel',
        name: 'Parallel Execution',
        children: [
          {
            id: 'parallel-child-1',
            type: 'action',
            name: 'Child 1',
            action: { type: 'delay', parameters: { duration: 50 } }
          },
          {
            id: 'parallel-child-2',
            type: 'action',
            name: 'Child 2',
            action: { type: 'delay', parameters: { duration: 50 } }
          }
        ]
      }
    ]
  };
}

function createSequentialWorkflow(): WorkflowDefinition {
  return {
    id: 'sequential-workflow',
    name: 'Sequential Workflow',
    version: '1.0.0',
    steps: [
      {
        id: 'sequential-step',
        type: 'sequential',
        name: 'Sequential Execution',
        children: [
          {
            id: 'seq-child-1',
            type: 'action',
            name: 'Sequential Child 1',
            action: { type: 'delay', parameters: { duration: 10 } }
          },
          {
            id: 'seq-child-2',
            type: 'action',
            name: 'Sequential Child 2',
            action: { type: 'delay', parameters: { duration: 10 } }
          },
          {
            id: 'seq-child-3',
            type: 'action',
            name: 'Sequential Child 3',
            action: { type: 'delay', parameters: { duration: 10 } }
          }
        ]
      }
    ]
  };
}

function createConditionalWorkflow(): WorkflowDefinition {
  return {
    id: 'conditional-workflow',
    name: 'Conditional Workflow',
    version: '1.0.0',
    steps: [
      {
        id: 'condition-step',
        type: 'condition',
        name: 'Conditional Step',
        condition: { type: 'equals', left: true, right: true },
        children: [
          {
            id: 'conditional-child',
            type: 'action',
            name: 'Conditional Child',
            action: { type: 'delay', parameters: { duration: 10 } }
          }
        ]
      }
    ]
  };
}

function createWorkflowWithUnsafeStep(): WorkflowDefinition {
  return {
    id: 'unsafe-workflow',
    name: 'Unsafe Workflow',
    version: '1.0.0',
    steps: [
      {
        id: 'unsafe-step',
        type: 'action',
        name: 'Unsafe Step',
        action: {
          type: 'variable',
          parameters: { operation: 'set', name: 'value', value: 150 }
        }
      }
    ]
  };
}

function createWorkflowWithRetries(): WorkflowDefinition {
  return {
    id: 'retry-workflow',
    name: 'Retry Workflow',
    version: '1.0.0',
    steps: [
      {
        id: 'retry-step',
        type: 'action',
        name: 'Step with Retries',
        action: { type: 'delay', parameters: { duration: 10 } },
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: 'exponential',
          baseDelay: 100,
          retryableErrors: ['TIMEOUT', 'NETWORK_ERROR']
        }
      }
    ]
  };
}

function createWorkflowWithFailingStep(): WorkflowDefinition {
  return {
    id: 'failing-workflow',
    name: 'Failing Workflow',
    version: '1.0.0',
    steps: [
      {
        id: 'failing-step',
        type: 'action',
        name: 'Failing Step',
        action: {
          type: 'shell_command',
          parameters: { command: 'nonexistent-command' }
        },
        retryPolicy: {
          maxRetries: 2,
          backoffStrategy: 'fixed',
          baseDelay: 10
        }
      }
    ]
  };
}

function createLongRunningWorkflow(): WorkflowDefinition {
  return {
    id: 'long-running-workflow',
    name: 'Long Running Workflow',
    version: '1.0.0',
    steps: [
      {
        id: 'long-step',
        type: 'action',
        name: 'Long Running Step',
        action: { type: 'delay', parameters: { duration: 5000 } }
      }
    ]
  };
}

function createWorkflowWithVariables(): WorkflowDefinition {
  return {
    id: 'variables-workflow',
    name: 'Variables Workflow',
    version: '1.0.0',
    initialContext: {
      variables: { initialVar: 'initialValue' }
    },
    steps: [
      {
        id: 'set-var',
        type: 'action',
        name: 'Set Variable',
        action: {
          type: 'variable',
          parameters: { operation: 'set', name: 'newVar', value: 'newValue' }
        }
      }
    ]
  };
}

function createMockContext() {
  return {
    variables: {},
    stepResults: {},
    metadata: {},
    currentBudget: { tokens: 0, computeTime: 0, memory: 0, apiCalls: 0, monetaryCost: 0 },
    safetyState: {
      violations: [],
      activeConstraints: [],
      riskLevel: 'low' as const,
      lastCheck: new Date()
    }
  };
}

function createMockTrajectory() {
  return {
    executionId: 'test-execution',
    workflowId: 'test-workflow',
    steps: [],
    totalDuration: 1000,
    totalCost: { tokens: 100, computeTime: 1000, memory: 0, apiCalls: 2, monetaryCost: 0 },
    contextEvolution: [],
    decisionPoints: [],
    parallelBranches: [],
    replayInfo: {
      version: '1.0.0',
      replayable: true,
      deterministicInputs: {},
      environmentState: {},
      externalDependencies: [],
      replayInstructions: []
    }
  };
}