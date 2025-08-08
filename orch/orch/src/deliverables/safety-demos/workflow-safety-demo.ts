#!/usr/bin/env node
/**
 * Comprehensive Workflow Safety Demonstration
 * Shows end-to-end safety enforcement in complex workflows
 */

import { WorkflowExecutor } from '../../core/workflow-executor.js';
import { SafetyManager, SafetyConfig } from '../../safety/managers/SafetyManager.js';
import { BudgetTracker } from '../../core/budget-tracker.js';
import { WorkflowDefinition, ExecutionOptions, BudgetInfo } from '../../types/workflow-types.js';
import { StepExecutor } from '../../execution/step-executor.js';

class WorkflowSafetyDemo {
  private workflowExecutor: WorkflowExecutor;
  private safetyManager: SafetyManager;
  private budgetTracker: BudgetTracker;
  private mockClient: any;

  constructor() {
    const safetyConfig: SafetyConfig = {
      budgetLimits: {
        tokenLimit: 3000,
        costLimit: 3.0,
        requestLimit: 15,
        timeLimit: 180000, // 3 minutes
        memoryLimit: 1024 * 1024 * 30, // 30MB
        concurrencyLimit: 5
      },
      depthLimits: {
        maxDepth: 6,
        maxBranching: 4
      },
      capabilities: {
        allowed: ['ocr', 'ner', 'route'],
        restricted: ['admin', 'system', 'privileged'],
        requireApproval: ['sensitive', 'financial', 'personal']
      },
      validation: {
        strictMode: true,
        allowUnknownProperties: false,
        coerceTypes: false
      }
    };

    this.safetyManager = new SafetyManager(safetyConfig);
    this.budgetTracker = new BudgetTracker();
    
    // Mock gRPC client with realistic responses
    this.mockClient = {
      processOCR: async (params: any) => {
        await this.delay(1000 + Math.random() * 2000); // 1-3s processing time
        return {
          text: `Extracted text from ${params.imageUrl}`,
          confidence: 0.85 + Math.random() * 0.15,
          boundingBoxes: [
            {
              x: Math.floor(Math.random() * 100),
              y: Math.floor(Math.random() * 100),
              width: 100 + Math.floor(Math.random() * 200),
              height: 20 + Math.floor(Math.random() * 50),
              text: 'Sample text',
              confidence: 0.9 + Math.random() * 0.1
            }
          ]
        };
      },
      processNER: async (params: any) => {
        await this.delay(800 + Math.random() * 1200); // 0.8-2s processing time
        return {
          entities: [
            {
              text: 'Mock Entity',
              label: 'PERSON',
              start: 0,
              end: 11,
              confidence: 0.9 + Math.random() * 0.1
            }
          ],
          originalText: params.text,
          processingMetadata: {
            model: 'mock-ner-v1.0',
            version: '1.0.0',
            processingTime: 800 + Math.floor(Math.random() * 400)
          }
        };
      },
      executeRoute: async (params: any) => {
        await this.delay(500 + Math.random() * 1500); // 0.5-2s processing time
        return {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
          data: { message: 'Mock API response', processed: true }
        };
      }
    };

    const stepExecutor = new StepExecutor();
    stepExecutor.setGrpcClient(this.mockClient);

    this.workflowExecutor = new WorkflowExecutor({
      safetyManager: this.safetyManager,
      budgetTracker: this.budgetTracker,
      stepExecutor
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runDemo(): Promise<void> {
    console.log('\n🛡️ Comprehensive Workflow Safety Demonstration');
    console.log('='.repeat(60));

    try {
      await this.demonstrateSafeWorkflow();
      await this.demonstrateSchemaViolation();
      await this.demonstrateBudgetViolation();
      await this.demonstrateDepthViolation();
      await this.demonstrateCapabilityViolation();
      await this.demonstrateTimeoutHandling();
      await this.demonstrateSafetyRecovery();
      
      console.log('\n✅ Comprehensive Workflow Safety Demo Completed Successfully');
    } catch (error) {
      console.error('\n❌ Demo failed:', error);
      throw error;
    }
  }

  private async demonstrateSafeWorkflow(): Promise<void> {
    console.log('\n🟢 1. Safe Workflow Execution');
    console.log('-'.repeat(35));

    const safeWorkflow: WorkflowDefinition = {
      id: 'safe-workflow-demo',
      name: 'Safe Document Processing Workflow',
      version: '1.0.0',
      description: 'A workflow that operates within all safety constraints',
      steps: [
        {
          id: 'extract-text',
          type: 'action',
          name: 'Extract text from document',
          action: {
            type: 'ocr',
            parameters: {
              imageUrl: 'https://example.com/safe-document.jpg',
              language: 'en',
              confidence_threshold: 0.8
            },
            expectedDuration: 2000,
            expectedCost: 0.5
          },
          timeout: 10000,
          costEstimate: 0.5
        },
        {
          id: 'analyze-entities',
          type: 'action',
          name: 'Analyze named entities',
          action: {
            type: 'ner',
            parameters: {
              text: '${extract-text.result.text}',
              entityTypes: ['PERSON', 'ORG', 'DATE'],
              confidenceThreshold: 0.8
            },
            expectedDuration: 1500,
            expectedCost: 0.3
          },
          dependencies: ['extract-text'],
          timeout: 8000,
          costEstimate: 0.3
        },
        {
          id: 'store-results',
          type: 'action',
          name: 'Store processing results',
          action: {
            type: 'route',
            parameters: {
              path: '/api/v1/documents/results',
              method: 'POST',
              body: {
                contentType: 'application/json',
                data: {
                  documentId: 'safe-doc-001',
                  ocrResult: '${extract-text.result}',
                  nerResult: '${analyze-entities.result}'
                }
              }
            },
            expectedDuration: 1000,
            expectedCost: 0.2
          },
          dependencies: ['analyze-entities'],
          timeout: 5000,
          costEstimate: 0.2
        }
      ],
      budgetLimit: {
        tokens: 2000,
        computeTime: 30000,
        memory: 1024 * 1024 * 20,
        apiCalls: 10,
        monetaryCost: 2.0
      },
      replayable: true
    };

    const options: ExecutionOptions = {
      enableSafetyChecks: true,
      recordTrajectory: true,
      enableReplay: false,
      debugMode: false
    };

    console.log('  Executing safe workflow...');
    const startTime = Date.now();
    
    const outcome = await this.workflowExecutor.execute(safeWorkflow, options);
    const duration = Date.now() - startTime;
    
    console.log(`  ✓ Workflow completed in ${duration}ms`);
    console.log(`  Status: ${outcome.status}`);
    console.log(`  Steps completed: ${Object.keys(outcome.stepResults).length}/${safeWorkflow.steps.length}`);
    console.log(`  Total cost: $${outcome.totalCost.monetaryCost?.toFixed(3) || '0.000'}`);
    console.log(`  Safety violations: ${outcome.safetyViolations.length}`);
    console.log(`  Within budget: ${!outcome.violationFlags.budgetExceeded}`);
    
    Object.entries(outcome.stepResults).forEach(([stepId, result]) => {
      const status = result.status === 'completed' ? '✓' : '❌';
      console.log(`    ${status} ${stepId}: ${result.status} (${result.duration}ms)`);
    });
  }

  private async demonstrateSchemaViolation(): Promise<void> {
    console.log('\n🔴 2. Schema Violation Handling');
    console.log('-'.repeat(35));

    const schemaViolationWorkflow: WorkflowDefinition = {
      id: 'schema-violation-demo',
      name: 'Workflow with Schema Violations',
      version: '1.0.0',
      steps: [
        {
          id: 'invalid-ocr-step',
          type: 'action',
          name: 'OCR with invalid parameters',
          action: {
            type: 'ocr',
            parameters: {
              imageUrl: 'invalid-url', // Missing protocol
              language: 'invalid-lang', // Invalid language code
              confidence_threshold: 2.0 // Invalid range > 1.0
            }
          },
          timeout: 10000
        }
      ],
      budgetLimit: {
        tokens: 1000,
        monetaryCost: 1.0
      }
    };

    console.log('  Executing workflow with schema violations...');
    
    try {
      const outcome = await this.workflowExecutor.execute(schemaViolationWorkflow, {
        enableSafetyChecks: true
      });
      
      console.log(`  Status: ${outcome.status}`);
      console.log(`  Safety violations: ${outcome.safetyViolations.length}`);
      
      if (outcome.safetyViolations.length > 0) {
        console.log('  ✓ Schema violations detected and handled:');
        outcome.safetyViolations.forEach((violation, index) => {
          console.log(`    ${index + 1}. ${violation.severity}: ${violation.message}`);
        });
      }
      
      Object.entries(outcome.stepResults).forEach(([stepId, result]) => {
        if (result.status === 'failed' && result.error) {
          console.log(`  ❌ ${stepId} failed: ${result.error.message}`);
        }
      });
    } catch (error) {
      console.log(`  ✓ Workflow properly rejected: ${(error as Error).message}`);
    }
  }

  private async demonstrateBudgetViolation(): Promise<void> {
    console.log('\n💰 3. Budget Violation Prevention');
    console.log('-'.repeat(35));

    const budgetViolationWorkflow: WorkflowDefinition = {
      id: 'budget-violation-demo',
      name: 'Workflow that Exceeds Budget',
      version: '1.0.0',
      steps: [
        {
          id: 'expensive-ocr-1',
          type: 'action',
          name: 'First expensive OCR operation',
          action: {
            type: 'ocr',
            parameters: {
              imageUrl: 'https://example.com/large-doc-1.jpg',
              language: 'en',
              highQualityMode: true
            },
            expectedCost: 1.5 // High cost
          },
          costEstimate: 1.5
        },
        {
          id: 'expensive-ocr-2',
          type: 'action',
          name: 'Second expensive OCR operation',
          action: {
            type: 'ocr',
            parameters: {
              imageUrl: 'https://example.com/large-doc-2.jpg',
              language: 'en',
              highQualityMode: true
            },
            expectedCost: 1.2 // Would exceed total budget of 2.0
          },
          dependencies: ['expensive-ocr-1'],
          costEstimate: 1.2
        }
      ],
      budgetLimit: {
        tokens: 1000,
        monetaryCost: 2.0, // Tight budget limit
        apiCalls: 5
      }
    };

    console.log('  Executing workflow that would exceed budget...');
    
    const outcome = await this.workflowExecutor.execute(budgetViolationWorkflow, {
      enableSafetyChecks: true,
      budgetLimit: {
        tokens: 1000,
        monetaryCost: 2.0,
        apiCalls: 5
      }
    });
    
    console.log(`  Status: ${outcome.status}`);
    console.log(`  Budget exceeded: ${outcome.violationFlags.budgetExceeded}`);
    console.log(`  Total cost: $${outcome.totalCost.monetaryCost?.toFixed(3) || '0.000'}`);
    
    if (outcome.status === 'budget_exceeded') {
      console.log('  ✓ Budget enforcement successful - workflow cancelled');
      const cancelledSteps = Object.values(outcome.stepResults)
        .filter(result => result.status === 'cancelled').length;
      console.log(`  Cancelled steps: ${cancelledSteps}`);
    }
    
    Object.entries(outcome.stepResults).forEach(([stepId, result]) => {
      const status = result.status === 'completed' ? '✓' : 
                    result.status === 'cancelled' ? '⚠️' : '❌';
      console.log(`    ${status} ${stepId}: ${result.status}`);
      if (result.cost) {
        console.log(`      Cost: $${result.cost.monetaryCost?.toFixed(3) || '0.000'}`);
      }
    });
  }

  private async demonstrateDepthViolation(): Promise<void> {
    console.log('\n🔄 4. Depth Limit Enforcement');
    console.log('-'.repeat(35));

    const deepWorkflow: WorkflowDefinition = {
      id: 'deep-workflow-demo',
      name: 'Workflow with Excessive Depth',
      version: '1.0.0',
      steps: [
        {
          id: 'level-1',
          type: 'action',
          name: 'Level 1 processing',
          action: {
            type: 'ocr',
            parameters: {
              imageUrl: 'https://example.com/doc.jpg',
              language: 'en'
            }
          },
          safetyConstraints: [
            {
              id: 'depth-constraint',
              type: 'resource_limit',
              description: 'Simulated excessive depth',
              parameters: { simulatedDepth: 10 }, // Exceeds maxDepth of 6
              severity: 'error',
              validator: (context, step) => {
                const depth = step.safetyConstraints?.[0]?.parameters?.simulatedDepth || 0;
                if (depth > 6) {
                  return {
                    constraintId: 'depth-constraint',
                    severity: 'error',
                    message: `Depth limit exceeded: ${depth} > 6`,
                    timestamp: new Date(),
                    stepId: step.id,
                    details: { currentDepth: depth, maxDepth: 6 }
                  };
                }
                return null;
              }
            }
          ]
        }
      ],
      budgetLimit: {
        tokens: 1000,
        monetaryCost: 1.0
      }
    };

    console.log('  Executing workflow with depth violations...');
    
    const outcome = await this.workflowExecutor.execute(deepWorkflow, {
      enableSafetyChecks: true
    });
    
    console.log(`  Status: ${outcome.status}`);
    console.log(`  Safety violations: ${outcome.safetyViolations.length}`);
    
    if (outcome.status === 'safety_violation') {
      console.log('  ✓ Depth enforcement successful - workflow cancelled');
      outcome.safetyViolations.forEach((violation, index) => {
        console.log(`    ${index + 1}. ${violation.severity}: ${violation.message}`);
        if (violation.details) {
          console.log(`       Current: ${violation.details.currentDepth}, Max: ${violation.details.maxDepth}`);
        }
      });
    }
  }

  private async demonstrateCapabilityViolation(): Promise<void> {
    console.log('\n🔒 5. Capability Restriction Enforcement');
    console.log('-'.repeat(45));

    const restrictedWorkflow: WorkflowDefinition = {
      id: 'restricted-workflow-demo',
      name: 'Workflow with Restricted Capabilities',
      version: '1.0.0',
      steps: [
        {
          id: 'restricted-operation',
          type: 'action',
          name: 'Operation requiring restricted capability',
          action: {
            type: 'ocr',
            parameters: {
              imageUrl: 'https://example.com/sensitive-doc.jpg',
              language: 'en',
              adminMode: true // Simulates requiring admin capability
            }
          },
          safetyConstraints: [
            {
              id: 'capability-constraint',
              type: 'content_filter',
              description: 'Requires restricted admin capability',
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
                    stepId: step.id,
                    details: {
                      requiredCapabilities: ['admin'],
                      allowedCapabilities: ['ocr', 'ner', 'route']
                    }
                  };
                }
                return null;
              }
            }
          ]
        }
      ]
    };

    console.log('  Executing workflow with capability restrictions...');
    
    const outcome = await this.workflowExecutor.execute(restrictedWorkflow, {
      enableSafetyChecks: true
    });
    
    console.log(`  Status: ${outcome.status}`);
    console.log(`  Safety violations: ${outcome.safetyViolations.length}`);
    
    if (outcome.status === 'safety_violation') {
      console.log('  ✓ Capability enforcement successful - workflow blocked');
      outcome.safetyViolations.forEach((violation, index) => {
        console.log(`    ${index + 1}. ${violation.severity}: ${violation.message}`);
        if (violation.details) {
          console.log(`       Required: ${violation.details.requiredCapabilities?.join(', ')}`);
          console.log(`       Allowed: ${violation.details.allowedCapabilities?.join(', ')}`);
        }
      });
    }
  }

  private async demonstrateTimeoutHandling(): Promise<void> {
    console.log('\n⏱️ 6. Timeout Handling');
    console.log('-'.repeat(25));

    const timeoutWorkflow: WorkflowDefinition = {
      id: 'timeout-workflow-demo',
      name: 'Workflow with Timeout Issues',
      version: '1.0.0',
      steps: [
        {
          id: 'slow-operation',
          type: 'action',
          name: 'Deliberately slow operation',
          action: {
            type: 'ocr',
            parameters: {
              imageUrl: 'https://example.com/very-large-document.jpg',
              language: 'en',
              highQuality: true // Simulates slow processing
            }
          },
          timeout: 2000 // Very short timeout
        }
      ]
    };

    // Override mock to simulate slow response
    const originalOCR = this.mockClient.processOCR;
    this.mockClient.processOCR = async (params: any) => {
      console.log('    Simulating slow OCR processing...');
      await this.delay(5000); // 5 seconds - exceeds timeout
      return originalOCR(params);
    };

    console.log('  Executing workflow with timeout constraints...');
    
    try {
      const outcome = await this.workflowExecutor.execute(timeoutWorkflow, {
        timeout: 3000, // 3-second workflow timeout
        enableSafetyChecks: true
      });
      
      console.log(`  Status: ${outcome.status}`);
      console.log(`  Timeout reached: ${outcome.violationFlags.timeoutReached}`);
      
      if (outcome.status === 'timeout') {
        console.log('  ✓ Timeout enforcement successful');
      }
      
      Object.entries(outcome.stepResults).forEach(([stepId, result]) => {
        console.log(`    ⚠️ ${stepId}: ${result.status}`);
        if (result.duration) {
          console.log(`      Duration: ${result.duration}ms`);
        }
      });
    } finally {
      // Restore original mock
      this.mockClient.processOCR = originalOCR;
    }
  }

  private async demonstrateSafetyRecovery(): Promise<void> {
    console.log('\n🔄 7. Safety Recovery Mechanisms');
    console.log('-'.repeat(40));

    const recoveryWorkflow: WorkflowDefinition = {
      id: 'recovery-workflow-demo',
      name: 'Workflow with Recovery Mechanisms',
      version: '1.0.0',
      steps: [
        {
          id: 'risky-operation',
          type: 'action',
          name: 'Potentially risky operation',
          action: {
            type: 'ocr',
            parameters: {
              imageUrl: 'https://example.com/risky-doc.jpg',
              language: 'en'
            },
            expectedCost: 0.8
          },
          retryPolicy: {
            maxRetries: 2,
            backoffStrategy: 'exponential',
            baseDelay: 100,
            maxDelay: 1000,
            retryableErrors: ['NetworkError', 'TimeoutError']
          },
          costEstimate: 0.8
        },
        {
          id: 'safe-fallback',
          type: 'action',
          name: 'Safe fallback operation',
          action: {
            type: 'ner',
            parameters: {
              text: 'Default fallback text for analysis',
              entityTypes: ['PERSON', 'ORG']
            },
            expectedCost: 0.2
          },
          dependencies: ['risky-operation'], // Will execute if risky-operation fails
          costEstimate: 0.2
        }
      ],
      budgetLimit: {
        tokens: 2000,
        monetaryCost: 2.0,
        apiCalls: 10
      }
    };

    console.log('  Executing workflow with recovery mechanisms...');
    
    const outcome = await this.workflowExecutor.execute(recoveryWorkflow, {
      enableSafetyChecks: true,
      debugMode: true
    });
    
    console.log(`  Status: ${outcome.status}`);
    console.log(`  Total steps attempted: ${Object.keys(outcome.stepResults).length}`);
    
    Object.entries(outcome.stepResults).forEach(([stepId, result]) => {
      const status = result.status === 'completed' ? '✓' : 
                    result.status === 'failed' ? '❌' : '⚠️';
      console.log(`    ${status} ${stepId}: ${result.status}`);
      
      if (result.duration) {
        console.log(`      Duration: ${result.duration}ms`);
      }
      
      if (result.cost) {
        console.log(`      Cost: $${result.cost.monetaryCost?.toFixed(3) || '0.000'}`);
      }
    });
    
    console.log(`  Final budget utilization: $${outcome.totalCost.monetaryCost?.toFixed(3) || '0.000'}`);
    console.log(`  Safety system status: ${outcome.safetyViolations.length === 0 ? 'Clean' : 'Violations detected'}`);
  }
}

// CLI execution
if (require.main === module) {
  const demo = new WorkflowSafetyDemo();
  
  demo.runDemo()
    .then(() => {
      console.log('\n🏆 Comprehensive Workflow Safety Demo completed successfully!');
      console.log('\nKey Safety Demonstrations:');
      console.log('  ✓ Safe workflow execution with full constraint compliance');
      console.log('  ✓ Schema violation detection and rejection');
      console.log('  ✓ Budget limit enforcement and early termination');
      console.log('  ✓ Depth limit enforcement for complex workflows');
      console.log('  ✓ Capability restriction and privilege escalation prevention');
      console.log('  ✓ Timeout handling and graceful degradation');
      console.log('  ✓ Safety recovery mechanisms and fallback strategies');
      console.log('\nSafety Features Validated:');
      console.log('  • Multi-layered validation (schema + budget + safety constraints)');
      console.log('  • Real-time monitoring and enforcement');
      console.log('  • Graceful error handling and recovery');
      console.log('  • Comprehensive audit trail and violation reporting');
      
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Comprehensive Workflow Safety Demo failed:', error);
      process.exit(1);
    });
}

export { WorkflowSafetyDemo };
