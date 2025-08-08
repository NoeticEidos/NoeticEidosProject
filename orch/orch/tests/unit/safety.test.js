// Unit tests for safety manager
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  SafetyManager,
  SecurityError,
  BudgetExceededError,
  RateLimitExceededError,
  safetyManager
} from '../../src/safety/index.js';

describe('SafetyManager', () => {
  let safety;

  beforeEach(() => {
    safety = new SafetyManager({
      maxTokensPerTask: 5000,
      maxExecutionTime: 60000,
      maxConcurrentTasks: 5,
      maxAgentsPerSwarm: 10,
      blacklistedCommands: ['rm -rf', 'sudo', 'eval'],
      rateLimits: {
        tasksPerMinute: 10,
        agentSpawnsPerMinute: 5,
        memoryOperationsPerMinute: 20
      },
      budgetLimits: {
        dailyTokens: 100000,
        hourlyTokens: 10000,
        perTaskTokens: 1000
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Task Validation', () => {
    const validTask = {
      id: 'task-123',
      description: 'Test task description',
      priority: 'medium',
      status: 'pending',
      budget: {
        maxTokens: 1000,
        maxTime: 30000,
        maxAgents: 2
      }
    };

    it('should validate a valid task', async () => {
      const result = await safety.validateTask(validTask);
      expect(result).toMatchObject(validTask);
    });

    it('should reject tasks with excessive token budget', async () => {
      const invalidTask = {
        ...validTask,
        budget: { maxTokens: 10000 } // Exceeds maxTokensPerTask
      };

      await expect(safety.validateTask(invalidTask))
        .rejects.toThrow(SecurityError);
    });

    it('should reject tasks with excessive execution time', async () => {
      const invalidTask = {
        ...validTask,
        budget: { maxTime: 120000 } // Exceeds maxExecutionTime
      };

      await expect(safety.validateTask(invalidTask))
        .rejects.toThrow(SecurityError);
    });

    it('should detect suspicious content in task description', async () => {
      const suspiciousTask = {
        ...validTask,
        description: 'Execute this: <script>alert("xss")</script>'
      };

      await expect(safety.validateTask(suspiciousTask))
        .rejects.toThrow(SecurityError);
    });

    it('should enforce task rate limiting', async () => {
      // Execute tasks up to the limit
      for (let i = 0; i < 10; i++) {
        await safety.validateTask({ ...validTask, id: `task-${i}` });
      }

      // Next task should be rate limited
      await expect(safety.validateTask({ ...validTask, id: 'task-excess' }))
        .rejects.toThrow(RateLimitExceededError);
    });

    it('should enforce daily token budget', async () => {
      const highTokenTask = {
        ...validTask,
        budget: { maxTokens: 5000 }
      };

      // Consume most of daily budget
      for (let i = 0; i < 19; i++) {
        await safety.validateTask({ ...highTokenTask, id: `task-${i}` });
      }

      // Next task should exceed daily budget
      await expect(safety.validateTask({ ...highTokenTask, id: 'task-excess' }))
        .rejects.toThrow(BudgetExceededError);
    });

    it('should enforce hourly token budget', async () => {
      const highTokenTask = {
        ...validTask,
        budget: { maxTokens: 4000 }
      };

      // First two tasks consume 8000 tokens (within daily but exceed hourly)
      await safety.validateTask({ ...highTokenTask, id: 'task-1' });
      await safety.validateTask({ ...highTokenTask, id: 'task-2' });

      // Third task should exceed hourly budget
      await expect(safety.validateTask({ ...highTokenTask, id: 'task-3' }))
        .rejects.toThrow(BudgetExceededError);
    });

    it('should log security events for failed validations', async () => {
      const originalLog = safety.securityLog.length;
      
      try {
        await safety.validateTask({ ...validTask, budget: { maxTokens: 10000 } });
      } catch (error) {
        // Expected to fail
      }

      expect(safety.securityLog).toHaveLength(originalLog + 1);
      expect(safety.securityLog[safety.securityLog.length - 1].type)
        .toBe('task_validation_failed');
    });
  });

  describe('Agent Validation', () => {
    const validAgent = {
      id: 'agent-123',
      type: 'coordinator',
      name: 'Test Agent',
      capabilities: ['analysis']
    };

    it('should validate a valid agent spawn request', async () => {
      const result = await safety.validateAgentSpawn(validAgent);
      expect(result).toMatchObject(validAgent);
    });

    it('should enforce agent spawn rate limiting', async () => {
      // Spawn agents up to the limit
      for (let i = 0; i < 5; i++) {
        await safety.validateAgentSpawn({ ...validAgent, id: `agent-${i}` });
      }

      // Next spawn should be rate limited
      await expect(safety.validateAgentSpawn({ ...validAgent, id: 'agent-excess' }))
        .rejects.toThrow(RateLimitExceededError);
    });

    it('should validate agent schema', async () => {
      const invalidAgent = { id: 'agent-123' }; // Missing required type

      await expect(safety.validateAgentSpawn(invalidAgent))
        .rejects.toThrow();
    });
  });

  describe('Workflow Validation', () => {
    const validWorkflow = {
      id: 'workflow-123',
      name: 'Test Workflow',
      steps: [
        { id: 'step-1', type: 'analysis', dependencies: [] },
        { id: 'step-2', type: 'implementation', dependencies: ['step-1'] }
      ]
    };

    it('should validate a valid workflow', async () => {
      const result = await safety.validateWorkflow(validWorkflow);
      expect(result).toMatchObject(validWorkflow);
    });

    it('should reject workflows with too many steps', async () => {
      const complexWorkflow = {
        ...validWorkflow,
        steps: Array(60).fill(null).map((_, i) => ({
          id: `step-${i}`,
          type: 'task',
          dependencies: i > 0 ? [`step-${i-1}`] : []
        }))
      };

      await expect(safety.validateWorkflow(complexWorkflow))
        .rejects.toThrow(SecurityError);
    });

    it('should detect circular dependencies', async () => {
      const circularWorkflow = {
        ...validWorkflow,
        steps: [
          { id: 'step-1', type: 'analysis', dependencies: ['step-2'] },
          { id: 'step-2', type: 'implementation', dependencies: ['step-1'] }
        ]
      };

      await expect(safety.validateWorkflow(circularWorkflow))
        .rejects.toThrow(SecurityError);
    });

    it('should validate step dependencies', async () => {
      const workflowWithInvalidDeps = {
        ...validWorkflow,
        steps: [
          { id: 'step-1', type: 'analysis', dependencies: ['nonexistent-step'] }
        ]
      };

      await expect(safety.validateWorkflow(workflowWithInvalidDeps))
        .rejects.toThrow();
    });
  });

  describe('Command Sanitization', () => {
    it('should sanitize valid commands', () => {
      const command = 'ls -la /home/user';
      const sanitized = safety.sanitizeCommand(command);
      expect(sanitized).toBe('ls -la /home/user');
    });

    it('should reject blacklisted commands', () => {
      const dangerousCommands = [
        'rm -rf /',
        'sudo rm file.txt',
        'eval "dangerous code"'
      ];

      dangerousCommands.forEach(cmd => {
        expect(() => safety.sanitizeCommand(cmd))
          .toThrow(SecurityError);
      });
    });

    it('should remove dangerous shell metacharacters', () => {
      const command = 'ls -la; rm file.txt && echo "done"';
      const sanitized = safety.sanitizeCommand(command);
      expect(sanitized).not.toContain(';');
      expect(sanitized).not.toContain('&&');
    });

    it('should prevent directory traversal', () => {
      const command = 'cat ../../../etc/passwd';
      const sanitized = safety.sanitizeCommand(command);
      expect(sanitized).not.toContain('..');
    });

    it('should reject non-string commands', () => {
      expect(() => safety.sanitizeCommand(null))
        .toThrow(SecurityError);
      expect(() => safety.sanitizeCommand(123))
        .toThrow(SecurityError);
    });

    it('should reject empty commands after sanitization', () => {
      const command = ';;;&&|||```';
      expect(() => safety.sanitizeCommand(command))
        .toThrow(SecurityError);
    });
  });

  describe('Memory Operation Validation', () => {
    const validMemoryOp = {
      action: 'store',
      data: {
        key: 'test-key',
        value: { content: 'test data' },
        namespace: 'test'
      }
    };

    it('should validate valid memory operations', () => {
      const result = safety.validateMemoryOperation(validMemoryOp);
      expect(result).toEqual(validMemoryOp);
    });

    it('should enforce memory operation rate limiting', () => {
      // Perform operations up to the limit
      for (let i = 0; i < 20; i++) {
        safety.validateMemoryOperation({ ...validMemoryOp, data: { key: `key-${i}` } });
      }

      // Next operation should be rate limited
      expect(() => safety.validateMemoryOperation(validMemoryOp))
        .toThrow(RateLimitExceededError);
    });

    it('should detect sensitive data patterns', () => {
      const sensitiveOp = {
        action: 'store',
        data: {
          key: 'user-config',
          value: { password: 'secret123', api_key: 'xyz789' },
          namespace: 'config'
        }
      };

      // Should not throw but should log the event
      const originalLogLength = safety.securityLog.length;
      safety.validateMemoryOperation(sensitiveOp);
      expect(safety.securityLog.length).toBeGreaterThan(originalLogLength);
    });

    it('should validate memory entry schema for store operations', () => {
      const invalidStoreOp = {
        action: 'store',
        data: {
          // Missing required 'key' and 'value'
          namespace: 'test'
        }
      };

      expect(() => safety.validateMemoryOperation(invalidStoreOp))
        .toThrow();
    });
  });

  describe('Suspicious Content Detection', () => {
    const suspiciousPatterns = [
      '<script>alert("xss")</script>',
      'javascript:void(0)',
      'vbscript:msgbox("test")',
      'onload="alert(1)"',
      'eval(dangerous_code)',
      'function malicious() {}',
      '${shell_injection}',
      '#{ruby_injection}'
    ];

    it('should detect various types of suspicious content', () => {
      suspiciousPatterns.forEach(pattern => {
        expect(safety.containsSuspiciousContent(pattern)).toBe(true);
      });
    });

    it('should allow safe content', () => {
      const safeContent = [
        'This is a normal task description',
        'Analyze the data and generate report',
        'Calculate sum of numbers: 1 + 2 + 3',
        'Process user input safely'
      ];

      safeContent.forEach(content => {
        expect(safety.containsSuspiciousContent(content)).toBe(false);
      });
    });

    it('should be case insensitive', () => {
      expect(safety.containsSuspiciousContent('<SCRIPT>alert("test")</SCRIPT>')).toBe(true);
      expect(safety.containsSuspiciousContent('JAVASCRIPT:void(0)')).toBe(true);
    });
  });

  describe('Budget Management', () => {
    it('should reset daily budget at midnight', () => {
      // Mock Date to test budget reset
      const originalDate = Date;
      const mockDate = new Date('2023-01-01T23:59:59Z');
      global.Date = jest.fn(() => mockDate);
      
      safety.budgetCounters.daily.tokens = 50000;
      safety.budgetCounters.daily.resetTime = mockDate.getTime() - 1000;

      safety.resetBudgetCounters();

      expect(safety.budgetCounters.daily.tokens).toBe(0);
      global.Date = originalDate;
    });

    it('should reset hourly budget every hour', () => {
      const originalDate = Date;
      const mockDate = new Date('2023-01-01T12:30:00Z');
      global.Date = jest.fn(() => mockDate);
      
      safety.budgetCounters.hourly.tokens = 5000;
      safety.budgetCounters.hourly.resetTime = mockDate.getTime() - 1000;

      safety.resetBudgetCounters();

      expect(safety.budgetCounters.hourly.tokens).toBe(0);
      global.Date = originalDate;
    });

    it('should track task-specific token usage', async () => {
      const task = {
        id: 'tracked-task',
        description: 'Test task',
        budget: { maxTokens: 500 }
      };

      await safety.validateTask(task);
      expect(safety.budgetCounters.task.get('tracked-task')).toBe(500);
    });
  });

  describe('Rate Limiting', () => {
    it('should reset rate limit counters after time window', () => {
      const originalNow = Date.now;
      let currentTime = 1000000000;
      Date.now = jest.fn(() => currentTime);

      // Add some operations
      safety.rateLimitCounters.set('task', [currentTime - 30000, currentTime - 20000]);

      // Move time forward by 2 minutes
      currentTime += 120000;

      // This should trigger cleanup of old entries
      safety.enforceRateLimit('task');

      const counter = safety.rateLimitCounters.get('task');
      expect(counter).toHaveLength(1); // Only the current request should remain

      Date.now = originalNow;
    });

    it('should handle different operation types', () => {
      const operations = ['task', 'agentSpawn', 'memoryOperation'];

      operations.forEach(op => {
        expect(() => safety.enforceRateLimit(op)).not.toThrow();
      });
    });
  });

  describe('Security Reporting', () => {
    it('should generate security report', () => {
      // Add some test events
      safety.logSecurityEvent('test_event_1', { data: 'test1' });
      safety.logSecurityEvent('test_event_2', { data: 'test2' });
      safety.logSecurityEvent('test_event_1', { data: 'test3' });

      const report = safety.getSecurityReport(24);

      expect(report.timeframe).toBe('24 hours');
      expect(report.totalEvents).toBeGreaterThanOrEqual(3);
      expect(report.eventTypes.test_event_1).toBe(2);
      expect(report.eventTypes.test_event_2).toBe(1);
      expect(report.budgetStatus).toBeDefined();
      expect(report.recentEvents).toBeDefined();
    });

    it('should filter events by timeframe', () => {
      const originalDate = Date;
      let currentTime = new Date('2023-01-01T12:00:00Z');
      global.Date = jest.fn(() => currentTime);

      safety.logSecurityEvent('old_event', { data: 'old' });

      // Move time forward by 2 days
      currentTime = new Date('2023-01-03T12:00:00Z');
      global.Date = jest.fn(() => currentTime);

      safety.logSecurityEvent('new_event', { data: 'new' });

      const report = safety.getSecurityReport(24); // Last 24 hours only
      expect(report.eventTypes.old_event).toBeUndefined();
      expect(report.eventTypes.new_event).toBe(1);

      global.Date = originalDate;
    });

    it('should limit security log size', () => {
      // Add more than 1000 events
      for (let i = 0; i < 1200; i++) {
        safety.logSecurityEvent('bulk_event', { index: i });
      }

      expect(safety.securityLog).toHaveLength(1000);
      // Should keep the most recent 1000 events
      expect(safety.securityLog[safety.securityLog.length - 1].details.index).toBe(1199);
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      const invalidTask = null;

      await expect(safety.validateTask(invalidTask))
        .rejects.toThrow();
    });

    it('should handle undefined configurations', () => {
      const safetyWithDefaults = new SafetyManager();
      expect(safetyWithDefaults.config.maxTokensPerTask).toBe(10000);
      expect(safetyWithDefaults.config.blacklistedCommands).toContain('rm -rf');
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle empty blacklist', () => {
      const permissiveSafety = new SafetyManager({ blacklistedCommands: [] });
      expect(() => permissiveSafety.sanitizeCommand('rm -rf /')).not.toThrow();
    });

    it('should handle zero rate limits', () => {
      const strictSafety = new SafetyManager({
        rateLimits: { tasksPerMinute: 0 }
      });

      expect(() => strictSafety.enforceRateLimit('task'))
        .toThrow(RateLimitExceededError);
    });
  });

  describe('Singleton Instance', () => {
    it('should export a singleton safety manager instance', () => {
      expect(safetyManager).toBeInstanceOf(SafetyManager);
      expect(safetyManager.validateTask).toBeDefined();
    });
  });
});