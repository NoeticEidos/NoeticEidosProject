/**
 * Load Testing and Performance Validation
 * Tests system performance under various load conditions
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { SafetyManager, SafetyConfig } from '../../safety/managers/SafetyManager.js';
import { BudgetTracker } from '../../core/budget-tracker.js';
import { WorkflowExecutor } from '../../core/workflow-executor.js';
import { WorkflowDefinition, BudgetInfo } from '../../types/workflow-types.js';

interface PerformanceMetrics {
  totalTime: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  throughput: number;
  errorRate: number;
  memoryUsage: number;
  successCount: number;
  errorCount: number;
}

describe('Load Testing and Performance Validation', () => {
  let safetyManager: SafetyManager;
  let budgetTracker: BudgetTracker;
  let workflowExecutor: WorkflowExecutor;

  const defaultConfig: SafetyConfig = {
    budgetLimits: {
      tokenLimit: 50000,
      costLimit: 50,
      requestLimit: 1000,
      timeLimit: 600000,
      memoryLimit: 1024 * 1024 * 500,
      concurrencyLimit: 20
    },
    depthLimits: {
      maxDepth: 15,
      maxBranching: 10
    },
    capabilities: {
      allowed: ['ocr', 'ner', 'route'],
      restricted: ['admin'],
      requireApproval: ['sensitive']
    },
    validation: {
      strictMode: true,
      allowUnknownProperties: false,
      coerceTypes: false
    }
  };

  beforeAll(() => {
    safetyManager = new SafetyManager(defaultConfig);
    budgetTracker = new BudgetTracker();
    
    const mockClient = global.createMockGrpcClient();
    const stepExecutor = {
      setGrpcClient: jest.fn(),
      execute: jest.fn().mockResolvedValue({
        success: true,
        data: { result: 'mock result' },
        metrics: {
          executionTime: 100 + Math.random() * 900,
          inputSize: 1024,
          outputSize: 512
        }
      })
    };

    workflowExecutor = new WorkflowExecutor({
      safetyManager,
      budgetTracker,
      stepExecutor: stepExecutor as any
    });
  });

  afterAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Schema Validation Performance', () => {
    it('should handle high-volume schema validation efficiently', async () => {
      const testSizes = [10, 50, 100, 500, 1000];
      const results: Record<number, PerformanceMetrics> = {};

      for (const size of testSizes) {
        const steps = Array.from({ length: size }, (_, i) => 
          global.createMockStep('ocr', {
            text: `Test document ${i}`,
            confidence: 0.9 + Math.random() * 0.1
          })
        );

        const startTime = Date.now();
        const startMemory = process.memoryUsage().heapUsed;

        const responses: any[] = [];
        const responseTimes: number[] = [];
        let successCount = 0;
        let errorCount = 0;

        for (const step of steps) {
          const stepStartTime = Date.now();
          try {
            const result = await safetyManager.validateStep(step);
            const responseTime = Date.now() - stepStartTime;
            
            responses.push(result);
            responseTimes.push(responseTime);
            
            if (result.isValid) {
              successCount++;
            } else {
              errorCount++;
            }
          } catch (error) {
            errorCount++;
            const responseTime = Date.now() - stepStartTime;
            responseTimes.push(responseTime);
          }
        }

        const totalTime = Date.now() - startTime;
        const endMemory = process.memoryUsage().heapUsed;

        results[size] = {
          totalTime,
          avgResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
          maxResponseTime: Math.max(...responseTimes),
          minResponseTime: Math.min(...responseTimes),
          throughput: size / (totalTime / 1000), // requests per second
          errorRate: errorCount / size,
          memoryUsage: endMemory - startMemory,
          successCount,
          errorCount
        };

        console.log(`\n  ${size} validations:`);
        console.log(`    Total time: ${totalTime}ms`);
        console.log(`    Avg response: ${results[size].avgResponseTime.toFixed(2)}ms`);
        console.log(`    Throughput: ${results[size].throughput.toFixed(2)} req/s`);
        console.log(`    Success rate: ${((successCount / size) * 100).toFixed(1)}%`);
        console.log(`    Memory used: ${(results[size].memoryUsage / 1024 / 1024).toFixed(2)}MB`);
      }

      // Performance assertions
      expect(results[10].avgResponseTime).toBeLessThan(50); // < 50ms for small batches
      expect(results[100].avgResponseTime).toBeLessThan(100); // < 100ms for medium batches
      expect(results[1000].throughput).toBeGreaterThan(50); // > 50 req/s for large batches
      
      // Memory usage should not grow exponentially
      const memoryGrowthRatio = results[1000].memoryUsage / results[100].memoryUsage;
      expect(memoryGrowthRatio).toBeLessThan(15); // Should not be more than 15x
    });

    it('should maintain performance with concurrent validations', async () => {
      const concurrencyLevels = [1, 5, 10, 20];
      const batchSize = 100;
      const results: Record<number, PerformanceMetrics> = {};

      for (const concurrency of concurrencyLevels) {
        const batches = Array.from({ length: concurrency }, () => 
          Array.from({ length: batchSize }, (_, i) => 
            global.createMockStep('ner', {
              entities: [{
                text: `Entity ${i}`,
                label: 'PERSON',
                start: 0,
                end: 10,
                confidence: 0.95
              }],
              originalText: `Text with Entity ${i}`
            })
          )
        );

        const startTime = Date.now();
        const startMemory = process.memoryUsage().heapUsed;

        const batchPromises = batches.map(async (batch) => {
          const batchStartTime = Date.now();
          const batchResults = await safetyManager.validateSteps(batch);
          const batchTime = Date.now() - batchStartTime;
          
          return {
            results: batchResults,
            batchTime,
            successCount: batchResults.filter(r => r.isValid).length,
            errorCount: batchResults.filter(r => !r.isValid).length
          };
        });

        const batchResults = await Promise.all(batchPromises);
        
        const totalTime = Date.now() - startTime;
        const endMemory = process.memoryUsage().heapUsed;
        
        const totalRequests = concurrency * batchSize;
        const totalSuccesses = batchResults.reduce((sum, batch) => sum + batch.successCount, 0);
        const totalErrors = batchResults.reduce((sum, batch) => sum + batch.errorCount, 0);
        const avgBatchTime = batchResults.reduce((sum, batch) => sum + batch.batchTime, 0) / batchResults.length;

        results[concurrency] = {
          totalTime,
          avgResponseTime: avgBatchTime / batchSize,
          maxResponseTime: Math.max(...batchResults.map(b => b.batchTime)) / batchSize,
          minResponseTime: Math.min(...batchResults.map(b => b.batchTime)) / batchSize,
          throughput: totalRequests / (totalTime / 1000),
          errorRate: totalErrors / totalRequests,
          memoryUsage: endMemory - startMemory,
          successCount: totalSuccesses,
          errorCount: totalErrors
        };

        console.log(`\n  Concurrency ${concurrency}:`);
        console.log(`    Total time: ${totalTime}ms`);
        console.log(`    Avg batch time: ${avgBatchTime.toFixed(2)}ms`);
        console.log(`    Throughput: ${results[concurrency].throughput.toFixed(2)} req/s`);
        console.log(`    Success rate: ${((totalSuccesses / totalRequests) * 100).toFixed(1)}%`);
      }

      // Concurrency should improve throughput
      expect(results[10].throughput).toBeGreaterThan(results[1].throughput);
      
      // Error rates should remain low across all concurrency levels
      Object.values(results).forEach(result => {
        expect(result.errorRate).toBeLessThan(0.01); // < 1% error rate
      });
    });
  });

  describe('Budget Tracking Performance', () => {
    it('should handle high-frequency budget operations efficiently', async () => {
      const operationCounts = [100, 500, 1000, 5000];
      const results: Record<number, PerformanceMetrics> = {};

      for (const count of operationCounts) {
        const executionId = `perf-test-${count}-${Date.now()}`;
        const budgetLimit: BudgetInfo = {
          tokens: 100000,
          monetaryCost: 100,
          apiCalls: count * 2
        };

        budgetTracker.initialize(executionId, budgetLimit);
        
        const costs = Array.from({ length: count }, (_, i) => ({
          tokens: 10 + Math.random() * 20,
          monetaryCost: 0.01 + Math.random() * 0.02,
          apiCalls: 1
        }));

        const startTime = Date.now();
        const startMemory = process.memoryUsage().heapUsed;
        
        const responseTimes: number[] = [];
        let successCount = 0;
        let errorCount = 0;

        for (const cost of costs) {
          const opStartTime = Date.now();
          
          try {
            const result = budgetTracker.addCost(executionId, cost);
            const responseTime = Date.now() - opStartTime;
            
            responseTimes.push(responseTime);
            
            if (result.withinBudget) {
              successCount++;
            } else {
              errorCount++;
            }
          } catch (error) {
            errorCount++;
            const responseTime = Date.now() - opStartTime;
            responseTimes.push(responseTime);
          }
        }

        const totalTime = Date.now() - startTime;
        const endMemory = process.memoryUsage().heapUsed;

        results[count] = {
          totalTime,
          avgResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
          maxResponseTime: Math.max(...responseTimes),
          minResponseTime: Math.min(...responseTimes),
          throughput: count / (totalTime / 1000),
          errorRate: errorCount / count,
          memoryUsage: endMemory - startMemory,
          successCount,
          errorCount
        };

        console.log(`\n  ${count} budget operations:`);
        console.log(`    Total time: ${totalTime}ms`);
        console.log(`    Avg response: ${results[count].avgResponseTime.toFixed(2)}ms`);
        console.log(`    Throughput: ${results[count].throughput.toFixed(2)} ops/s`);
        console.log(`    Memory used: ${(results[count].memoryUsage / 1024).toFixed(2)}KB`);

        budgetTracker.cleanup(executionId);
      }

      // Performance should remain consistent
      expect(results[100].avgResponseTime).toBeLessThan(10); // < 10ms per operation
      expect(results[1000].avgResponseTime).toBeLessThan(20); // < 20ms even for large batches
      expect(results[5000].throughput).toBeGreaterThan(1000); // > 1000 ops/s
    });

    it('should manage memory efficiently with long-running tracking', async () => {
      const executionId = 'memory-test-execution';
      const budgetLimit: BudgetInfo = {
        tokens: 1000000,
        monetaryCost: 1000,
        apiCalls: 50000
      };

      budgetTracker.initialize(executionId, budgetLimit);

      const initialMemory = process.memoryUsage().heapUsed;
      const memorySnapshots: number[] = [initialMemory];
      
      // Simulate long-running execution with many operations
      const operationBatches = 10;
      const operationsPerBatch = 500;
      
      for (let batch = 0; batch < operationBatches; batch++) {
        // Add many operations
        for (let i = 0; i < operationsPerBatch; i++) {
          const cost: BudgetInfo = {
            tokens: 50 + Math.random() * 100,
            monetaryCost: 0.05 + Math.random() * 0.1,
            apiCalls: 1
          };
          
          budgetTracker.addCost(executionId, cost);
        }
        
        // Take memory snapshot
        const currentMemory = process.memoryUsage().heapUsed;
        memorySnapshots.push(currentMemory);
        
        // Small delay to simulate real-world usage
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      const totalOperations = operationBatches * operationsPerBatch;
      
      console.log(`\n  Memory efficiency test:`);
      console.log(`    Total operations: ${totalOperations}`);
      console.log(`    Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`    Final memory: ${(finalMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`    Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      console.log(`    Memory per operation: ${(memoryGrowth / totalOperations).toFixed(0)} bytes`);
      
      // Get final statistics
      const summary = budgetTracker.getBudgetSummary(executionId);
      const history = budgetTracker.getBudgetHistory(executionId);
      
      console.log(`    History entries: ${history.length}`);
      console.log(`    Alert count: ${summary.alertCount}`);
      console.log(`    Final utilization: ${Object.values(summary.utilization).map(v => `${(v * 100).toFixed(1)}%`).join(', ')}`);
      
      // Memory growth should be reasonable
      expect(memoryGrowth / totalOperations).toBeLessThan(1000); // < 1KB per operation
      expect(memoryGrowth / 1024 / 1024).toBeLessThan(50); // < 50MB total growth
      
      budgetTracker.cleanup(executionId);
    });
  });

  describe('Workflow Execution Performance', () => {
    it('should handle complex workflows efficiently', async () => {
      const workflowComplexities = [
        { steps: 3, name: 'Simple' },
        { steps: 10, name: 'Medium' },
        { steps: 25, name: 'Complex' },
        { steps: 50, name: 'Very Complex' }
      ];
      
      const results: Record<string, PerformanceMetrics> = {};

      for (const { steps: stepCount, name } of workflowComplexities) {
        const workflow: WorkflowDefinition = {
          id: `perf-workflow-${stepCount}`,
          name: `Performance Test Workflow - ${name}`,
          version: '1.0.0',
          steps: Array.from({ length: stepCount }, (_, i) => ({
            id: `step-${i}`,
            type: 'action',
            name: `Step ${i}`,
            action: {
              type: i % 3 === 0 ? 'ocr' : i % 3 === 1 ? 'ner' : 'route',
              parameters: i % 3 === 0 ? 
                { imageUrl: `https://example.com/doc-${i}.jpg`, language: 'en' } :
                i % 3 === 1 ?
                { text: `Sample text for step ${i}`, entityTypes: ['PERSON', 'ORG'] } :
                { path: `/api/step-${i}`, method: 'GET' },
              expectedCost: 0.1,
              expectedDuration: 500
            },
            dependencies: i > 0 ? [`step-${i-1}`] : undefined,
            timeout: 10000,
            costEstimate: 0.1
          })),
          budgetLimit: {
            tokens: stepCount * 1000,
            monetaryCost: stepCount * 0.2,
            apiCalls: stepCount * 2,
            computeTime: stepCount * 10000
          }
        };

        const iterations = stepCount <= 10 ? 5 : stepCount <= 25 ? 3 : 1;
        const executionTimes: number[] = [];
        let totalSuccesses = 0;
        let totalErrors = 0;

        for (let i = 0; i < iterations; i++) {
          const startTime = Date.now();
          
          try {
            const outcome = await workflowExecutor.execute(workflow, {
              enableSafetyChecks: true,
              recordTrajectory: false,
              parallelExecution: false
            });
            
            const executionTime = Date.now() - startTime;
            executionTimes.push(executionTime);
            
            if (outcome.status === 'completed') {
              totalSuccesses++;
            } else {
              totalErrors++;
            }
          } catch (error) {
            totalErrors++;
            const executionTime = Date.now() - startTime;
            executionTimes.push(executionTime);
          }
        }

        results[name] = {
          totalTime: executionTimes.reduce((a, b) => a + b, 0),
          avgResponseTime: executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length,
          maxResponseTime: Math.max(...executionTimes),
          minResponseTime: Math.min(...executionTimes),
          throughput: iterations / (executionTimes.reduce((a, b) => a + b, 0) / 1000),
          errorRate: totalErrors / iterations,
          memoryUsage: 0, // Not measured for workflows
          successCount: totalSuccesses,
          errorCount: totalErrors
        };

        console.log(`\n  ${name} workflow (${stepCount} steps):`);
        console.log(`    Avg execution time: ${results[name].avgResponseTime.toFixed(0)}ms`);
        console.log(`    Success rate: ${((totalSuccesses / iterations) * 100).toFixed(1)}%`);
        console.log(`    Time per step: ${(results[name].avgResponseTime / stepCount).toFixed(1)}ms`);
      }

      // Performance should scale reasonably
      expect(results['Simple'].avgResponseTime).toBeLessThan(5000); // < 5s for simple workflows
      expect(results['Medium'].avgResponseTime).toBeLessThan(15000); // < 15s for medium workflows
      expect(results['Complex'].avgResponseTime / 25).toBeLessThan(2000); // < 2s per step for complex workflows
      
      // Success rates should be high
      Object.values(results).forEach(result => {
        expect(result.errorRate).toBeLessThan(0.1); // < 10% error rate
      });
    });
  });

  describe('System Resource Management', () => {
    it('should manage system resources efficiently under load', async () => {
      const loadTest = async (concurrentWorkflows: number) => {
        const workflow: WorkflowDefinition = global.createMockWorkflow([
          {
            id: 'load-step-1',
            type: 'action',
            name: 'Load test step',
            action: {
              type: 'ocr',
              parameters: {
                imageUrl: 'https://example.com/load-test.jpg',
                language: 'en'
              }
            }
          }
        ], {
          tokens: 2000,
          monetaryCost: 2.0
        });

        const startTime = Date.now();
        const startMemory = process.memoryUsage();
        
        const promises = Array.from({ length: concurrentWorkflows }, async (_, i) => {
          try {
            const outcome = await workflowExecutor.execute({
              ...workflow,
              id: `${workflow.id}-${i}`
            }, { enableSafetyChecks: true });
            return { success: true, outcome };
          } catch (error) {
            return { success: false, error };
          }
        });

        const results = await Promise.all(promises);
        const endTime = Date.now();
        const endMemory = process.memoryUsage();
        
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.length - successCount;
        
        return {
          totalTime: endTime - startTime,
          successCount,
          errorCount,
          successRate: successCount / results.length,
          memoryDelta: {
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
            external: endMemory.external - startMemory.external
          }
        };
      };

      const loadLevels = [5, 10, 20, 50];
      
      for (const concurrency of loadLevels) {
        console.log(`\n  Testing ${concurrency} concurrent workflows...`);
        
        const result = await loadTest(concurrency);
        
        console.log(`    Total time: ${result.totalTime}ms`);
        console.log(`    Success rate: ${(result.successRate * 100).toFixed(1)}%`);
        console.log(`    Avg time per workflow: ${(result.totalTime / concurrency).toFixed(1)}ms`);
        console.log(`    Memory delta: ${(result.memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        
        // Resource usage should be reasonable
        expect(result.successRate).toBeGreaterThan(0.8); // > 80% success rate
        expect(result.memoryDelta.heapUsed / 1024 / 1024).toBeLessThan(concurrency * 5); // < 5MB per workflow
        
        // Give system time to recover between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
    });
  });

  describe('Performance Regression Tests', () => {
    it('should not regress in performance over time', async () => {
      // This test would typically compare against baseline metrics
      // For now, we establish current performance characteristics
      
      const baselineTests = [
        {
          name: 'Schema validation',
          test: async () => {
            const step = global.createMockStep('ocr', {
              text: 'Performance test document',
              confidence: 0.92
            });
            
            const iterations = 1000;
            const startTime = Date.now();
            
            for (let i = 0; i < iterations; i++) {
              await safetyManager.validateStep(step);
            }
            
            return Date.now() - startTime;
          },
          maxTime: 5000 // 5 seconds for 1000 validations
        },
        {
          name: 'Budget tracking',
          test: async () => {
            const executionId = 'baseline-budget-test';
            budgetTracker.initialize(executionId, {
              tokens: 100000,
              monetaryCost: 100
            });
            
            const iterations = 1000;
            const startTime = Date.now();
            
            for (let i = 0; i < iterations; i++) {
              budgetTracker.addCost(executionId, {
                tokens: 50,
                monetaryCost: 0.05
              });
            }
            
            budgetTracker.cleanup(executionId);
            return Date.now() - startTime;
          },
          maxTime: 1000 // 1 second for 1000 operations
        }
      ];
      
      for (const baselineTest of baselineTests) {
        console.log(`\n  Running baseline test: ${baselineTest.name}`);
        
        const actualTime = await baselineTest.test();
        
        console.log(`    Execution time: ${actualTime}ms`);
        console.log(`    Baseline limit: ${baselineTest.maxTime}ms`);
        console.log(`    Performance: ${actualTime <= baselineTest.maxTime ? 'PASS' : 'REGRESSION DETECTED'}`);
        
        expect(actualTime).toBeLessThan(baselineTest.maxTime);
      }
    });
  });
});
