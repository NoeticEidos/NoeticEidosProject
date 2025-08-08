/**
 * Unit Tests for Safety Systems
 * Tests budget enforcement, depth limits, capability isolation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BudgetEnforcer, BudgetLimits, ResourceUsage } from '../../safety/enforcers/BudgetEnforcer.js';
import { DepthEnforcer } from '../../safety/enforcers/DepthEnforcer.js';
import { CapabilityIsolator } from '../../safety/enforcers/CapabilityIsolator.js';
import { SafetyManager, SafetyConfig } from '../../safety/managers/SafetyManager.js';
import { BudgetTracker, BudgetInfo } from '../../core/budget-tracker.js';

describe('Safety Systems', () => {
  describe('BudgetEnforcer', () => {
    let budgetEnforcer: BudgetEnforcer;
    let budgetLimits: BudgetLimits;

    beforeEach(() => {
      budgetLimits = {
        tokenLimit: 1000,
        costLimit: 10,
        requestLimit: 20,
        timeLimit: 60000, // 1 minute
        memoryLimit: 1024 * 1024, // 1MB
        concurrencyLimit: 5
      };
      budgetEnforcer = new BudgetEnforcer(budgetLimits);
    });

    it('should allow usage within budget limits', () => {
      const usage: ResourceUsage = {
        tokenCount: 100,
        cost: 1,
        latency: 500,
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(usage);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('within budget');
    });

    it('should reject usage exceeding token limit', () => {
      const usage: ResourceUsage = {
        tokenCount: 1500, // Exceeds limit of 1000
        cost: 1,
        latency: 500,
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(usage);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('token limit');
    });

    it('should reject usage exceeding cost limit', () => {
      const usage: ResourceUsage = {
        tokenCount: 100,
        cost: 15, // Exceeds limit of 10
        latency: 500,
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(usage);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cost limit');
    });

    it('should track cumulative usage correctly', () => {
      const usage1: ResourceUsage = {
        tokenCount: 400,
        cost: 4,
        latency: 500,
        timestamp: Date.now()
      };

      const usage2: ResourceUsage = {
        tokenCount: 400,
        cost: 4,
        latency: 500,
        timestamp: Date.now()
      };

      // First usage should pass
      budgetEnforcer.recordUsage(usage1);
      const result1 = budgetEnforcer.checkBudget(usage2);
      expect(result1.allowed).toBe(true);

      // Second usage should fail (cumulative: 800 + 400 = 1200 > 1000)
      budgetEnforcer.recordUsage(usage2);
      const usage3: ResourceUsage = {
        tokenCount: 300,
        cost: 1,
        latency: 500,
        timestamp: Date.now()
      };
      
      const result2 = budgetEnforcer.checkBudget(usage3);
      expect(result2.allowed).toBe(false);
    });

    it('should reset budget counters correctly', () => {
      const usage: ResourceUsage = {
        tokenCount: 900,
        cost: 9,
        latency: 500,
        timestamp: Date.now()
      };

      budgetEnforcer.recordUsage(usage);
      budgetEnforcer.reset();

      const newUsage: ResourceUsage = {
        tokenCount: 100,
        cost: 1,
        latency: 500,
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(newUsage);
      expect(result.allowed).toBe(true);
    });

    it('should provide accurate status reporting', () => {
      const usage: ResourceUsage = {
        tokenCount: 500,
        cost: 5,
        latency: 1000,
        timestamp: Date.now()
      };

      budgetEnforcer.recordUsage(usage);
      const status = budgetEnforcer.getStatus();

      expect(status.tokenUsage).toBe(500);
      expect(status.costUsage).toBe(5);
      expect(status.tokenUtilization).toBe(0.5);
      expect(status.costUtilization).toBe(0.5);
    });

    it('should update limits dynamically', () => {
      const newLimits: BudgetLimits = {
        ...budgetLimits,
        tokenLimit: 2000
      };

      budgetEnforcer.updateLimits(newLimits);
      
      const usage: ResourceUsage = {
        tokenCount: 1500, // Would exceed old limit but within new
        cost: 1,
        latency: 500,
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(usage);
      expect(result.allowed).toBe(true);
    });
  });

  describe('DepthEnforcer', () => {
    let depthEnforcer: DepthEnforcer;
    const depthLimits = {
      maxDepth: 5,
      maxBranching: 3
    };

    beforeEach(() => {
      depthEnforcer = new DepthEnforcer(depthLimits);
    });

    it('should allow execution within depth limits', () => {
      const result = depthEnforcer.checkDepth(3);
      expect(result).toBe(true);
    });

    it('should reject execution exceeding depth limits', () => {
      const result = depthEnforcer.checkDepth(6);
      expect(result).toBe(false);
    });

    it('should allow branching within limits', () => {
      const result = depthEnforcer.checkBranching(2);
      expect(result).toBe(true);
    });

    it('should reject branching exceeding limits', () => {
      const result = depthEnforcer.checkBranching(4);
      expect(result).toBe(false);
    });

    it('should track depth statistics', () => {
      depthEnforcer.checkDepth(1);
      depthEnforcer.checkDepth(3);
      depthEnforcer.checkDepth(4);
      
      const stats = depthEnforcer.getStats();
      expect(stats.maxDepthReached).toBe(4);
      expect(stats.totalDepthChecks).toBe(3);
      expect(stats.depthViolations).toBe(0);
    });

    it('should update limits dynamically', () => {
      const newLimits = {
        maxDepth: 10,
        maxBranching: 5
      };

      depthEnforcer.updateLimits(newLimits);
      
      const result = depthEnforcer.checkDepth(7);
      expect(result).toBe(true);
    });
  });

  describe('CapabilityIsolator', () => {
    let capabilityIsolator: CapabilityIsolator;
    const capabilityConfig = {
      allowed: ['ocr', 'ner', 'route'],
      restricted: ['admin', 'system', 'privileged'],
      requireApproval: ['sensitive', 'financial']
    };

    beforeEach(() => {
      capabilityIsolator = new CapabilityIsolator(capabilityConfig);
    });

    it('should allow permitted capabilities', () => {
      const result = capabilityIsolator.validateCapabilities(['ocr', 'ner']);
      expect(result.allowed).toBe(true);
      expect(result.restrictedCapabilities).toHaveLength(0);
    });

    it('should reject restricted capabilities', () => {
      const result = capabilityIsolator.validateCapabilities(['ocr', 'admin']);
      expect(result.allowed).toBe(false);
      expect(result.restrictedCapabilities).toContain('admin');
    });

    it('should flag capabilities requiring approval', () => {
      const result = capabilityIsolator.validateCapabilities(['ocr', 'sensitive']);
      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(true);
      expect(result.restrictedCapabilities).toContain('sensitive');
    });

    it('should handle mixed capability sets', () => {
      const result = capabilityIsolator.validateCapabilities([
        'ocr',        // allowed
        'sensitive',  // requires approval
        'admin'       // restricted
      ]);
      
      expect(result.allowed).toBe(false);
      expect(result.restrictedCapabilities).toContain('admin');
      expect(result.restrictedCapabilities).toContain('sensitive');
    });

    it('should provide capability statistics', () => {
      capabilityIsolator.validateCapabilities(['ocr', 'ner']);
      capabilityIsolator.validateCapabilities(['admin']);
      capabilityIsolator.validateCapabilities(['sensitive']);
      
      const stats = capabilityIsolator.getStats();
      expect(stats.totalChecks).toBe(3);
      expect(stats.violations).toBe(2);
      expect(stats.approvalRequired).toBe(1);
    });

    it('should update configuration dynamically', () => {
      const newConfig = {
        ...capabilityConfig,
        allowed: [...capabilityConfig.allowed, 'new-capability']
      };

      capabilityIsolator.updateConfig(newConfig);
      
      const result = capabilityIsolator.validateCapabilities(['new-capability']);
      expect(result.allowed).toBe(true);
    });
  });

  describe('BudgetTracker Integration', () => {
    let budgetTracker: BudgetTracker;
    const executionId = 'test-execution-1';

    beforeEach(() => {
      budgetTracker = new BudgetTracker();
    });

    it('should initialize budget tracking correctly', () => {
      const budgetLimit: BudgetInfo = {
        tokens: 1000,
        computeTime: 60000,
        memory: 1024 * 1024,
        apiCalls: 50,
        monetaryCost: 10
      };

      expect(() => {
        budgetTracker.initialize(executionId, budgetLimit);
      }).not.toThrow();

      const current = budgetTracker.getCurrentBudget(executionId);
      expect(current.tokens).toBe(0);
    });

    it('should track budget consumption accurately', () => {
      const budgetLimit: BudgetInfo = {
        tokens: 1000,
        monetaryCost: 10
      };

      budgetTracker.initialize(executionId, budgetLimit);
      
      const cost: BudgetInfo = {
        tokens: 250,
        monetaryCost: 2.5
      };

      const result = budgetTracker.addCost(executionId, cost);
      
      expect(result.withinBudget).toBe(true);
      expect(result.utilizationPercent.tokens).toBe(0.25);
      expect(result.utilizationPercent.monetaryCost).toBe(0.25);
    });

    it('should detect budget violations', () => {
      const budgetLimit: BudgetInfo = {
        tokens: 100,
        monetaryCost: 5
      };

      budgetTracker.initialize(executionId, budgetLimit);
      
      const excessiveCost: BudgetInfo = {
        tokens: 150, // Exceeds limit
        monetaryCost: 3
      };

      const result = budgetTracker.addCost(executionId, excessiveCost);
      
      expect(result.withinBudget).toBe(false);
      expect(result.message).toContain('Budget exceeded');
    });

    it('should generate alerts at thresholds', (done) => {
      const budgetLimit: BudgetInfo = {
        tokens: 1000
      };

      budgetTracker.setAlertCallback((alert) => {
        expect(alert.severity).toBeOneOf(['warning', 'error', 'critical']);
        expect(alert.executionId).toBe(executionId);
        done();
      });

      budgetTracker.initialize(executionId, budgetLimit);
      
      // Add cost to trigger 75% threshold
      const cost: BudgetInfo = {
        tokens: 750
      };

      budgetTracker.addCost(executionId, cost);
    });

    it('should provide comprehensive budget summaries', () => {
      const budgetLimit: BudgetInfo = {
        tokens: 1000,
        computeTime: 60000,
        monetaryCost: 10
      };

      budgetTracker.initialize(executionId, budgetLimit);
      
      const cost: BudgetInfo = {
        tokens: 300,
        computeTime: 15000,
        monetaryCost: 3
      };

      budgetTracker.addCost(executionId, cost);
      
      const summary = budgetTracker.getBudgetSummary(executionId);
      
      expect(summary.executionId).toBe(executionId);
      expect(summary.withinBudget).toBe(true);
      expect(summary.totalOperations).toBe(1);
      expect(summary.utilization.tokens).toBeCloseTo(0.3);
    });
  });

  describe('SafetyManager Integration', () => {
    let safetyManager: SafetyManager;
    const safetyConfig: SafetyConfig = {
      budgetLimits: {
        tokenLimit: 1000,
        costLimit: 10,
        requestLimit: 50,
        timeLimit: 300000,
        memoryLimit: 1024 * 1024 * 100,
        concurrencyLimit: 10
      },
      depthLimits: {
        maxDepth: 5,
        maxBranching: 3
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

    beforeEach(() => {
      safetyManager = new SafetyManager(safetyConfig);
    });

    it('should enforce all safety constraints together', async () => {
      const step = {
        id: 'integrated-test-1',
        type: 'ocr' as const,
        args_json: JSON.stringify({
          text: 'Test document with OCR results',
          confidence: 0.95
        }),
        metadata: {
          timestamp: Date.now(),
          userId: 'test-user',
          depth: 2,
          capabilities: ['ocr']
        }
      };

      const result = await safetyManager.validateStep(step);
      expect(result.isValid).toBe(true);
    });

    it('should reject steps violating multiple constraints', async () => {
      const step = {
        id: 'violation-test-1',
        type: 'ocr' as const,
        args_json: JSON.stringify({
          text: 'Test document',
          confidence: 0.95
        }),
        metadata: {
          timestamp: Date.now(),
          userId: 'test-user',
          depth: 10, // Exceeds depth limit
          capabilities: ['ocr', 'admin'] // Restricted capability
        }
      };

      const result = await safetyManager.validateStep(step);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        expect.stringMatching(/depth limit exceeded/i)
      );
    });

    it('should update configuration dynamically', () => {
      const newConfig = {
        depthLimits: {
          maxDepth: 10,
          maxBranching: 5
        }
      };

      expect(() => {
        safetyManager.updateConfig(newConfig);
      }).not.toThrow();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    let budgetEnforcer: BudgetEnforcer;

    beforeEach(() => {
      const limits: BudgetLimits = {
        tokenLimit: 1000,
        costLimit: 10,
        requestLimit: 20,
        timeLimit: 60000,
        memoryLimit: 1024 * 1024,
        concurrencyLimit: 5
      };
      budgetEnforcer = new BudgetEnforcer(limits);
    });

    it('should handle negative values gracefully', () => {
      const usage: ResourceUsage = {
        tokenCount: -100, // Negative value
        cost: 1,
        latency: 500,
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(usage);
      expect(result.allowed).toBe(true); // Should treat negative as 0
    });

    it('should handle zero limits correctly', () => {
      const zeroLimits: BudgetLimits = {
        tokenLimit: 0,
        costLimit: 0,
        requestLimit: 0,
        timeLimit: 0,
        memoryLimit: 0,
        concurrencyLimit: 0
      };

      const zeroEnforcer = new BudgetEnforcer(zeroLimits);
      
      const usage: ResourceUsage = {
        tokenCount: 1,
        cost: 0.01,
        latency: 100,
        timestamp: Date.now()
      };

      const result = zeroEnforcer.checkBudget(usage);
      expect(result.allowed).toBe(false);
    });

    it('should handle concurrent access safely', async () => {
      const promises = Array.from({ length: 10 }, (_, i) => {
        const usage: ResourceUsage = {
          tokenCount: 50,
          cost: 0.5,
          latency: 100,
          timestamp: Date.now()
        };
        return budgetEnforcer.checkBudget(usage);
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
    });
  });
});
