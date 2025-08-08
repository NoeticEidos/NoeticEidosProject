/**
 * BudgetEnforcer - Token, cost, and latency budget management
 * Enforces resource limits and tracks usage over time
 */

export interface BudgetLimits {
  maxTokens?: number;          // Maximum tokens per period
  maxCost?: number;           // Maximum cost in USD per period  
  maxLatency?: number;        // Maximum latency in ms per operation
  periodMs?: number;          // Time period for budget reset (default: 1 hour)
  burstAllowance?: number;    // Percentage burst allowance (default: 20%)
}

export interface ResourceUsage {
  tokenCount: number;
  cost: number;
  latency: number;
  timestamp: number;
}

export interface BudgetStatus {
  current: {
    tokens: number;
    cost: number;
    averageLatency: number;
  };
  limits: BudgetLimits;
  utilization: {
    tokens: number;    // Percentage of token budget used
    cost: number;      // Percentage of cost budget used  
    latency: number;   // Percentage of latency budget used
  };
  remaining: {
    tokens: number;
    cost: number;
    timeUntilReset: number; // ms until budget resets
  };
  isNearLimit: boolean;      // True if any resource > 80% utilized
  nextResetTime: number;     // Timestamp of next budget reset
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  suggestedDelay?: number;   // Suggested delay in ms before retry
  alternativeAction?: string;
}

export class BudgetEnforcer {
  private limits: Required<BudgetLimits>;
  private usage: ResourceUsage[] = [];
  private currentPeriodStart: number;
  private readonly defaultLimits: Required<BudgetLimits> = {
    maxTokens: 1000000,        // 1M tokens per hour
    maxCost: 100,              // $100 per hour
    maxLatency: 30000,         // 30 second max latency
    periodMs: 3600000,         // 1 hour
    burstAllowance: 20         // 20% burst allowance
  };

  constructor(limits: BudgetLimits = {}) {
    this.limits = { ...this.defaultLimits, ...limits };
    this.currentPeriodStart = Date.now();
    this.schedulePeriodicReset();
  }

  /**
   * Check if a resource usage request is within budget
   */
  public checkBudget(requestedUsage: ResourceUsage): BudgetCheckResult {
    this.cleanOldUsage();
    
    const currentUsage = this.getCurrentUsage();
    const projectedUsage = {
      tokens: currentUsage.tokens + requestedUsage.tokenCount,
      cost: currentUsage.cost + requestedUsage.cost,
      latency: requestedUsage.latency
    };

    // Check token limit
    const tokenLimit = this.limits.maxTokens * (1 + this.limits.burstAllowance / 100);
    if (projectedUsage.tokens > tokenLimit) {
      return {
        allowed: false,
        reason: `Token limit exceeded: ${projectedUsage.tokens} > ${tokenLimit}`,
        suggestedDelay: this.getTimeUntilReset(),
        alternativeAction: 'Consider reducing request size or waiting for budget reset'
      };
    }

    // Check cost limit
    const costLimit = this.limits.maxCost * (1 + this.limits.burstAllowance / 100);
    if (projectedUsage.cost > costLimit) {
      return {
        allowed: false,
        reason: `Cost limit exceeded: $${projectedUsage.cost.toFixed(4)} > $${costLimit.toFixed(4)}`,
        suggestedDelay: this.getTimeUntilReset(),
        alternativeAction: 'Consider using more cost-effective operations or waiting for budget reset'
      };
    }

    // Check latency limit
    if (projectedUsage.latency > this.limits.maxLatency) {
      return {
        allowed: false,
        reason: `Latency limit exceeded: ${projectedUsage.latency}ms > ${this.limits.maxLatency}ms`,
        alternativeAction: 'Consider optimizing operation or using async processing'
      };
    }

    // Check rate limiting - prevent too many requests in short time
    const recentRequests = this.usage.filter(u => 
      Date.now() - u.timestamp < 60000 // Last minute
    ).length;
    
    if (recentRequests > 100) { // Max 100 requests per minute
      return {
        allowed: false,
        reason: 'Rate limit exceeded: too many requests per minute',
        suggestedDelay: 60000 - (Date.now() - Math.min(...this.usage.map(u => u.timestamp))),
        alternativeAction: 'Implement request batching or reduce request frequency'
      };
    }

    return { allowed: true };
  }

  /**
   * Record actual resource usage
   */
  public recordUsage(usage: ResourceUsage): void {
    this.usage.push({
      ...usage,
      timestamp: usage.timestamp || Date.now()
    });

    // Keep only usage from current period plus some buffer
    this.cleanOldUsage();
    
    // Trigger warnings if approaching limits
    this.checkWarningThresholds();
  }

  /**
   * Get current budget status
   */
  public getStatus(): BudgetStatus {
    this.cleanOldUsage();
    const current = this.getCurrentUsage();
    
    const utilization = {
      tokens: (current.tokens / this.limits.maxTokens) * 100,
      cost: (current.cost / this.limits.maxCost) * 100,
      latency: Math.max(...this.usage.map(u => u.latency), 0) / this.limits.maxLatency * 100
    };

    const remaining = {
      tokens: Math.max(0, this.limits.maxTokens - current.tokens),
      cost: Math.max(0, this.limits.maxCost - current.cost),
      timeUntilReset: this.getTimeUntilReset()
    };

    const isNearLimit = Object.values(utilization).some(util => util > 80);

    return {
      current: {
        tokens: current.tokens,
        cost: current.cost,
        averageLatency: current.averageLatency
      },
      limits: this.limits,
      utilization,
      remaining,
      isNearLimit,
      nextResetTime: this.currentPeriodStart + this.limits.periodMs
    };
  }

  /**
   * Reset budget counters (called automatically each period)
   */
  public reset(): void {
    this.usage = [];
    this.currentPeriodStart = Date.now();
  }

  /**
   * Update budget limits
   */
  public updateLimits(newLimits: BudgetLimits): void {
    this.limits = { ...this.limits, ...newLimits };
  }

  /**
   * Get usage history for analysis
   */
  public getUsageHistory(periodCount: number = 1): ResourceUsage[] {
    const cutoffTime = Date.now() - (this.limits.periodMs * periodCount);
    return this.usage.filter(usage => usage.timestamp >= cutoffTime);
  }

  /**
   * Predict future usage based on current trends
   */
  public predictUsage(lookAheadMs: number): {
    estimatedTokens: number;
    estimatedCost: number;
    confidence: number;
  } {
    const recentUsage = this.usage.filter(u => 
      Date.now() - u.timestamp < 600000 // Last 10 minutes
    );

    if (recentUsage.length < 2) {
      return { estimatedTokens: 0, estimatedCost: 0, confidence: 0 };
    }

    // Calculate usage rate
    const timeSpan = Math.max(...recentUsage.map(u => u.timestamp)) - 
                    Math.min(...recentUsage.map(u => u.timestamp));
    const tokenRate = recentUsage.reduce((sum, u) => sum + u.tokenCount, 0) / timeSpan;
    const costRate = recentUsage.reduce((sum, u) => sum + u.cost, 0) / timeSpan;

    const estimatedTokens = tokenRate * lookAheadMs;
    const estimatedCost = costRate * lookAheadMs;
    const confidence = Math.min(recentUsage.length / 10, 1); // More data = higher confidence

    return { estimatedTokens, estimatedCost, confidence };
  }

  /**
   * Get cost breakdown by operation type
   */
  public getCostBreakdown(): Record<string, { count: number; totalCost: number; avgCost: number }> {
    // This would require extending ResourceUsage to include operation type
    // For now, return aggregate data
    return {
      total: {
        count: this.usage.length,
        totalCost: this.usage.reduce((sum, u) => sum + u.cost, 0),
        avgCost: this.usage.reduce((sum, u) => sum + u.cost, 0) / this.usage.length || 0
      }
    };
  }

  /**
   * Set custom budget alerts
   */
  public setAlert(type: 'tokens' | 'cost' | 'latency', threshold: number, callback: () => void): void {
    // Implementation would involve setting up threshold monitoring
    // For now, store alert configuration
    const alertConfig = { type, threshold, callback };
    // Store in alerts array for periodic checking
  }

  private getCurrentUsage() {
    const periodUsage = this.usage.filter(u => 
      u.timestamp >= this.currentPeriodStart
    );

    return {
      tokens: periodUsage.reduce((sum, u) => sum + u.tokenCount, 0),
      cost: periodUsage.reduce((sum, u) => sum + u.cost, 0),
      averageLatency: periodUsage.length > 0 
        ? periodUsage.reduce((sum, u) => sum + u.latency, 0) / periodUsage.length
        : 0
    };
  }

  private cleanOldUsage(): void {
    const cutoffTime = this.currentPeriodStart;
    this.usage = this.usage.filter(usage => usage.timestamp >= cutoffTime);
  }

  private getTimeUntilReset(): number {
    return Math.max(0, (this.currentPeriodStart + this.limits.periodMs) - Date.now());
  }

  private checkWarningThresholds(): void {
    const status = this.getStatus();
    
    // Warn at 80% utilization
    if (status.utilization.tokens > 80) {
      console.warn(`Token usage warning: ${status.utilization.tokens.toFixed(1)}% of budget used`);
    }
    
    if (status.utilization.cost > 80) {
      console.warn(`Cost usage warning: ${status.utilization.cost.toFixed(1)}% of budget used`);
    }
  }

  private schedulePeriodicReset(): void {
    const resetInterval = setInterval(() => {
      if (Date.now() >= this.currentPeriodStart + this.limits.periodMs) {
        this.reset();
      }
    }, Math.min(this.limits.periodMs / 10, 60000)); // Check every 10th of period or 1 minute max

    // Clean up interval if needed (in real implementation, store reference)
  }
}