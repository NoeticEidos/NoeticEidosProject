// Safety Manager for orchestration system
import { createHash } from 'crypto';
import { validator } from '../schemas/index.js';

export class SafetyManager {
  constructor(config = {}) {
    this.config = {
      maxTokensPerTask: config.maxTokensPerTask || 10000,
      maxExecutionTime: config.maxExecutionTime || 300000, // 5 minutes
      maxConcurrentTasks: config.maxConcurrentTasks || 10,
      maxAgentsPerSwarm: config.maxAgentsPerSwarm || 20,
      blacklistedCommands: config.blacklistedCommands || [
        'rm -rf', 'sudo', 'chmod 777', 'wget', 'curl',
        'eval', 'exec', 'system', 'shell_exec'
      ],
      allowedDomains: config.allowedDomains || [],
      rateLimits: config.rateLimits || {
        tasksPerMinute: 60,
        agentSpawnsPerMinute: 10,
        memoryOperationsPerMinute: 100
      },
      budgetLimits: config.budgetLimits || {
        dailyTokens: 1000000,
        hourlyTokens: 100000,
        perTaskTokens: 10000
      },
      ...config
    };
    
    this.rateLimitCounters = new Map();
    this.budgetCounters = {
      daily: { tokens: 0, resetTime: this.getNextResetTime('day') },
      hourly: { tokens: 0, resetTime: this.getNextResetTime('hour') },
      task: new Map()
    };
    
    this.activeTasks = new Set();
    this.securityLog = [];
  }

  /**
   * Validate and sanitize task input
   */
  async validateTask(task) {
    try {
      // Schema validation
      const validatedTask = validator.validate(task, 'task');
      
      // Security checks
      this.checkTaskSecurity(validatedTask);
      
      // Budget enforcement
      this.enforceBudget(validatedTask);
      
      // Rate limiting
      this.enforceRateLimit('task');
      
      return validatedTask;
    } catch (error) {
      this.logSecurityEvent('task_validation_failed', { task, error: error.message });
      throw error;
    }
  }

  /**
   * Validate agent spawn request
   */
  async validateAgentSpawn(agentConfig) {
    try {
      // Schema validation
      const validatedAgent = validator.validate(agentConfig, 'agent');
      
      // Check agent limits
      this.enforceAgentLimits();
      
      // Rate limiting
      this.enforceRateLimit('agentSpawn');
      
      return validatedAgent;
    } catch (error) {
      this.logSecurityEvent('agent_spawn_validation_failed', { agentConfig, error: error.message });
      throw error;
    }
  }

  /**
   * Validate workflow execution
   */
  async validateWorkflow(workflow) {
    try {
      // Schema validation
      const validatedWorkflow = validator.validate(workflow, 'workflow');
      
      // Check workflow complexity
      this.checkWorkflowComplexity(validatedWorkflow);
      
      // Validate dependencies
      this.validateDependencies(validatedWorkflow.steps);
      
      return validatedWorkflow;
    } catch (error) {
      this.logSecurityEvent('workflow_validation_failed', { workflow, error: error.message });
      throw error;
    }
  }

  /**
   * Sanitize command input
   */
  sanitizeCommand(command) {
    if (typeof command !== 'string') {
      throw new SecurityError('Command must be a string');
    }

    // Check for blacklisted commands
    const lowercaseCommand = command.toLowerCase();
    for (const blacklisted of this.config.blacklistedCommands) {
      if (lowercaseCommand.includes(blacklisted.toLowerCase())) {
        throw new SecurityError(`Blacklisted command detected: ${blacklisted}`);
      }
    }

    // Remove potentially dangerous characters
    const sanitized = command
      .replace(/[;&|`$(){}[\]]/g, '') // Remove shell metacharacters
      .replace(/\.\./g, '') // Remove directory traversal
      .trim();

    if (sanitized.length === 0) {
      throw new SecurityError('Command cannot be empty after sanitization');
    }

    return sanitized;
  }

  /**
   * Validate memory operation
   */
  validateMemoryOperation(operation) {
    try {
      // Rate limiting
      this.enforceRateLimit('memoryOperation');
      
      // Validate memory entry if storing
      if (operation.action === 'store' && operation.data) {
        validator.validate(operation.data, 'memoryEntry');
      }

      // Check for sensitive data
      this.checkForSensitiveData(operation);

      return operation;
    } catch (error) {
      this.logSecurityEvent('memory_operation_failed', { operation, error: error.message });
      throw error;
    }
  }

  /**
   * Check task security
   */
  checkTaskSecurity(task) {
    // Check for injection attempts in description
    if (this.containsSuspiciousContent(task.description)) {
      throw new SecurityError('Task description contains suspicious content');
    }

    // Validate budget constraints
    if (task.budget?.maxTokens > this.config.maxTokensPerTask) {
      throw new SecurityError(`Task token budget exceeds maximum allowed (${this.config.maxTokensPerTask})`);
    }

    // Check execution time limits
    if (task.budget?.maxTime > this.config.maxExecutionTime) {
      throw new SecurityError(`Task execution time exceeds maximum allowed (${this.config.maxExecutionTime}ms)`);
    }
  }

  /**
   * Enforce budget constraints
   */
  enforceBudget(task) {
    const tokenBudget = task.budget?.maxTokens || 0;

    // Reset counters if needed
    this.resetBudgetCounters();

    // Check daily limit
    if (this.budgetCounters.daily.tokens + tokenBudget > this.config.budgetLimits.dailyTokens) {
      throw new BudgetExceededError('Daily token budget exceeded');
    }

    // Check hourly limit
    if (this.budgetCounters.hourly.tokens + tokenBudget > this.config.budgetLimits.hourlyTokens) {
      throw new BudgetExceededError('Hourly token budget exceeded');
    }

    // Reserve tokens
    this.budgetCounters.daily.tokens += tokenBudget;
    this.budgetCounters.hourly.tokens += tokenBudget;
    this.budgetCounters.task.set(task.id, tokenBudget);
  }

  /**
   * Enforce rate limits
   */
  enforceRateLimit(operation) {
    const now = Date.now();
    const windowSize = 60000; // 1 minute
    const limit = this.config.rateLimits[`${operation}sPerMinute`] || 60;

    if (!this.rateLimitCounters.has(operation)) {
      this.rateLimitCounters.set(operation, []);
    }

    const counter = this.rateLimitCounters.get(operation);
    
    // Remove old entries
    while (counter.length > 0 && counter[0] < now - windowSize) {
      counter.shift();
    }

    // Check limit
    if (counter.length >= limit) {
      throw new RateLimitExceededError(`Rate limit exceeded for ${operation}: ${limit}/minute`);
    }

    // Add current request
    counter.push(now);
  }

  /**
   * Enforce agent limits
   */
  enforceAgentLimits() {
    // This would check current agent count from the system
    // For now, we'll simulate it
    const currentAgentCount = this.activeTasks.size; // Simplified
    
    if (currentAgentCount >= this.config.maxAgentsPerSwarm) {
      throw new SecurityError(`Maximum number of agents reached (${this.config.maxAgentsPerSwarm})`);
    }
  }

  /**
   * Check workflow complexity
   */
  checkWorkflowComplexity(workflow) {
    const maxSteps = 50;
    const maxDepth = 10;

    if (workflow.steps.length > maxSteps) {
      throw new SecurityError(`Workflow exceeds maximum steps (${maxSteps})`);
    }

    // Check for circular dependencies
    const visited = new Set();
    const recursionStack = new Set();

    const hasCircularDependency = (stepId) => {
      if (recursionStack.has(stepId)) {
        return true;
      }
      if (visited.has(stepId)) {
        return false;
      }

      visited.add(stepId);
      recursionStack.add(stepId);

      const step = workflow.steps.find(s => s.id === stepId);
      if (step) {
        for (const dep of step.dependencies || []) {
          if (hasCircularDependency(dep)) {
            return true;
          }
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of workflow.steps) {
      if (hasCircularDependency(step.id)) {
        throw new SecurityError('Circular dependency detected in workflow');
      }
    }
  }

  /**
   * Validate step dependencies
   */
  validateDependencies(steps) {
    const stepIds = new Set(steps.map(s => s.id));

    for (const step of steps) {
      for (const depId of step.dependencies || []) {
        if (!stepIds.has(depId)) {
          throw new ValidationError(`Invalid dependency: ${depId} not found in workflow steps`);
        }
      }
    }
  }

  /**
   * Check for sensitive data
   */
  checkForSensitiveData(operation) {
    const sensitivePatterns = [
      /password/i,
      /api[_-]?key/i,
      /secret/i,
      /token/i,
      /auth/i,
      /credential/i,
      /private[_-]?key/i,
      /ssh[_-]?key/i
    ];

    const dataString = JSON.stringify(operation);
    for (const pattern of sensitivePatterns) {
      if (pattern.test(dataString)) {
        this.logSecurityEvent('sensitive_data_detected', { 
          operation: operation.action,
          pattern: pattern.toString()
        });
        // Don't throw, just log - might be legitimate
        break;
      }
    }
  }

  /**
   * Check for suspicious content
   */
  containsSuspiciousContent(text) {
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i,
      /eval\s*\(/i,
      /function\s*\(/i,
      /\$\{.*\}/,
      /\#\{.*\}/
    ];

    return suspiciousPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Reset budget counters if needed
   */
  resetBudgetCounters() {
    const now = Date.now();

    if (now >= this.budgetCounters.daily.resetTime) {
      this.budgetCounters.daily.tokens = 0;
      this.budgetCounters.daily.resetTime = this.getNextResetTime('day');
    }

    if (now >= this.budgetCounters.hourly.resetTime) {
      this.budgetCounters.hourly.tokens = 0;
      this.budgetCounters.hourly.resetTime = this.getNextResetTime('hour');
    }
  }

  /**
   * Get next reset time
   */
  getNextResetTime(period) {
    const now = new Date();
    if (period === 'day') {
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow.getTime();
    } else if (period === 'hour') {
      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1);
      nextHour.setMinutes(0, 0, 0);
      return nextHour.getTime();
    }
  }

  /**
   * Log security event
   */
  logSecurityEvent(type, details) {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      details,
      hash: createHash('sha256').update(JSON.stringify(details)).digest('hex').slice(0, 16)
    };

    this.securityLog.push(event);
    
    // Keep only recent events (last 1000)
    if (this.securityLog.length > 1000) {
      this.securityLog = this.securityLog.slice(-1000);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[SECURITY] ${type}:`, details);
    }
  }

  /**
   * Get security report
   */
  getSecurityReport(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recentEvents = this.securityLog.filter(
      event => new Date(event.timestamp) >= since
    );

    const eventCounts = recentEvents.reduce((counts, event) => {
      counts[event.type] = (counts[event.type] || 0) + 1;
      return counts;
    }, {});

    return {
      timeframe: `${hours} hours`,
      totalEvents: recentEvents.length,
      eventTypes: eventCounts,
      recentEvents: recentEvents.slice(-10), // Last 10 events
      budgetStatus: {
        daily: this.budgetCounters.daily,
        hourly: this.budgetCounters.hourly
      },
      activeTasks: this.activeTasks.size
    };
  }
}

// Custom error classes
export class SecurityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecurityError';
  }
}

export class BudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class RateLimitExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitExceededError';
  }
}

// Export singleton instance
export const safetyManager = new SafetyManager();