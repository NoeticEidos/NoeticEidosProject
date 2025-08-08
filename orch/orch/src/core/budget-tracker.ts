/**
 * Budget tracking system for workflow execution
 * Tracks and enforces budget constraints in real-time
 */

import { BudgetInfo } from '../types/workflow-types.js';

export interface BudgetCheckResult {
  withinBudget: boolean;
  remainingBudget: BudgetInfo;
  utilizationPercent: BudgetUtilization;
  message: string;
  warnings: string[];
}

export interface BudgetUtilization {
  tokens?: number;
  computeTime?: number;
  memory?: number;
  apiCalls?: number;
  monetaryCost?: number;
  customMetrics?: Record<string, number>;
}

export interface BudgetAlert {
  executionId: string;
  metric: string;
  threshold: number;
  currentValue: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: Date;
  message: string;
}

export class BudgetTracker {
  private executionBudgets: Map<string, BudgetTrackingState> = new Map();
  private alertThresholds: BudgetAlertThresholds = {
    tokens: [0.5, 0.75, 0.9, 0.95],
    computeTime: [0.5, 0.75, 0.9, 0.95],
    memory: [0.5, 0.75, 0.9, 0.95],
    apiCalls: [0.5, 0.75, 0.9, 0.95],
    monetaryCost: [0.5, 0.75, 0.9, 0.95]
  };
  private alertCallback?: (alert: BudgetAlert) => void;

  /**
   * Initialize budget tracking for an execution
   */
  initialize(executionId: string, budgetLimit: BudgetInfo): void {
    const trackingState: BudgetTrackingState = {
      executionId,
      budgetLimit: { ...budgetLimit },
      currentUsage: this.createEmptyBudget(),
      history: [],
      alerts: [],
      startTime: new Date(),
      alertsSent: new Set()
    };

    this.executionBudgets.set(executionId, trackingState);
    this.emitAlert(executionId, 'info', 'Budget tracking initialized', {
      metric: 'initialization',
      threshold: 0,
      currentValue: 0
    });
  }

  /**
   * Add cost to the current budget
   */
  addCost(executionId: string, cost: BudgetInfo): BudgetCheckResult {
    const trackingState = this.executionBudgets.get(executionId);
    if (!trackingState) {
      throw new Error(`Budget tracking not initialized for execution ${executionId}`);
    }

    // Record cost in history
    const timestamp = new Date();
    trackingState.history.push({
      timestamp,
      cost: { ...cost },
      cumulativeCost: { ...trackingState.currentUsage },
      operation: 'add_cost'
    });

    // Update current usage
    this.accumulateCosts(trackingState.currentUsage, cost);

    // Check budget and generate alerts
    const checkResult = this.performBudgetCheck(trackingState);
    
    // Generate alerts if thresholds are crossed
    this.checkAndEmitAlerts(trackingState);

    return checkResult;
  }

  /**
   * Check if current usage is within budget
   */
  checkBudget(executionId: string, proposedCost?: BudgetInfo): BudgetCheckResult {
    const trackingState = this.executionBudgets.get(executionId);
    if (!trackingState) {
      throw new Error(`Budget tracking not initialized for execution ${executionId}`);
    }

    // Create projected usage if proposed cost is provided
    const projectedUsage = proposedCost 
      ? this.addBudgets(trackingState.currentUsage, proposedCost)
      : trackingState.currentUsage;

    return this.performBudgetCheck(trackingState, projectedUsage);
  }

  /**
   * Get current budget status
   */
  getCurrentBudget(executionId: string): BudgetInfo {
    const trackingState = this.executionBudgets.get(executionId);
    if (!trackingState) {
      return this.createEmptyBudget();
    }

    return { ...trackingState.currentUsage };
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(executionId: string): BudgetInfo {
    const trackingState = this.executionBudgets.get(executionId);
    if (!trackingState) {
      return this.createEmptyBudget();
    }

    return this.subtractBudgets(trackingState.budgetLimit, trackingState.currentUsage);
  }

  /**
   * Check if budget is exceeded
   */
  isBudgetExceeded(executionId: string): boolean {
    const checkResult = this.checkBudget(executionId);
    return !checkResult.withinBudget;
  }

  /**
   * Get budget utilization percentages
   */
  getBudgetUtilization(executionId: string): BudgetUtilization {
    const trackingState = this.executionBudgets.get(executionId);
    if (!trackingState) {
      return {};
    }

    const utilization: BudgetUtilization = {};
    const { currentUsage, budgetLimit } = trackingState;

    if (budgetLimit.tokens && budgetLimit.tokens > 0) {
      utilization.tokens = Math.min((currentUsage.tokens || 0) / budgetLimit.tokens, 1);
    }
    if (budgetLimit.computeTime && budgetLimit.computeTime > 0) {
      utilization.computeTime = Math.min((currentUsage.computeTime || 0) / budgetLimit.computeTime, 1);
    }
    if (budgetLimit.memory && budgetLimit.memory > 0) {
      utilization.memory = Math.min((currentUsage.memory || 0) / budgetLimit.memory, 1);
    }
    if (budgetLimit.apiCalls && budgetLimit.apiCalls > 0) {
      utilization.apiCalls = Math.min((currentUsage.apiCalls || 0) / budgetLimit.apiCalls, 1);
    }
    if (budgetLimit.monetaryCost && budgetLimit.monetaryCost > 0) {
      utilization.monetaryCost = Math.min((currentUsage.monetaryCost || 0) / budgetLimit.monetaryCost, 1);
    }

    // Handle custom metrics
    if (budgetLimit.customMetrics && currentUsage.customMetrics) {
      utilization.customMetrics = {};
      for (const [metric, limit] of Object.entries(budgetLimit.customMetrics)) {
        const current = currentUsage.customMetrics[metric] || 0;
        if (limit > 0) {
          utilization.customMetrics[metric] = Math.min(current / limit, 1);
        }
      }
    }

    return utilization;
  }

  /**
   * Get budget history
   */
  getBudgetHistory(executionId: string): BudgetHistoryEntry[] {
    const trackingState = this.executionBudgets.get(executionId);
    return trackingState ? [...trackingState.history] : [];
  }

  /**
   * Get budget alerts
   */
  getAlerts(executionId: string): BudgetAlert[] {
    const trackingState = this.executionBudgets.get(executionId);
    return trackingState ? [...trackingState.alerts] : [];
  }

  /**
   * Set alert callback
   */
  setAlertCallback(callback: (alert: BudgetAlert) => void): void {
    this.alertCallback = callback;
  }

  /**
   * Configure alert thresholds
   */
  setAlertThresholds(thresholds: Partial<BudgetAlertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
  }

  /**
   * Reset budget for execution
   */
  reset(executionId: string): void {
    const trackingState = this.executionBudgets.get(executionId);
    if (trackingState) {
      trackingState.currentUsage = this.createEmptyBudget();
      trackingState.history = [];
      trackingState.alerts = [];
      trackingState.alertsSent.clear();
    }
  }

  /**
   * Cleanup tracking for execution
   */
  cleanup(executionId: string): void {
    this.executionBudgets.delete(executionId);
  }

  /**
   * Get budget summary for reporting
   */
  getBudgetSummary(executionId: string): BudgetSummary {
    const trackingState = this.executionBudgets.get(executionId);
    if (!trackingState) {
      throw new Error(`Budget tracking not found for execution ${executionId}`);
    }

    const utilization = this.getBudgetUtilization(executionId);
    const remaining = this.getRemainingBudget(executionId);
    const checkResult = this.checkBudget(executionId);

    return {
      executionId,
      budgetLimit: { ...trackingState.budgetLimit },
      currentUsage: { ...trackingState.currentUsage },
      remainingBudget: remaining,
      utilization,
      withinBudget: checkResult.withinBudget,
      totalOperations: trackingState.history.length,
      alertCount: trackingState.alerts.length,
      startTime: trackingState.startTime,
      lastUpdate: trackingState.history[trackingState.history.length - 1]?.timestamp || trackingState.startTime
    };
  }

  private performBudgetCheck(
    trackingState: BudgetTrackingState, 
    projectedUsage?: BudgetInfo
  ): BudgetCheckResult {
    const usage = projectedUsage || trackingState.currentUsage;
    const { budgetLimit } = trackingState;
    
    const violations: string[] = [];
    const warnings: string[] = [];
    let withinBudget = true;

    // Check each budget metric
    const metrics = ['tokens', 'computeTime', 'memory', 'apiCalls', 'monetaryCost'] as const;
    
    for (const metric of metrics) {
      const limit = budgetLimit[metric];
      const current = usage[metric];
      
      if (limit !== undefined && current !== undefined && limit > 0) {
        const utilization = current / limit;
        
        if (current > limit) {
          violations.push(`${metric}: ${current} exceeds limit ${limit} (${(utilization * 100).toFixed(1)}%)`);
          withinBudget = false;
        } else if (utilization > 0.9) {
          warnings.push(`${metric}: ${(utilization * 100).toFixed(1)}% utilized`);
        }
      }
    }

    // Check custom metrics
    if (budgetLimit.customMetrics && usage.customMetrics) {
      for (const [metric, limit] of Object.entries(budgetLimit.customMetrics)) {
        const current = usage.customMetrics[metric];
        if (current !== undefined && limit > 0) {
          const utilization = current / limit;
          
          if (current > limit) {
            violations.push(`${metric}: ${current} exceeds limit ${limit} (${(utilization * 100).toFixed(1)}%)`);
            withinBudget = false;
          } else if (utilization > 0.9) {
            warnings.push(`${metric}: ${(utilization * 100).toFixed(1)}% utilized`);
          }
        }
      }
    }

    const remaining = this.subtractBudgets(budgetLimit, usage);
    const utilizationPercent = this.getBudgetUtilization(trackingState.executionId);

    return {
      withinBudget,
      remainingBudget: remaining,
      utilizationPercent,
      message: withinBudget 
        ? violations.length > 0 ? `Budget exceeded: ${violations.join(', ')}` : 'Within budget'
        : `Budget exceeded: ${violations.join(', ')}`,
      warnings
    };
  }

  private checkAndEmitAlerts(trackingState: BudgetTrackingState): void {
    const utilization = this.getBudgetUtilization(trackingState.executionId);
    const severityLevels = ['info', 'warning', 'error', 'critical'] as const;

    // Check each metric against thresholds
    for (const [metric, utilizationValue] of Object.entries(utilization)) {
      if (typeof utilizationValue !== 'number') continue;
      
      const thresholds = this.alertThresholds[metric as keyof BudgetAlertThresholds];
      if (!thresholds) continue;

      for (let i = 0; i < thresholds.length; i++) {
        const threshold = thresholds[i];
        const severity = severityLevels[i];
        const alertKey = `${metric}-${threshold}`;

        if (utilizationValue >= threshold && !trackingState.alertsSent.has(alertKey)) {
          this.emitAlert(trackingState.executionId, severity, 
            `${metric} utilization at ${(utilizationValue * 100).toFixed(1)}%`, {
            metric,
            threshold,
            currentValue: utilizationValue
          });
          trackingState.alertsSent.add(alertKey);
        }
      }
    }
  }

  private emitAlert(
    executionId: string, 
    severity: BudgetAlert['severity'],
    message: string, 
    details: Partial<BudgetAlert>
  ): void {
    const alert: BudgetAlert = {
      executionId,
      metric: details.metric || 'general',
      threshold: details.threshold || 0,
      currentValue: details.currentValue || 0,
      severity,
      timestamp: new Date(),
      message
    };

    const trackingState = this.executionBudgets.get(executionId);
    if (trackingState) {
      trackingState.alerts.push(alert);
    }

    if (this.alertCallback) {
      this.alertCallback(alert);
    }
  }

  private accumulateCosts(target: BudgetInfo, addition: BudgetInfo): void {
    target.tokens = (target.tokens || 0) + (addition.tokens || 0);
    target.computeTime = (target.computeTime || 0) + (addition.computeTime || 0);
    target.memory = (target.memory || 0) + (addition.memory || 0);
    target.apiCalls = (target.apiCalls || 0) + (addition.apiCalls || 0);
    target.monetaryCost = (target.monetaryCost || 0) + (addition.monetaryCost || 0);

    if (addition.customMetrics) {
      target.customMetrics = target.customMetrics || {};
      for (const [metric, value] of Object.entries(addition.customMetrics)) {
        target.customMetrics[metric] = (target.customMetrics[metric] || 0) + value;
      }
    }
  }

  private addBudgets(budget1: BudgetInfo, budget2: BudgetInfo): BudgetInfo {
    const result: BudgetInfo = {
      tokens: (budget1.tokens || 0) + (budget2.tokens || 0),
      computeTime: (budget1.computeTime || 0) + (budget2.computeTime || 0),
      memory: (budget1.memory || 0) + (budget2.memory || 0),
      apiCalls: (budget1.apiCalls || 0) + (budget2.apiCalls || 0),
      monetaryCost: (budget1.monetaryCost || 0) + (budget2.monetaryCost || 0)
    };

    if (budget1.customMetrics || budget2.customMetrics) {
      result.customMetrics = {};
      const allMetrics = new Set([
        ...Object.keys(budget1.customMetrics || {}),
        ...Object.keys(budget2.customMetrics || {})
      ]);
      
      for (const metric of allMetrics) {
        result.customMetrics[metric] = 
          (budget1.customMetrics?.[metric] || 0) + 
          (budget2.customMetrics?.[metric] || 0);
      }
    }

    return result;
  }

  private subtractBudgets(budget1: BudgetInfo, budget2: BudgetInfo): BudgetInfo {
    const result: BudgetInfo = {
      tokens: Math.max((budget1.tokens || 0) - (budget2.tokens || 0), 0),
      computeTime: Math.max((budget1.computeTime || 0) - (budget2.computeTime || 0), 0),
      memory: Math.max((budget1.memory || 0) - (budget2.memory || 0), 0),
      apiCalls: Math.max((budget1.apiCalls || 0) - (budget2.apiCalls || 0), 0),
      monetaryCost: Math.max((budget1.monetaryCost || 0) - (budget2.monetaryCost || 0), 0)
    };

    if (budget1.customMetrics || budget2.customMetrics) {
      result.customMetrics = {};
      const allMetrics = new Set([
        ...Object.keys(budget1.customMetrics || {}),
        ...Object.keys(budget2.customMetrics || {})
      ]);
      
      for (const metric of allMetrics) {
        result.customMetrics[metric] = Math.max(
          (budget1.customMetrics?.[metric] || 0) - 
          (budget2.customMetrics?.[metric] || 0), 
          0
        );
      }
    }

    return result;
  }

  private createEmptyBudget(): BudgetInfo {
    return {
      tokens: 0,
      computeTime: 0,
      memory: 0,
      apiCalls: 0,
      monetaryCost: 0,
      customMetrics: {}
    };
  }
}

// Supporting interfaces
interface BudgetTrackingState {
  executionId: string;
  budgetLimit: BudgetInfo;
  currentUsage: BudgetInfo;
  history: BudgetHistoryEntry[];
  alerts: BudgetAlert[];
  startTime: Date;
  alertsSent: Set<string>;
}

interface BudgetHistoryEntry {
  timestamp: Date;
  cost: BudgetInfo;
  cumulativeCost: BudgetInfo;
  operation: 'add_cost' | 'reset' | 'adjustment';
}

interface BudgetAlertThresholds {
  tokens?: number[];
  computeTime?: number[];
  memory?: number[];
  apiCalls?: number[];
  monetaryCost?: number[];
  [key: string]: number[] | undefined;
}

export interface BudgetSummary {
  executionId: string;
  budgetLimit: BudgetInfo;
  currentUsage: BudgetInfo;
  remainingBudget: BudgetInfo;
  utilization: BudgetUtilization;
  withinBudget: boolean;
  totalOperations: number;
  alertCount: number;
  startTime: Date;
  lastUpdate: Date;
}