/**
 * End-to-End Integration Tests
 * Complete workflow execution from context to trajectory
 */

import { WorkflowExecutor } from '../../src/core/workflow-executor';
import { PolicyServiceClient } from '../../src/client/policy-service-client';
import { SafetyManager } from '../../src/safety/managers/SafetyManager';
import { MockPolicyService } from '../../mocks/policy-service/mock-server';
import { OCRTool } from '../../src/tools/ocr-tool';
import { NERTool } from '../../src/tools/ner-tool';
import { RouteTool } from '../../src/tools/route-tool';
import { Logger } from '../../src/utils/logger';
import { Context, Budget, Trajectory } from '../../src/types/grpc-types';
import { expect } from '@jest/globals';

describe('End-to-End Workflow Execution', () => {
  let mockServer: MockPolicyService;
  let policyClient: PolicyServiceClient;
  let workflowExecutor: WorkflowExecutor;
  let safetyManager: SafetyManager;
  let logger: Logger;

  beforeAll(async () => {
    // Initialize logger
    logger = new Logger('E2E-Test');

    // Start mock policy service
    mockServer = new MockPolicyService();
    await mockServer.start(50052); // Different port for e2e tests

    // Initialize policy client
    policyClient = new PolicyServiceClient({
      endpoint: 'localhost:50052',
      secure: false,
      requestTimeout: 10000
    });
    await policyClient.connect();

    // Initialize safety manager
    safetyManager = new SafetyManager();

    // Initialize workflow executor
    workflowExecutor = new WorkflowExecutor({
      policyClient,
      safetyManager,
      logger
    });

    // Register tools
    workflowExecutor.registerTool('ocr', new OCRTool());
    workflowExecutor.registerTool('ner', new NERTool());
    workflowExecutor.registerTool('route', new RouteTool());
  });

  afterAll(async () => {
    await policyClient.disconnect();
    await mockServer.stop();
  });

  describe('Complete Workflow Scenarios', () => {
    it('should execute successful OCR → NER → Route workflow', async () => {
      console.log('🎪 Starting complete workflow execution test...');

      // Step 1: Create test context
      const context: Context = {
        contextId: 'e2e-success-001',
        tenantId: 'test-tenant',
        features: {
          document_type: 'invoice',
          priority: 'normal',
          source_system: 'test_suite'
        }
      };

      const budget: Budget = {
        tokenBudget: 2000,
        costBudget: 1.0,
        latencySloMs: 15000,
        depthCap: 10
      };

      console.log('📋 Test context:', context);
      console.log('💰 Budget limits:', budget);

      // Step 2: Get workflow plan from policy service
      const startTime = Date.now();
      const planResponse = await policyClient.sampleWorkflow({ context, budget });
      const planLatency = Date.now() - startTime;

      expect(planResponse).toBeDefined();
      expect(planResponse.plan).toBeDefined();
      expect(planResponse.plan.steps).toHaveLength(3); // OCR → NER → Route

      console.log('📝 Received plan in', planLatency, 'ms');
      console.log('🔧 Plan details:', {
        planId: planResponse.plan.planId,
        stepCount: planResponse.plan.steps.length,
        snapshotId: planResponse.plan.policySnapshotId,
        estimatedCost: planResponse.plan.predCost
      });

      // Step 3: Validate plan structure
      await validatePlanStructure(planResponse.plan, safetyManager);

      // Step 4: Execute workflow
      const executionStartTime = Date.now();
      const outcome = await workflowExecutor.executeWorkflow(planResponse.plan, budget);
      const executionLatency = Date.now() - executionStartTime;

      expect(outcome).toBeDefined();
      expect(outcome.success).toBe(true);
      expect(outcome.executedSteps).toBe(3);
      expect(outcome.terminationReason).toBe('completed_successfully');
      expect(outcome.violations?.budgetExceeded).toBe(false);
      expect(outcome.violations?.schemaViolation).toBe(false);
      expect(outcome.cost).toBeLessThanOrEqual(budget.costBudget);

      console.log('🎯 Execution outcome:', {
        success: outcome.success,
        reward: outcome.reward,
        actualCost: outcome.cost,
        latency: outcome.latencyMs,
        executedSteps: outcome.executedSteps,
        terminationReason: outcome.terminationReason
      });

      // Step 5: Create and validate trajectory
      const trajectory = createTrajectory(context, planResponse.plan, outcome);
      await validateTrajectory(trajectory);

      // Step 6: Log execution to policy service
      const logResponse = await policyClient.logExecution(trajectory);
      expect(logResponse.status).toBe('acknowledged');

      console.log('📤 Trajectory logged:', logResponse.status);
      console.log('✅ End-to-end workflow completed successfully!');

      // Performance assertions
      expect(planLatency).toBeLessThan(5000); // Plan should be received quickly
      expect(executionLatency).toBeLessThan(budget.latencySloMs); // Within SLO
      expect(outcome.cost).toBeGreaterThan(0); // Should have some cost
      expect(outcome.reward).toBeGreaterThan(0); // Should generate reward

      return { trajectory, outcome, planLatency, executionLatency };
    });

    it('should handle budget violation gracefully', async () => {
      console.log('🛡️ Testing budget enforcement...');

      const context: Context = {
        contextId: 'e2e-budget-violation',
        tenantId: 'test-tenant',
        features: {
          document_type: 'contract',
          priority: 'low',
          complexity: 'high'
        }
      };

      // Very restrictive budget
      const restrictiveBudget: Budget = {
        tokenBudget: 50,      // Very low
        costBudget: 0.02,     // Very low
        latencySloMs: 1000,   // Very tight
        depthCap: 2
      };

      console.log('💰 Using restrictive budget:', restrictiveBudget);

      // Get plan (should work)
      const planResponse = await policyClient.sampleWorkflow({ 
        context, 
        budget: restrictiveBudget 
      });
      expect(planResponse.plan).toBeDefined();
      console.log('📝 Plan received with', planResponse.plan.steps.length, 'steps');

      // Execute (should hit budget limit)
      const outcome = await workflowExecutor.executeWorkflow(
        planResponse.plan, 
        restrictiveBudget
      );

      expect(outcome.success).toBe(false);
      expect(outcome.violations?.budgetExceeded).toBe(true);
      expect(outcome.executedSteps).toBeLessThan(planResponse.plan.steps.length);
      expect(outcome.terminationReason).toMatch(/budget|limit|exhausted/i);

      console.log('🎯 Budget enforcement result:', {
        success: outcome.success,
        budgetExceeded: outcome.violations?.budgetExceeded,
        executedSteps: outcome.executedSteps,
        totalSteps: planResponse.plan.steps.length,
        terminationReason: outcome.terminationReason
      });

      console.log('✅ Budget enforcement working correctly');
    });

    it('should handle schema validation failures', async () => {
      console.log('🔍 Testing schema validation...');

      // Create a plan with invalid step arguments
      const invalidPlan = {
        planId: 'invalid-plan-001',
        steps: [
          {
            ouType: 'ocr',
            tool: 'tesseract-test',
            argsJson: JSON.stringify({
              page_ref: 'invalid-hash-format', // Invalid format
              lang_hint: 'invalid-language',   // Invalid language
              ocr_mode: 'ultra-fast',          // Invalid mode
              resolution_dpi: 50,              // Below minimum
              quality_speed_tradeoff: 1.5      // Above maximum
            }),
            capabilities: ['image_processing'],
            estCost: 0.05,
            estLatencyMs: 2000,
            decision: { logprob: -2.0, entropy: 1.0, head: 'test' },
            schemaVersion: 'ocr:v1',
            modelVersion: 'tesseract@5.3.0',
            modelDigest: 'sha256:test'
          }
        ],
        predReward: 0.5,
        predCost: 0.05,
        uncertainty: 0.3,
        policySnapshotId: 'test-policy',
        signature: {
          alg: 'HMAC-SHA256',
          sig: Buffer.from('test-signature'),
          keyId: 'test-key'
        }
      };

      const budget: Budget = {
        tokenBudget: 1000,
        costBudget: 1.0,
        latencySloMs: 10000,
        depthCap: 5
      };

      const outcome = await workflowExecutor.executeWorkflow(invalidPlan as any, budget);

      expect(outcome.success).toBe(false);
      expect(outcome.violations?.schemaViolation).toBe(true);
      expect(outcome.executedSteps).toBe(0);
      expect(outcome.terminationReason).toMatch(/schema|validation/i);
      expect(outcome.violations?.details).toBeDefined();
      expect(outcome.violations?.details?.length).toBeGreaterThan(0);

      console.log('🔍 Schema validation result:', {
        schemaViolation: outcome.violations?.schemaViolation,
        violationDetails: outcome.violations?.details,
        terminationReason: outcome.terminationReason
      });

      console.log('✅ Schema validation working correctly');
    });

    it('should handle tool execution failures', async () => {
      console.log('⚠️ Testing tool failure handling...');

      const context: Context = {
        contextId: 'e2e-tool-failure',
        tenantId: 'test-tenant',
        features: {
          document_type: 'corrupted',
          test_mode: 'failure_simulation'
        }
      };

      const budget: Budget = {
        tokenBudget: 1000,
        costBudget: 1.0,
        latencySloMs: 10000,
        depthCap: 5
      };

      const planResponse = await policyClient.sampleWorkflow({ context, budget });
      const outcome = await workflowExecutor.executeWorkflow(planResponse.plan, budget);

      // Should handle tool failures gracefully
      expect(outcome).toBeDefined();
      if (!outcome.success) {
        expect(outcome.failureReason).toBeDefined();
        expect(outcome.terminationReason).toMatch(/error|failure|step_failure/i);
      }

      console.log('⚠️ Tool failure handling result:', {
        success: outcome.success,
        failureReason: outcome.failureReason,
        terminationReason: outcome.terminationReason,
        executedSteps: outcome.executedSteps
      });

      console.log('✅ Tool failure handling verified');
    });

    it('should demonstrate deterministic replay', async () => {
      console.log('🔄 Testing deterministic replay...');

      const context: Context = {
        contextId: 'replay-test-001',
        tenantId: 'test-tenant',
        features: { deterministic: 'true', seed: 'fixed-seed-123' }
      };

      const budget: Budget = {
        tokenBudget: 1000,
        costBudget: 1.0,
        latencySloMs: 10000,
        depthCap: 5
      };

      // Execute workflow twice with same seed
      const plan1Response = await policyClient.sampleWorkflow({ context, budget });
      const outcome1 = await workflowExecutor.executeWorkflow(plan1Response.plan, budget);
      const trajectory1 = createTrajectory(context, plan1Response.plan, outcome1);

      const plan2Response = await policyClient.sampleWorkflow({ context, budget });
      const outcome2 = await workflowExecutor.executeWorkflow(plan2Response.plan, budget);
      const trajectory2 = createTrajectory(context, plan2Response.plan, outcome2);

      // Results should be deterministic
      expect(outcome1.success).toBe(outcome2.success);
      expect(outcome1.executedSteps).toBe(outcome2.executedSteps);
      expect(trajectory1.replay.seed).toBe(trajectory2.replay.seed);

      console.log('🔄 Replay comparison:', {
        run1: { success: outcome1.success, steps: outcome1.executedSteps },
        run2: { success: outcome2.success, steps: outcome2.executedSteps },
        seedMatch: trajectory1.replay.seed === trajectory2.replay.seed
      });

      console.log('✅ Deterministic replay verified');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent workflow executions', async () => {
      console.log('⚡ Testing concurrent executions...');

      const concurrentWorkflows = 5;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < concurrentWorkflows; i++) {
        const context: Context = {
          contextId: `concurrent-${i}`,
          tenantId: 'test-tenant',
          features: { batch: 'concurrent', index: i.toString() }
        };

        const budget: Budget = {
          tokenBudget: 500,
          costBudget: 0.5,
          latencySloMs: 8000,
          depthCap: 5
        };

        promises.push(
          (async () => {
            const planResponse = await policyClient.sampleWorkflow({ context, budget });
            const outcome = await workflowExecutor.executeWorkflow(planResponse.plan, budget);
            return { context, outcome };
          })()
        );
      }

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(concurrentWorkflows);
      
      const successCount = results.filter(r => r.outcome.success).length;
      console.log(`⚡ Concurrent execution results: ${successCount}/${concurrentWorkflows} successful`);
      
      // At least majority should succeed
      expect(successCount).toBeGreaterThanOrEqual(Math.floor(concurrentWorkflows / 2));
      
      console.log('✅ Concurrent execution verified');
    });
  });
});

// Helper functions
async function validatePlanStructure(plan: any, safetyManager: SafetyManager): Promise<void> {
  expect(plan.planId).toBeDefined();
  expect(plan.steps).toBeInstanceOf(Array);
  expect(plan.policySnapshotId).toBeDefined();
  expect(plan.signature).toBeDefined();

  // Validate signature
  const signatureValid = await safetyManager.verifyWorkflowPlan(plan);
  expect(signatureValid).toBe(true);

  console.log('✅ Plan structure and signature validated');
}

function createTrajectory(context: Context, plan: any, outcome: any): Trajectory {
  return {
    context,
    plan,
    outcome,
    replay: {
      seed: `replay_${Date.now()}`,
      toolVersions: {
        tesseract: '5.3.0',
        compromise: '14.10.0',
        'business-rules': '2.1.0'
      },
      modelVersions: {
        ocr: 'tesseract@5.3.0',
        ner: 'compromise@14.10.0',
        route: 'business-rules@2.1.0'
      },
      artifactHashes: {
        input: `sha256:input_${context.contextId}`,
        output: `sha256:output_${plan.planId}`
      }
    },
    ts: new Date().toISOString(),
    idempotencyKey: `idem_${context.contextId}_${plan.planId}`
  };
}

async function validateTrajectory(trajectory: Trajectory): Promise<void> {
  const errors: string[] = [];

  // Validate required fields
  if (!trajectory.context?.contextId) errors.push('Missing context.contextId');
  if (!trajectory.plan?.planId) errors.push('Missing plan.planId');
  if (!trajectory.outcome) errors.push('Missing outcome');
  if (!trajectory.replay?.seed) errors.push('Missing replay.seed');
  if (!trajectory.idempotencyKey) errors.push('Missing idempotencyKey');

  // Validate data consistency
  if (trajectory.outcome.executedSteps > trajectory.plan.steps.length) {
    errors.push('executedSteps exceeds total plan steps');
  }

  // Validate replay completeness
  const requiredReplayFields = ['seed', 'toolVersions', 'modelVersions'];
  for (const field of requiredReplayFields) {
    if (!trajectory.replay[field]) {
      errors.push(`Missing replay.${field}`);
    }
  }

  if (errors.length > 0) {
    console.error('❌ Trajectory validation failed:', errors);
    throw new Error(`Trajectory validation failed: ${errors.join(', ')}`);
  }

  console.log('✅ Trajectory validation passed');
}