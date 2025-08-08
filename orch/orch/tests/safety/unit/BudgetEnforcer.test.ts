/**
 * Unit tests for BudgetEnforcer
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BudgetEnforcer, BudgetLimits, ResourceUsage } from '../../../src/safety/enforcers/BudgetEnforcer.js';

describe('BudgetEnforcer', () => {
  let budgetEnforcer: BudgetEnforcer;
  let testLimits: BudgetLimits;

  beforeEach(() => {
    vi.useFakeTimers();
    testLimits = {
      maxTokens: 1000,
      maxCost: 1.0,
      maxLatency: 5000,
      periodMs: 3600000, // 1 hour
      burstAllowance: 20
    };
    budgetEnforcer = new BudgetEnforcer(testLimits);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with default limits when none provided', () => {
      const defaultEnforcer = new BudgetEnforcer();
      const status = defaultEnforcer.getStatus();
      
      expect(status.limits.maxTokens).toBe(1000000);
      expect(status.limits.maxCost).toBe(100);
      expect(status.limits.periodMs).toBe(3600000);
    });

    it('should initialize with provided limits', () => {
      const status = budgetEnforcer.getStatus();
      
      expect(status.limits.maxTokens).toBe(1000);
      expect(status.limits.maxCost).toBe(1.0);
      expect(status.limits.maxLatency).toBe(5000);
    });
  });

  describe('Budget Checking', () => {
    it('should allow usage within limits', () => {
      const usage: ResourceUsage = {
        tokenCount: 100,
        cost: 0.1,
        latency: 1000,
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(usage);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject usage exceeding token limit', () => {
      const usage: ResourceUsage = {
        tokenCount: 1500, // exceeds maxTokens (1000) + burstAllowance (20%)
        cost: 0.1,
        latency: 1000,
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(usage);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Token limit exceeded');
      expect(result.suggestedDelay).toBeDefined();
    });

    it('should reject usage exceeding cost limit', () => {
      const usage: ResourceUsage = {
        tokenCount: 100,
        cost: 1.5, // exceeds maxCost (1.0) + burstAllowance (20%)
        latency: 1000,
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(usage);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cost limit exceeded');
    });

    it('should reject usage exceeding latency limit', () => {
      const usage: ResourceUsage = {
        tokenCount: 100,
        cost: 0.1,
        latency: 6000, // exceeds maxLatency (5000)
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(usage);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Latency limit exceeded');
    });

    it('should allow burst usage within burst allowance', () => {
      const usage: ResourceUsage = {
        tokenCount: 1100, // within burst allowance (1000 * 1.2 = 1200)
        cost: 0.5,
        latency: 1000,
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(usage);
      
      expect(result.allowed).toBe(true);
    });

    it('should enforce rate limiting', () => {
      // Simulate 101 rapid requests
      for (let i = 0; i < 101; i++) {
        const usage: ResourceUsage = {
          tokenCount: 1,
          cost: 0.001,
          latency: 100,
          timestamp: Date.now()
        };
        budgetEnforcer.recordUsage(usage);
      }

      const newUsage: ResourceUsage = {
        tokenCount: 1,
        cost: 0.001,
        latency: 100,
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(newUsage);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit exceeded');
      expect(result.suggestedDelay).toBeDefined();
    });
  });

  describe('Usage Recording', () => {
    it('should record usage correctly', () => {
      const usage: ResourceUsage = {
        tokenCount: 100,
        cost: 0.1,
        latency: 1000,
        timestamp: Date.now()
      };

      budgetEnforcer.recordUsage(usage);
      
      const status = budgetEnforcer.getStatus();
      expect(status.current.tokens).toBe(100);
      expect(status.current.cost).toBe(0.1);
      expect(status.current.averageLatency).toBe(1000);
    });

    it('should accumulate usage across multiple recordings', () => {
      const usage1: ResourceUsage = {
        tokenCount: 50,
        cost: 0.05,
        latency: 800,
        timestamp: Date.now()
      };

      const usage2: ResourceUsage = {
        tokenCount: 75,
        cost: 0.08,
        latency: 1200,
        timestamp: Date.now()
      };

      budgetEnforcer.recordUsage(usage1);
      budgetEnforcer.recordUsage(usage2);
      
      const status = budgetEnforcer.getStatus();
      expect(status.current.tokens).toBe(125);
      expect(status.current.cost).toBe(0.13);
      expect(status.current.averageLatency).toBe(1000); // (800 + 1200) / 2
    });
  });

  describe('Budget Status', () => {
    it('should provide accurate budget status', () => {
      const usage: ResourceUsage = {
        tokenCount: 200,
        cost: 0.2,
        latency: 1000,
        timestamp: Date.now()
      };

      budgetEnforcer.recordUsage(usage);
      
      const status = budgetEnforcer.getStatus();
      
      expect(status.current.tokens).toBe(200);
      expect(status.current.cost).toBe(0.2);
      expect(status.utilization.tokens).toBe(20); // 200/1000 * 100
      expect(status.utilization.cost).toBe(20); // 0.2/1.0 * 100
      expect(status.remaining.tokens).toBe(800);
      expect(status.remaining.cost).toBe(0.8);
      expect(status.isNearLimit).toBe(false);
    });

    it('should detect near limit conditions', () => {
      const usage: ResourceUsage = {
        tokenCount: 850, // 85% of limit
        cost: 0.1,
        latency: 1000,
        timestamp: Date.now()
      };

      budgetEnforcer.recordUsage(usage);
      
      const status = budgetEnforcer.getStatus();
      expect(status.isNearLimit).toBe(true);
    });

    it('should calculate time until reset correctly', () => {
      const status = budgetEnforcer.getStatus();
      
      expect(status.remaining.timeUntilReset).toBeGreaterThan(0);
      expect(status.remaining.timeUntilReset).toBeLessThanOrEqual(testLimits.periodMs!);
    });
  });

  describe('Budget Reset', () => {
    it('should reset budget counters', () => {
      const usage: ResourceUsage = {
        tokenCount: 100,
        cost: 0.1,
        latency: 1000,
        timestamp: Date.now()
      };

      budgetEnforcer.recordUsage(usage);
      budgetEnforcer.reset();
      
      const status = budgetEnforcer.getStatus();
      expect(status.current.tokens).toBe(0);
      expect(status.current.cost).toBe(0);
    });

    it('should automatically reset after period expires', () => {
      const usage: ResourceUsage = {
        tokenCount: 100,
        cost: 0.1,
        latency: 1000,
        timestamp: Date.now()
      };

      budgetEnforcer.recordUsage(usage);
      
      // Fast-forward time beyond the period
      vi.advanceTimersByTime(testLimits.periodMs! + 1000);
      
      // Check budget - should trigger period cleanup
      const newUsage: ResourceUsage = {
        tokenCount: 1,
        cost: 0.001,
        latency: 100,
        timestamp: Date.now()
      };
      
      budgetEnforcer.checkBudget(newUsage);
      
      const status = budgetEnforcer.getStatus();
      // Usage from previous period should be cleaned up
      expect(status.current.tokens).toBe(0);
    });
  });

  describe('Limit Updates', () => {
    it('should update budget limits', () => {
      const newLimits: BudgetLimits = {
        maxTokens: 2000,
        maxCost: 2.0
      };

      budgetEnforcer.updateLimits(newLimits);
      
      const status = budgetEnforcer.getStatus();
      expect(status.limits.maxTokens).toBe(2000);
      expect(status.limits.maxCost).toBe(2.0);
      expect(status.limits.maxLatency).toBe(5000); // unchanged
    });
  });

  describe('Usage History', () => {
    it('should return usage history for specified periods', () => {
      const usage1: ResourceUsage = {
        tokenCount: 100,
        cost: 0.1,
        latency: 1000,
        timestamp: Date.now() - 30 * 60 * 1000 // 30 minutes ago
      };

      const usage2: ResourceUsage = {
        tokenCount: 50,
        cost: 0.05,
        latency: 800,
        timestamp: Date.now() - 90 * 60 * 1000 // 90 minutes ago
      };

      budgetEnforcer.recordUsage(usage1);
      budgetEnforcer.recordUsage(usage2);
      
      const recentHistory = budgetEnforcer.getUsageHistory(1); // last 1 period (1 hour)
      const extendedHistory = budgetEnforcer.getUsageHistory(2); // last 2 periods (2 hours)
      
      expect(recentHistory).toHaveLength(1);
      expect(extendedHistory).toHaveLength(2);
    });
  });

  describe('Usage Prediction', () => {
    it('should predict future usage based on trends', () => {
      // Create usage pattern
      const baseTime = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      for (let i = 0; i < 5; i++) {
        const usage: ResourceUsage = {
          tokenCount: 20,
          cost: 0.02,
          latency: 1000,
          timestamp: baseTime + (i * 2 * 60 * 1000) // every 2 minutes
        };
        budgetEnforcer.recordUsage(usage);
      }

      const prediction = budgetEnforcer.predictUsage(10 * 60 * 1000); // next 10 minutes
      
      expect(prediction.estimatedTokens).toBeGreaterThan(0);
      expect(prediction.estimatedCost).toBeGreaterThan(0);
      expect(prediction.confidence).toBeGreaterThan(0);
    });

    it('should return zero prediction with insufficient data', () => {
      const prediction = budgetEnforcer.predictUsage(60 * 1000);
      
      expect(prediction.estimatedTokens).toBe(0);
      expect(prediction.estimatedCost).toBe(0);
      expect(prediction.confidence).toBe(0);
    });
  });

  describe('Cost Breakdown', () => {
    it('should provide cost breakdown', () => {
      const usage: ResourceUsage = {
        tokenCount: 100,
        cost: 0.1,
        latency: 1000,
        timestamp: Date.now()
      };

      budgetEnforcer.recordUsage(usage);
      
      const breakdown = budgetEnforcer.getCostBreakdown();
      
      expect(breakdown.total.count).toBe(1);
      expect(breakdown.total.totalCost).toBe(0.1);
      expect(breakdown.total.avgCost).toBe(0.1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero resource usage', () => {
      const usage: ResourceUsage = {
        tokenCount: 0,
        cost: 0,
        latency: 0,
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(usage);
      expect(result.allowed).toBe(true);

      budgetEnforcer.recordUsage(usage);
      const status = budgetEnforcer.getStatus();
      expect(status.current.tokens).toBe(0);
    });

    it('should handle negative timestamps gracefully', () => {
      const usage: ResourceUsage = {
        tokenCount: 100,
        cost: 0.1,
        latency: 1000,
        timestamp: -1000
      };

      expect(() => {
        budgetEnforcer.recordUsage(usage);
      }).not.toThrow();
    });

    it('should handle very large resource requests', () => {
      const usage: ResourceUsage = {
        tokenCount: Number.MAX_SAFE_INTEGER,
        cost: Number.MAX_SAFE_INTEGER,
        latency: Number.MAX_SAFE_INTEGER,
        timestamp: Date.now()
      };

      const result = budgetEnforcer.checkBudget(usage);
      expect(result.allowed).toBe(false);
    });
  });
});