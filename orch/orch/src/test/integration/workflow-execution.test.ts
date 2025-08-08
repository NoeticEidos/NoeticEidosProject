/**
 * Integration Tests for Complete Workflow Execution
 * Tests end-to-end workflow processing with all safety systems
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { WorkflowExecutor } from '../../core/workflow-executor.js';
import { SafetyManager, SafetyConfig } from '../../safety/managers/SafetyManager.js';
import { BudgetTracker } from '../../core/budget-tracker.js';
import { PolicyServiceClient } from '../../client/policy-service-client.js';
import { WorkflowDefinition, WorkflowStep, ExecutionOptions, BudgetInfo } from '../../types/workflow-types.js';
import { StepExecutor } from '../../execution/step-executor.js';

// Mock external dependencies
jest.mock('../../client/policy-service-client.js');

describe('Workflow Execution Integration Tests', () => {
  let workflowExecutor: WorkflowExecutor;
  let safetyManager: SafetyManager;
  let budgetTracker: BudgetTracker;
  let stepExecutor: StepExecutor;
  let mockGrpcClient: jest.Mocked<PolicyServiceClient>;

  const defaultSafetyConfig: SafetyConfig = {
    budgetLimits: {
      tokenLimit: 50000,
      costLimit: 50,
      requestLimit: 100,
      timeLimit: 600000, // 10 minutes
      memoryLimit: 1024 * 1024 * 500, // 500MB
      concurrencyLimit: 10
    },
    depthLimits: {
      maxDepth: 10,
      maxBranching: 5
    },
    capabilities: {
      allowed: ['ocr', 'ner', 'route', 'workflow'],
      restricted: ['admin', 'system'],
      requireApproval: ['sensitive', 'financial']
    },
    validation: {
      strictMode: true,
      allowUnknownProperties: false,
      coerceTypes: false
    }
  };

  beforeAll(async () => {
    // Setup test environment
  });

  afterAll(async () => {
    // Cleanup test environment
  });

  beforeEach(() => {
    safetyManager = new SafetyManager(defaultSafetyConfig);
    budgetTracker = new BudgetTracker();
    stepExecutor = new StepExecutor();
    
    mockGrpcClient = new (PolicyServiceClient as any)() as jest.Mocked<PolicyServiceClient>;
    stepExecutor.setGrpcClient(mockGrpcClient);
    
    workflowExecutor = new WorkflowExecutor({
      safetyManager,
      budgetTracker,
      stepExecutor
    });
  });

  afterEach(async () => {
    // Cleanup any running workflows
    jest.clearAllMocks();
  });

  describe('Simple Workflow Execution', () => {
    it('should execute a single-step OCR workflow successfully', async () => {
      const workflow: WorkflowDefinition = {
        id: 'simple-ocr-workflow',
        name: 'Simple OCR Test',
        version: '1.0.0',
        steps: [
          {
            id: 'ocr-step-1',
            type: 'action',
            name: 'Extract text from image',
            action: {
              type: 'ocr',
              parameters: {
                imageUrl: 'https://example.com/test-image.jpg',
                language: 'en',
                confidence_threshold: 0.8
              },
              expectedDuration: 2000,
              expectedCost: 0.01
            },
            timeout: 30000,
            costEstimate: 0.01
          }
        ],
        budgetLimit: {
          tokens: 1000,
          computeTime: 30000,
          monetaryCost: 1.0,
          apiCalls: 5
        },
        replayable: true
      };

      const mockOcrResponse = {
        text: 'Hello World',
        confidence: 0.95,
        boundingBoxes: [
          {
            x: 10,
            y: 20,
            width: 100,
            height: 30,
            text: 'Hello World',
            confidence: 0.95
          }
        ]
      };

      mockGrpcClient.processOCR = jest.fn().mockResolvedValue(mockOcrResponse);

      const options: ExecutionOptions = {
        enableSafetyChecks: true,
        recordTrajectory: true,
        enableReplay: true
      };

      const outcome = await workflowExecutor.execute(workflow, options);

      expect(outcome.status).toBe('completed');
      expect(outcome.hasViolations).toBe(false);
      expect(outcome.stepResults['ocr-step-1'].status).toBe('completed');
      expect(outcome.stepResults['ocr-step-1'].result).toEqual(mockOcrResponse);
      expect(mockGrpcClient.processOCR).toHaveBeenCalledTimes(1);
    });

    it('should execute a single-step NER workflow successfully', async () => {
      const workflow: WorkflowDefinition = {
        id: 'simple-ner-workflow',
        name: 'Simple NER Test',
        version: '1.0.0',
        steps: [
          {
            id: 'ner-step-1',
            type: 'action',
            name: 'Extract entities from text',
            action: {
              type: 'ner',
              parameters: {
                text: 'John Smith works at Microsoft Corporation in Seattle.',
                entityTypes: ['PERSON', 'ORG', 'GPE'],
                confidenceThreshold: 0.8
              }
            },
            timeout: 10000
          }
        ],
        budgetLimit: {
          tokens: 500,
          computeTime: 10000,
          monetaryCost: 0.5,
          apiCalls: 3
        }
      };

      const mockNerResponse = {
        entities: [
          {
            text: 'John Smith',
            label: 'PERSON',
            start: 0,
            end: 10,
            confidence: 0.96
          },
          {
            text: 'Microsoft Corporation',
            label: 'ORG',
            start: 20,
            end: 42,
            confidence: 0.94
          },
          {
            text: 'Seattle',
            label: 'GPE',
            start: 46,
            end: 53,
            confidence: 0.89
          }
        ],
        originalText: 'John Smith works at Microsoft Corporation in Seattle.'
      };

      mockGrpcClient.processNER = jest.fn().mockResolvedValue(mockNerResponse);

      const outcome = await workflowExecutor.execute(workflow);

      expect(outcome.status).toBe('completed');
      expect(outcome.stepResults['ner-step-1'].result.entities).toHaveLength(3);
      expect(mockGrpcClient.processNER).toHaveBeenCalledTimes(1);
    });
  });

  describe('Multi-Step Sequential Workflows', () => {
    it('should execute OCR followed by NER workflow', async () => {
      const workflow: WorkflowDefinition = {
        id: 'ocr-ner-pipeline',
        name: 'OCR to NER Pipeline',
        version: '1.0.0',
        steps: [
          {
            id: 'ocr-step',
            type: 'action',
            name: 'Extract text from image',
            action: {
              type: 'ocr',
              parameters: {
                imageUrl: 'https://example.com/business-card.jpg',
                language: 'en'
              }
            },
            timeout: 30000
          },
          {
            id: 'ner-step',
            type: 'action',
            name: 'Extract entities from OCR text',
            action: {
              type: 'ner',
              parameters: {
                text: '${ocr-step.result.text}', // Reference previous step
                entityTypes: ['PERSON', 'ORG', 'MONEY']
              }
            },
            dependencies: ['ocr-step'],
            timeout: 15000
          }
        ],
        budgetLimit: {
          tokens: 2000,
          computeTime: 50000,
          monetaryCost: 2.0,
          apiCalls: 10
        }
      };

      const mockOcrResponse = {
        text: 'Dr. Jane Doe, CEO\nAcme Corp\n$50,000 salary',
        confidence: 0.92
      };

      const mockNerResponse = {
        entities: [
          {
            text: 'Dr. Jane Doe',
            label: 'PERSON',
            start: 0,
            end: 12,
            confidence: 0.98
          },
          {
            text: 'Acme Corp',
            label: 'ORG',
            start: 19,
            end: 28,
            confidence: 0.95
          },
          {
            text: '$50,000',
            label: 'MONEY',
            start: 29,
            end: 36,
            confidence: 0.91
          }
        ],
        originalText: 'Dr. Jane Doe, CEO\nAcme Corp\n$50,000 salary'
      };

      mockGrpcClient.processOCR = jest.fn().mockResolvedValue(mockOcrResponse);
      mockGrpcClient.processNER = jest.fn().mockResolvedValue(mockNerResponse);

      const outcome = await workflowExecutor.execute(workflow);

      expect(outcome.status).toBe('completed');
      expect(outcome.stepResults['ocr-step'].status).toBe('completed');
      expect(outcome.stepResults['ner-step'].status).toBe('completed');
      expect(outcome.stepResults['ner-step'].result.entities).toHaveLength(3);
      
      // Verify execution order
      expect(outcome.stepResults['ocr-step'].startTime).toBeLessThan(
        outcome.stepResults['ner-step'].startTime!
      );
    });

    it('should handle step failures gracefully', async () => {
      const workflow: WorkflowDefinition = {
        id: 'failing-workflow',
        name: 'Workflow with Failing Step',
        version: '1.0.0',
        steps: [
          {
            id: 'success-step',
            type: 'action',
            name: 'Successful step',
            action: {
              type: 'ocr',
              parameters: {
                imageUrl: 'https://example.com/valid-image.jpg',
                language: 'en'
              }
            },
            timeout: 10000
          },
          {
            id: 'failing-step',
            type: 'action',
            name: 'Failing step',
            action: {
              type: 'ner',
              parameters: {
                text: '${success-step.result.text}'
              }
            },
            dependencies: ['success-step'],
            timeout: 10000
          }
        ]
      };

      const mockOcrResponse = {
        text: 'Valid text extracted',
        confidence: 0.88
      };

      mockGrpcClient.processOCR = jest.fn().mockResolvedValue(mockOcrResponse);
      mockGrpcClient.processNER = jest.fn().mockRejectedValue(
        new Error('NER service temporarily unavailable')
      );

      const outcome = await workflowExecutor.execute(workflow);

      expect(outcome.status).toBe('failed');
      expect(outcome.stepResults['success-step'].status).toBe('completed');
      expect(outcome.stepResults['failing-step'].status).toBe('failed');
      expect(outcome.stepResults['failing-step'].error?.message).toContain('temporarily unavailable');
    });
  });

  describe('Parallel Execution Workflows', () => {
    it('should execute parallel OCR operations', async () => {
      const workflow: WorkflowDefinition = {
        id: 'parallel-ocr-workflow',
        name: 'Parallel OCR Processing',
        version: '1.0.0',
        steps: [
          {
            id: 'parallel-container',
            type: 'parallel',
            name: 'Process multiple images',
            children: [
              {
                id: 'ocr-1',
                type: 'action',
                name: 'OCR Image 1',
                action: {
                  type: 'ocr',
                  parameters: {
                    imageUrl: 'https://example.com/image1.jpg',
                    language: 'en'
                  }
                }
              },
              {
                id: 'ocr-2',
                type: 'action',
                name: 'OCR Image 2',
                action: {
                  type: 'ocr',
                  parameters: {
                    imageUrl: 'https://example.com/image2.jpg',
                    language: 'en'
                  }
                }
              },
              {
                id: 'ocr-3',
                type: 'action',
                name: 'OCR Image 3',
                action: {
                  type: 'ocr',
                  parameters: {
                    imageUrl: 'https://example.com/image3.jpg',
                    language: 'fr'
                  }
                }
              }
            ],
            timeout: 45000
          }
        ],
        budgetLimit: {
          tokens: 3000,
          computeTime: 60000,
          monetaryCost: 3.0,
          apiCalls: 15
        }
      };

      const mockResponses = [
        { text: 'Text from image 1', confidence: 0.94 },
        { text: 'Text from image 2', confidence: 0.91 },
        { text: 'Texte de l\'image 3', confidence: 0.87 }
      ];

      mockGrpcClient.processOCR = jest.fn()
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1])
        .mockResolvedValueOnce(mockResponses[2]);

      const options: ExecutionOptions = {
        parallelExecution: true,
        enableSafetyChecks: true
      };

      const outcome = await workflowExecutor.execute(workflow, options);

      expect(outcome.status).toBe('completed');
      expect(outcome.stepResults['ocr-1'].status).toBe('completed');
      expect(outcome.stepResults['ocr-2'].status).toBe('completed');
      expect(outcome.stepResults['ocr-3'].status).toBe('completed');
      expect(mockGrpcClient.processOCR).toHaveBeenCalledTimes(3);

      // Verify parallel execution (all should start around the same time)
      const startTimes = [
        outcome.stepResults['ocr-1'].startTime,
        outcome.stepResults['ocr-2'].startTime,
        outcome.stepResults['ocr-3'].startTime
      ];

      const maxTimeDiff = Math.max(...startTimes.map(t => t.getTime())) - 
                         Math.min(...startTimes.map(t => t.getTime()));
      expect(maxTimeDiff).toBeLessThan(1000); // Within 1 second
    });
  });

  describe('Budget Enforcement Integration', () => {
    it('should reject workflow exceeding budget limits', async () => {
      const workflow: WorkflowDefinition = {
        id: 'expensive-workflow',
        name: 'Expensive Workflow',
        version: '1.0.0',
        steps: [
          {
            id: 'expensive-step',
            type: 'action',
            name: 'Expensive OCR operation',
            action: {
              type: 'ocr',
              parameters: {
                imageUrl: 'https://example.com/large-image.jpg',
                language: 'en'
              },
              expectedCost: 100 // Exceeds budget
            },
            costEstimate: 100
          }
        ],
        budgetLimit: {
          tokens: 100,
          computeTime: 5000,
          monetaryCost: 1.0, // Low budget limit
          apiCalls: 5
        }
      };

      const options: ExecutionOptions = {
        enableSafetyChecks: true,
        budgetLimit: {
          monetaryCost: 1.0
        }
      };

      const outcome = await workflowExecutor.execute(workflow, options);

      expect(outcome.status).toBe('budget_exceeded');
      expect(outcome.violationFlags.budgetExceeded).toBe(true);
      expect(outcome.stepResults['expensive-step'].status).toBe('cancelled');
      expect(mockGrpcClient.processOCR).not.toHaveBeenCalled();
    });

    it('should track budget consumption accurately throughout workflow', async () => {
      const workflow: WorkflowDefinition = {
        id: 'budget-tracking-workflow',
        name: 'Budget Tracking Test',
        version: '1.0.0',
        steps: [
          {
            id: 'step-1',
            type: 'action',
            name: 'First operation',
            action: {
              type: 'ocr',
              parameters: {
                imageUrl: 'https://example.com/image1.jpg',
                language: 'en'
              },
              expectedCost: 0.5
            },
            costEstimate: 0.5
          },
          {
            id: 'step-2',
            type: 'action',
            name: 'Second operation',
            action: {
              type: 'ner',
              parameters: {
                text: '${step-1.result.text}'
              },
              expectedCost: 0.3
            },
            dependencies: ['step-1'],
            costEstimate: 0.3
          }
        ],
        budgetLimit: {
          tokens: 2000,
          monetaryCost: 2.0,
          apiCalls: 10
        }
      };

      mockGrpcClient.processOCR = jest.fn().mockResolvedValue({
        text: 'Sample extracted text',
        confidence: 0.89
      });

      mockGrpcClient.processNER = jest.fn().mockResolvedValue({
        entities: [],
        originalText: 'Sample extracted text'
      });

      const options: ExecutionOptions = {
        enableSafetyChecks: true,
        recordTrajectory: true
      };

      const outcome = await workflowExecutor.execute(workflow, options);

      expect(outcome.status).toBe('completed');
      expect(outcome.totalCost.monetaryCost).toBeCloseTo(0.8, 1);
      expect(outcome.violationFlags.budgetExceeded).toBe(false);
    });
  });

  describe('Safety Constraint Violations', () => {
    it('should reject workflow with depth limit violations', async () => {
      const deeplyNestedWorkflow: WorkflowDefinition = {
        id: 'deeply-nested-workflow',
        name: 'Deeply Nested Test',
        version: '1.0.0',
        steps: [
          {
            id: 'root-step',
            type: 'action',
            name: 'Root step',
            action: {
              type: 'ocr',
              parameters: {
                imageUrl: 'https://example.com/test.jpg',
                language: 'en'
              }
            },
            safetyConstraints: [
              {
                id: 'depth-constraint',
                type: 'resource_limit',
                description: 'Exceeds maximum depth',
                parameters: { depth: 15 }, // Exceeds limit of 10
                severity: 'error',
                validator: (context, step) => {
                  const depth = step.safetyConstraints?.[0]?.parameters?.depth || 0;
                  if (depth > 10) {
                    return {
                      constraintId: 'depth-constraint',
                      severity: 'error',
                      message: 'Depth limit exceeded',
                      timestamp: new Date(),
                      stepId: step.id
                    };
                  }
                  return null;
                }
              }
            ]
          }
        ]
      };

      const options: ExecutionOptions = {
        enableSafetyChecks: true
      };

      const outcome = await workflowExecutor.execute(deeplyNestedWorkflow, options);

      expect(outcome.status).toBe('safety_violation');
      expect(outcome.violationFlags.safetyViolated).toBe(true);
      expect(outcome.safetyViolations.length).toBeGreaterThan(0);
      expect(outcome.safetyViolations[0].severity).toBe('error');
    });

    it('should handle capability restriction violations', async () => {
      const restrictedWorkflow: WorkflowDefinition = {
        id: 'restricted-workflow',
        name: 'Restricted Capabilities Test',
        version: '1.0.0',
        steps: [
          {
            id: 'restricted-step',
            type: 'action',
            name: 'Step with restricted capability',
            action: {
              type: 'ocr',
              parameters: {
                imageUrl: 'https://example.com/admin-document.jpg',
                language: 'en',
                adminMode: true // This should trigger capability restriction
              }
            },
            safetyConstraints: [
              {
                id: 'capability-constraint',
                type: 'content_filter',
                description: 'Requires admin capability',
                parameters: { requiredCapabilities: ['admin'] },
                severity: 'critical',
                validator: (context, step) => {
                  const params = step.action?.parameters;
                  if (params?.adminMode === true) {
                    return {
                      constraintId: 'capability-constraint',
                      severity: 'critical',
                      message: 'Admin capability required but not allowed',
                      timestamp: new Date(),
                      stepId: step.id
                    };
                  }
                  return null;
                }
              }
            ]
          }
        ]
      };

      const options: ExecutionOptions = {
        enableSafetyChecks: true
      };

      const outcome = await workflowExecutor.execute(restrictedWorkflow, options);

      expect(outcome.status).toBe('safety_violation');
      expect(outcome.violationFlags.safetyViolated).toBe(true);
      expect(outcome.safetyViolations[0].severity).toBe('critical');
    });
  });

  describe('Timeout Handling', () => {
    it('should handle workflow timeout correctly', async () => {
      jest.setTimeout(15000);
      
      const slowWorkflow: WorkflowDefinition = {
        id: 'slow-workflow',
        name: 'Slow Workflow Test',
        version: '1.0.0',
        steps: [
          {
            id: 'slow-step',
            type: 'action',
            name: 'Slow processing step',
            action: {
              type: 'ocr',
              parameters: {
                imageUrl: 'https://example.com/very-large-image.jpg',
                language: 'en'
              }
            },
            timeout: 1000 // Very short timeout
          }
        ]
      };

      // Mock a slow response
      mockGrpcClient.processOCR = jest.fn().mockImplementation(
        () => new Promise(resolve => 
          setTimeout(() => resolve({ text: 'Slow result', confidence: 0.9 }), 5000)
        )
      );

      const options: ExecutionOptions = {
        timeout: 2000 // 2 second workflow timeout
      };

      const outcome = await workflowExecutor.execute(slowWorkflow, options);

      expect(outcome.status).toBe('timeout');
      expect(outcome.violationFlags.timeoutReached).toBe(true);
      expect(outcome.stepResults['slow-step'].status).toBeOneOf(['cancelled', 'timeout']);
    });
  });

  describe('Trajectory Recording and Replay', () => {
    it('should record complete workflow trajectory', async () => {
      const workflow: WorkflowDefinition = {
        id: 'trajectory-test-workflow',
        name: 'Trajectory Recording Test',
        version: '1.0.0',
        steps: [
          {
            id: 'ocr-step',
            type: 'action',
            name: 'OCR operation',
            action: {
              type: 'ocr',
              parameters: {
                imageUrl: 'https://example.com/trajectory-test.jpg',
                language: 'en'
              }
            }
          },
          {
            id: 'ner-step',
            type: 'action',
            name: 'NER operation',
            action: {
              type: 'ner',
              parameters: {
                text: '${ocr-step.result.text}',
                entityTypes: ['PERSON', 'ORG']
              }
            },
            dependencies: ['ocr-step']
          }
        ],
        replayable: true
      };

      mockGrpcClient.processOCR = jest.fn().mockResolvedValue({
        text: 'John works at Google',
        confidence: 0.92
      });

      mockGrpcClient.processNER = jest.fn().mockResolvedValue({
        entities: [
          { text: 'John', label: 'PERSON', start: 0, end: 4, confidence: 0.95 },
          { text: 'Google', label: 'ORG', start: 14, end: 20, confidence: 0.91 }
        ],
        originalText: 'John works at Google'
      });

      const options: ExecutionOptions = {
        recordTrajectory: true,
        enableReplay: true
      };

      const outcome = await workflowExecutor.execute(workflow, options);

      expect(outcome.status).toBe('completed');
      
      // Verify trajectory was recorded
      const trajectory = await workflowExecutor.getTrajectory(outcome.executionId);
      expect(trajectory).toBeDefined();
      expect(trajectory!.steps).toHaveLength(2);
      expect(trajectory!.decisionPoints).toBeDefined();
      expect(trajectory!.replayInfo.replayable).toBe(true);
    });

    it('should support workflow replay', async () => {
      // First execution to record trajectory
      const workflow: WorkflowDefinition = {
        id: 'replay-test-workflow',
        name: 'Replay Test',
        version: '1.0.0',
        steps: [
          {
            id: 'deterministic-step',
            type: 'action',
            name: 'Deterministic operation',
            action: {
              type: 'ner',
              parameters: {
                text: 'Alice works at Microsoft',
                entityTypes: ['PERSON', 'ORG']
              }
            }
          }
        ],
        replayable: true
      };

      const deterministicResponse = {
        entities: [
          { text: 'Alice', label: 'PERSON', start: 0, end: 5, confidence: 0.97 },
          { text: 'Microsoft', label: 'ORG', start: 15, end: 24, confidence: 0.93 }
        ],
        originalText: 'Alice works at Microsoft'
      };

      mockGrpcClient.processNER = jest.fn().mockResolvedValue(deterministicResponse);

      // First execution
      const firstOutcome = await workflowExecutor.execute(workflow, {
        recordTrajectory: true,
        enableReplay: true
      });

      expect(firstOutcome.status).toBe('completed');

      // Replay execution
      const replayOutcome = await workflowExecutor.replay(
        firstOutcome.executionId,
        { enableValidation: true }
      );

      expect(replayOutcome.status).toBe('completed');
      expect(replayOutcome.stepResults['deterministic-step'].result)
        .toEqual(firstOutcome.stepResults['deterministic-step'].result);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should implement retry logic for transient failures', async () => {
      const workflow: WorkflowDefinition = {
        id: 'retry-test-workflow',
        name: 'Retry Logic Test',
        version: '1.0.0',
        steps: [
          {
            id: 'unreliable-step',
            type: 'action',
            name: 'Unreliable operation',
            action: {
              type: 'ocr',
              parameters: {
                imageUrl: 'https://example.com/sometimes-fails.jpg',
                language: 'en'
              }
            },
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: 'exponential',
              baseDelay: 100,
              maxDelay: 1000,
              retryableErrors: ['NetworkError', 'TimeoutError']
            }
          }
        ]
      };

      let callCount = 0;
      mockGrpcClient.processOCR = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error('NetworkError: Connection failed');
        }
        return Promise.resolve({
          text: 'Success after retries',
          confidence: 0.88
        });
      });

      const outcome = await workflowExecutor.execute(workflow);

      expect(outcome.status).toBe('completed');
      expect(mockGrpcClient.processOCR).toHaveBeenCalledTimes(3);
      expect(outcome.stepResults['unreliable-step'].result.text)
        .toBe('Success after retries');
    });

    it('should handle permanent failures after exhausting retries', async () => {
      const workflow: WorkflowDefinition = {
        id: 'permanent-failure-workflow',
        name: 'Permanent Failure Test',
        version: '1.0.0',
        steps: [
          {
            id: 'failing-step',
            type: 'action',
            name: 'Permanently failing operation',
            action: {
              type: 'ocr',
              parameters: {
                imageUrl: 'https://example.com/corrupted-image.jpg',
                language: 'en'
              }
            },
            retryPolicy: {
              maxRetries: 2,
              backoffStrategy: 'fixed',
              baseDelay: 100
            }
          }
        ]
      };

      mockGrpcClient.processOCR = jest.fn().mockRejectedValue(
        new Error('PermanentError: Image is corrupted')
      );

      const outcome = await workflowExecutor.execute(workflow);

      expect(outcome.status).toBe('failed');
      expect(mockGrpcClient.processOCR).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(outcome.stepResults['failing-step'].status).toBe('failed');
      expect(outcome.stepResults['failing-step'].error?.message)
        .toContain('PermanentError');
    });
  });
});
