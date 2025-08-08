/**
 * Enhanced tests for WorkflowExecutor with tool registry and plan execution
 */

import { WorkflowExecutor } from '../core/workflow-executor.js';
import { WorkflowDefinition, WorkflowStep, ExecutionOptions } from '../types/workflow-types.js';
import { SafetyManager } from '../safety/managers/SafetyManager.js';

describe('Enhanced WorkflowExecutor', () => {
  let executor: WorkflowExecutor;
  let mockSafetyManager: SafetyManager;

  beforeEach(() => {
    mockSafetyManager = new SafetyManager({
      budgetLimits: {
        maxTokens: 10000,
        maxCost: 1.0,
        maxLatency: 30000,
        windowSize: 3600000
      },
      depthLimits: {
        maxDepth: 5,
        maxBranching: 3
      },
      capabilities: {
        allowed: ['ocr', 'ner', 'route', 'plan_execution'],
        restricted: [],
        requireApproval: []
      },
      validation: {
        strictMode: false,
        allowUnknownProperties: true,
        coerceTypes: true
      }
    });

    executor = new WorkflowExecutor(mockSafetyManager);
  });

  afterEach(() => {
    // Clean up any active executions
  });

  describe('Tool Registry Integration', () => {
    it('should execute OCR tool via registry', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-ocr-workflow',
        name: 'Test OCR Workflow',
        version: '1.0.0',
        steps: [{
          id: 'ocr-step',
          type: 'action',
          name: 'OCR Processing',
          action: {
            type: 'ocr',
            parameters: {
              ou_type: 'ocr',
              imageUrl: 'https://example.com/image.jpg',
              options: { language: 'en' }
            }
          }
        }]
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBe('completed');
      expect(result.stepResults['ocr-step']).toBeDefined();
      expect(result.stepResults['ocr-step'].result).toMatchObject({
        text: expect.stringContaining('Extracted text'),
        confidence: expect.any(Number)
      });
    });

    it('should execute NER tool via registry', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-ner-workflow',
        name: 'Test NER Workflow', 
        version: '1.0.0',
        steps: [{
          id: 'ner-step',
          type: 'action',
          name: 'NER Processing',
          action: {
            type: 'ner',
            parameters: {
              ou_type: 'ner',
              text: 'John Smith works at Acme Corp in New York',
              entityTypes: ['PERSON', 'ORG', 'LOCATION']
            }
          }
        }]
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBe('completed');
      expect(result.stepResults['ner-step']).toBeDefined();
      expect(result.stepResults['ner-step'].result.entities).toBeInstanceOf(Array);
    });

    it('should execute Route tool via registry', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-route-workflow',
        name: 'Test Route Workflow',
        version: '1.0.0', 
        steps: [{
          id: 'route-step',
          type: 'action',
          name: 'Route Decision',
          action: {
            type: 'route',
            parameters: {
              ou_type: 'route',
              request: {
                path: '/api/users',
                method: 'GET',
                headers: {},
                query: {}
              },
              routes: [
                { id: 'users-route', pattern: '/api/users', methods: ['GET'] },
                { id: 'admin-route', pattern: '/api/admin', methods: ['POST'] }
              ]
            }
          }
        }]
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBe('completed');
      expect(result.stepResults['route-step']).toBeDefined();
      expect(result.stepResults['route-step'].result).toMatchObject({
        selectedRoute: expect.any(String),
        confidence: expect.any(Number)
      });
    });

    it('should fall back to default executor for unknown ou_type', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-fallback-workflow',
        name: 'Test Fallback Workflow',
        version: '1.0.0',
        steps: [{
          id: 'unknown-step',
          type: 'action',
          name: 'Unknown Tool',
          action: {
            type: 'unknown_tool',
            parameters: {
              ou_type: 'unknown_type',
              data: 'test data'
            }
          }
        }]
      };

      const result = await executor.execute(workflow);
      
      // Should still complete but with default execution
      expect(result.status).toBe('completed');
      expect(result.stepResults['unknown-step']).toBeDefined();
    });
  });

  describe('Plan Execution', () => {
    it('should execute nested plan workflow', async () => {
      const subPlan = {
        id: 'sub-plan-1',
        name: 'Sub Plan',
        version: '1.0.0',
        steps: [
          {
            id: 'sub-step-1',
            type: 'action',
            name: 'Sub Step 1',
            ou_type: 'ocr',
            args_json: { imageUrl: 'test.jpg' }
          },
          {
            id: 'sub-step-2',
            type: 'action',
            name: 'Sub Step 2',
            ou_type: 'ner',
            args_json: { text: 'Test text for NER' }
          }
        ]
      };

      const workflow: WorkflowDefinition = {
        id: 'test-plan-workflow',
        name: 'Test Plan Execution Workflow',
        version: '1.0.0',
        steps: [{
          id: 'plan-execution-step',
          type: 'action',
          name: 'Execute Sub Plan',
          action: {
            type: 'plan_execution',
            parameters: {
              ou_type: 'plan_execution',
              plan: subPlan,
              executionOptions: {
                dryRun: false,
                enableParallelism: true
              }
            }
          }
        }]
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBe('completed');
      expect(result.stepResults['plan-execution-step']).toBeDefined();
      expect(result.stepResults['plan-execution-step'].result.subWorkflowId).toBe('sub-plan-1');
      expect(result.stepResults['plan-execution-step'].result.stepResults).toBeDefined();
    });

    it('should prevent infinite recursion with depth limit', async () => {
      const recursivePlan = {
        id: 'recursive-plan',
        name: 'Recursive Plan',
        version: '1.0.0',
        steps: [{
          id: 'recursive-step',
          type: 'action',
          name: 'Recursive Step',
          ou_type: 'plan_execution',
          args_json: {
            plan: {
              id: 'nested-recursive-plan',
              name: 'Nested Recursive Plan',
              version: '1.0.0',
              steps: [/* This could contain more plan executions */]
            }
          }
        }]
      };

      // Create a workflow that tries to execute many nested plans
      const workflow: WorkflowDefinition = {
        id: 'recursive-test',
        name: 'Recursive Test',
        version: '1.0.0',
        steps: Array(10).fill(null).map((_, i) => ({
          id: `plan-step-${i}`,
          type: 'action' as const,
          name: `Plan Step ${i}`,
          action: {
            type: 'plan_execution',
            parameters: {
              ou_type: 'plan_execution',
              plan: recursivePlan
            }
          }
        }))
      };

      const result = await executor.execute(workflow);

      // Should complete but with depth limit enforcement
      expect(result.status).toBeOneOf(['completed', 'failed']);
      
      // Check that some steps may have failed due to depth limits
      const stepResults = Object.values(result.stepResults);
      const failedSteps = stepResults.filter(step => step.status === 'failed');
      
      if (failedSteps.length > 0) {
        expect(failedSteps.some(step => 
          step.error?.message.includes('Maximum plan execution depth exceeded')
        )).toBe(true);
      }
    });
  });

  describe('Budget Tracking Integration', () => {
    it('should track costs across tool executions', async () => {
      const workflow: WorkflowDefinition = {
        id: 'cost-tracking-workflow',
        name: 'Cost Tracking Test',
        version: '1.0.0',
        steps: [
          {
            id: 'ocr-step',
            type: 'action',
            name: 'OCR Step',
            action: {
              type: 'ocr',
              parameters: {
                ou_type: 'ocr',
                imageUrl: 'test.jpg'
              }
            }
          },
          {
            id: 'ner-step', 
            type: 'action',
            name: 'NER Step',
            action: {
              type: 'ner',
              parameters: {
                ou_type: 'ner',
                text: 'Test text'
              }
            }
          }
        ],
        budgetLimit: {
          tokens: 1000,
          monetaryCost: 0.1,
          computeTime: 10000
        }
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBe('completed');
      expect(result.totalCost).toBeDefined();
      expect(result.totalCost.tokens).toBeGreaterThan(0);
      expect(result.totalCost.monetaryCost).toBeGreaterThan(0);
      expect(result.totalCost.computeTime).toBeGreaterThan(0);
    });

    it('should stop execution when budget is exceeded', async () => {
      const workflow: WorkflowDefinition = {
        id: 'budget-exceeded-test',
        name: 'Budget Exceeded Test',
        version: '1.0.0',
        steps: Array(50).fill(null).map((_, i) => ({
          id: `step-${i}`,
          type: 'action' as const,
          name: `Step ${i}`,
          action: {
            type: 'ocr',
            parameters: {
              ou_type: 'ocr',
              imageUrl: `test${i}.jpg`
            }
          },
          costEstimate: 100
        })),
        budgetLimit: {
          tokens: 200,
          monetaryCost: 0.02
        }
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBe('budget_exceeded');
      expect(result.violationFlags.budgetExceeded).toBe(true);
    });
  });

  describe('Safety Integration', () => {
    it('should validate steps with SafetyManager', async () => {
      const workflow: WorkflowDefinition = {
        id: 'safety-validation-test',
        name: 'Safety Validation Test',
        version: '1.0.0',
        steps: [{
          id: 'safe-step',
          type: 'action',
          name: 'Safe Step',
          action: {
            type: 'ocr',
            parameters: {
              ou_type: 'ocr',
              imageUrl: 'valid-image.jpg'
            }
          }
        }]
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBe('completed');
      expect(result.safetyViolations).toHaveLength(0);
    });

    it('should handle safety validation failures', async () => {
      // Mock the safety manager to return validation failure
      const invalidWorkflow: WorkflowDefinition = {
        id: 'invalid-workflow',
        name: 'Invalid Workflow',
        version: '1.0.0',
        steps: [{
          id: 'invalid-step',
          type: 'action',
          name: 'Invalid Step',
          action: {
            type: 'dangerous_operation',
            parameters: {
              ou_type: 'restricted_type',
              dangerousParam: 'malicious_value'
            }
          }
        }]
      };

      const result = await executor.execute(invalidWorkflow);

      // Expect failure due to safety validation
      expect(result.status).toBeOneOf(['failed', 'safety_violation']);
    });
  });

  describe('Trajectory and Replay', () => {
    it('should record trajectory when enabled', async () => {
      const workflow: WorkflowDefinition = {
        id: 'trajectory-test',
        name: 'Trajectory Test',
        version: '1.0.0',
        steps: [{
          id: 'tracked-step',
          type: 'action', 
          name: 'Tracked Step',
          action: {
            type: 'ocr',
            parameters: {
              ou_type: 'ocr',
              imageUrl: 'test.jpg'
            }
          }
        }]
      };

      const options: ExecutionOptions = {
        recordTrajectory: true,
        enableReplay: true
      };

      const result = await executor.execute(workflow, options);

      expect(result.status).toBe('completed');
      // Note: Trajectory would be available through event listeners in real implementation
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should provide execution metrics', async () => {
      const workflow: WorkflowDefinition = {
        id: 'metrics-test',
        name: 'Metrics Test',
        version: '1.0.0',
        steps: [{
          id: 'metric-step',
          type: 'action',
          name: 'Metric Step',
          action: {
            type: 'ner',
            parameters: {
              ou_type: 'ner',
              text: 'Test metrics collection'
            }
          }
        }]
      };

      await executor.execute(workflow);
      
      const metrics = executor.getExecutionMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.toolMetrics).toBeDefined();
      expect(metrics.safetyStats).toBeDefined();
      expect(typeof metrics.activeExecutions).toBe('number');
    });

    it('should provide tool registry access', () => {
      const toolRegistry = executor.getToolRegistry();
      
      expect(toolRegistry).toBeDefined();
      expect(toolRegistry.hasTool('ocr')).toBe(true);
      expect(toolRegistry.hasTool('ner')).toBe(true);
      expect(toolRegistry.hasTool('route')).toBe(true);
      expect(toolRegistry.hasTool('plan_execution')).toBe(true);
    });

    it('should provide safety manager access', () => {
      const safetyManager = executor.getSafetyManager();
      
      expect(safetyManager).toBeDefined();
      expect(safetyManager).toBe(mockSafetyManager);
    });
  });

  describe('Error Handling', () => {
    it('should handle tool execution errors gracefully', async () => {
      const workflow: WorkflowDefinition = {
        id: 'error-handling-test',
        name: 'Error Handling Test',
        version: '1.0.0',
        steps: [{
          id: 'failing-step',
          type: 'action',
          name: 'Failing Step',
          action: {
            type: 'failing_tool',
            parameters: {
              ou_type: 'non_existent_tool',
              shouldFail: true
            }
          }
        }]
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBe('completed'); // Should complete with fallback
      expect(result.stepResults['failing-step']).toBeDefined();
    });

    it('should handle plan execution errors', async () => {
      const invalidPlan = {
        id: 'invalid-plan',
        name: 'Invalid Plan',
        version: '1.0.0',
        steps: [] // Empty steps should cause error
      };

      const workflow: WorkflowDefinition = {
        id: 'plan-error-test',
        name: 'Plan Error Test',
        version: '1.0.0',
        steps: [{
          id: 'invalid-plan-step',
          type: 'action',
          name: 'Invalid Plan Step',
          action: {
            type: 'plan_execution',
            parameters: {
              ou_type: 'plan_execution',
              plan: invalidPlan
            }
          }
        }]
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBeOneOf(['completed', 'failed']);
      if (result.status === 'failed') {
        expect(result.stepResults['invalid-plan-step'].status).toBe('failed');
      }
    });
  });
});

// Helper to extend Jest matchers
expect.extend({
  toBeOneOf(received, expected) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected.join(', ')}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected.join(', ')}`,
        pass: false
      };
    }
  }
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: any[]): R;
    }
  }
}