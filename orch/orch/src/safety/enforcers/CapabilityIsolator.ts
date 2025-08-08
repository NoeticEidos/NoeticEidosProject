/**
 * CapabilityIsolator - Manages capability restrictions and isolation
 * Ensures steps only use allowed capabilities and enforces security boundaries
 */

export interface CapabilityConfig {
  allowed: string[];           // Explicitly allowed capabilities
  restricted: string[];        // Explicitly restricted capabilities
  requireApproval: string[];   // Capabilities requiring approval
  contextualRules?: CapabilityRule[];  // Context-specific rules
}

export interface CapabilityRule {
  id: string;
  name: string;
  condition: {
    userRole?: string[];
    timeRange?: { start: string; end: string };
    context?: string[];
    maxUsage?: number;      // Max uses per period
    period?: number;        // Period in ms
  };
  action: 'allow' | 'deny' | 'require_approval';
  capabilities: string[];
  priority: number;         // Higher priority rules override lower ones
}

export interface CapabilityValidationResult {
  allowed: boolean;
  restrictedCapabilities?: string[];
  requiresApproval?: boolean;
  approvalCapabilities?: string[];
  appliedRules?: string[];
  reason?: string;
}

export interface CapabilityUsage {
  capability: string;
  count: number;
  lastUsed: number;
  userId?: string;
  context?: string;
}

export interface CapabilityStats {
  totalCapabilities: number;
  allowedCapabilities: number;
  restrictedCapabilities: number;
  approvalRequiredCapabilities: number;
  usageStats: Record<string, { count: number; lastUsed: number }>;
  ruleApplications: Record<string, number>;
  violations: number;
}

export class CapabilityViolationError extends Error {
  constructor(
    message: string,
    public capabilities: string[],
    public violationType: 'restricted' | 'not_allowed' | 'approval_required'
  ) {
    super(message);
    this.name = 'CapabilityViolationError';
  }
}

export class CapabilityIsolator {
  private config: CapabilityConfig;
  private usage: Map<string, CapabilityUsage> = new Map();
  private stats: CapabilityStats;
  
  // Built-in dangerous capabilities
  private readonly DANGEROUS_CAPABILITIES = [
    'file:write:system',
    'file:delete:system', 
    'network:admin',
    'process:execute:system',
    'registry:write',
    'kernel:access',
    'credential:read',
    'encryption:decrypt:sensitive'
  ];

  // Built-in safe capabilities
  private readonly SAFE_CAPABILITIES = [
    'file:read:user',
    'file:write:user',
    'network:http:get',
    'network:http:post',
    'process:execute:user',
    'data:transform',
    'analysis:read'
  ];

  constructor(config: CapabilityConfig) {
    this.config = {
      allowed: [...this.SAFE_CAPABILITIES, ...config.allowed],
      restricted: [...this.DANGEROUS_CAPABILITIES, ...config.restricted],
      requireApproval: config.requireApproval || [],
      contextualRules: config.contextualRules || []
    };

    this.stats = this.initializeStats();
  }

  /**
   * Validate if capabilities are allowed for execution
   */
  public validateCapabilities(
    capabilities: string[],
    context?: {
      userId?: string;
      userRole?: string;
      sessionContext?: string;
      timestamp?: number;
    }
  ): CapabilityValidationResult {
    const timestamp = context?.timestamp || Date.now();
    const appliedRules: string[] = [];
    const restrictedCapabilities: string[] = [];
    const approvalCapabilities: string[] = [];

    // Check each capability
    for (const capability of capabilities) {
      const result = this.validateSingleCapability(capability, context, timestamp);
      
      if (result.appliedRules) {
        appliedRules.push(...result.appliedRules);
      }

      if (!result.allowed) {
        restrictedCapabilities.push(capability);
      } else if (result.requiresApproval) {
        approvalCapabilities.push(capability);
      }

      // Record usage
      this.recordUsage(capability, context);
    }

    // Apply contextual rules
    const contextualResult = this.applyContextualRules(capabilities, context, timestamp);
    if (contextualResult.appliedRules) {
      appliedRules.push(...contextualResult.appliedRules);
    }

    const hasRestricted = restrictedCapabilities.length > 0;
    const hasApproval = approvalCapabilities.length > 0;

    return {
      allowed: !hasRestricted,
      restrictedCapabilities: hasRestricted ? restrictedCapabilities : undefined,
      requiresApproval: hasApproval,
      approvalCapabilities: hasApproval ? approvalCapabilities : undefined,
      appliedRules: appliedRules.length > 0 ? appliedRules : undefined,
      reason: hasRestricted 
        ? `Restricted capabilities: ${restrictedCapabilities.join(', ')}`
        : undefined
    };
  }

  /**
   * Check if capability requires approval
   */
  public requiresApproval(capability: string): boolean {
    return this.config.requireApproval.includes(capability) ||
           this.config.requireApproval.some(pattern => this.matchesPattern(capability, pattern));
  }

  /**
   * Grant temporary capability access
   */
  public grantTemporaryAccess(
    capabilities: string[],
    durationMs: number,
    context?: { userId?: string; reason?: string }
  ): string {
    const grantId = this.generateGrantId();
    const expiry = Date.now() + durationMs;

    // Add to temporarily allowed capabilities
    const tempAllowed = capabilities.filter(cap => 
      !this.config.allowed.includes(cap)
    );

    this.config.allowed.push(...tempAllowed);

    // Schedule cleanup
    setTimeout(() => {
      this.revokeTemporaryAccess(grantId, tempAllowed);
    }, durationMs);

    return grantId;
  }

  /**
   * Revoke temporary capability access
   */
  public revokeTemporaryAccess(grantId: string, capabilities: string[]): void {
    // Remove from allowed capabilities
    this.config.allowed = this.config.allowed.filter(cap => 
      !capabilities.includes(cap)
    );
  }

  /**
   * Add capability to restriction list
   */
  public restrictCapability(capability: string, reason?: string): void {
    if (!this.config.restricted.includes(capability)) {
      this.config.restricted.push(capability);
      
      // Remove from allowed if present
      this.config.allowed = this.config.allowed.filter(cap => cap !== capability);
      
      this.stats.restrictedCapabilities++;
    }
  }

  /**
   * Remove capability from restriction list
   */
  public allowCapability(capability: string): void {
    this.config.restricted = this.config.restricted.filter(cap => cap !== capability);
    
    if (!this.config.allowed.includes(capability)) {
      this.config.allowed.push(capability);
      this.stats.allowedCapabilities++;
    }
  }

  /**
   * Add contextual rule for capability management
   */
  public addRule(rule: CapabilityRule): void {
    const existingIndex = this.config.contextualRules?.findIndex(r => r.id === rule.id);
    
    if (existingIndex !== undefined && existingIndex >= 0) {
      this.config.contextualRules![existingIndex] = rule;
    } else {
      this.config.contextualRules = this.config.contextualRules || [];
      this.config.contextualRules.push(rule);
    }

    // Sort by priority
    this.config.contextualRules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove contextual rule
   */
  public removeRule(ruleId: string): boolean {
    if (!this.config.contextualRules) return false;
    
    const initialLength = this.config.contextualRules.length;
    this.config.contextualRules = this.config.contextualRules.filter(rule => rule.id !== ruleId);
    
    return this.config.contextualRules.length < initialLength;
  }

  /**
   * Get capability usage statistics
   */
  public getStats(): CapabilityStats {
    this.stats.totalCapabilities = new Set([
      ...this.config.allowed,
      ...this.config.restricted,
      ...this.config.requireApproval
    ]).size;

    this.stats.allowedCapabilities = this.config.allowed.length;
    this.stats.restrictedCapabilities = this.config.restricted.length;
    this.stats.approvalRequiredCapabilities = this.config.requireApproval.length;

    // Update usage stats
    for (const [capability, usage] of this.usage.entries()) {
      this.stats.usageStats[capability] = {
        count: usage.count,
        lastUsed: usage.lastUsed
      };
    }

    return { ...this.stats };
  }

  /**
   * Update capability configuration
   */
  public updateConfig(newConfig: Partial<CapabilityConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.contextualRules) {
      this.config.contextualRules = newConfig.contextualRules.sort(
        (a, b) => b.priority - a.priority
      );
    }
  }

  /**
   * Check capability usage patterns for anomalies
   */
  public detectAnomalies(): Array<{ capability: string; anomaly: string; severity: 'low' | 'medium' | 'high' }> {
    const anomalies: Array<{ capability: string; anomaly: string; severity: 'low' | 'medium' | 'high' }> = [];
    const now = Date.now();

    for (const [capability, usage] of this.usage.entries()) {
      // Check for excessive usage
      const timeSinceLastUse = now - usage.lastUsed;
      const hoursSinceLastUse = timeSinceLastUse / (1000 * 60 * 60);

      if (usage.count > 100 && hoursSinceLastUse < 1) {
        anomalies.push({
          capability,
          anomaly: `Excessive usage: ${usage.count} times in last hour`,
          severity: 'high'
        });
      }

      // Check for usage of dangerous capabilities
      if (this.DANGEROUS_CAPABILITIES.some(dangerous => 
        this.matchesPattern(capability, dangerous)
      )) {
        anomalies.push({
          capability,
          anomaly: 'Usage of dangerous capability detected',
          severity: 'high'
        });
      }

      // Check for unusual time patterns
      const isOffHours = this.isOffHours(usage.lastUsed);
      if (isOffHours && this.config.restricted.includes(capability)) {
        anomalies.push({
          capability,
          anomaly: 'Restricted capability used during off hours',
          severity: 'medium'
        });
      }
    }

    return anomalies;
  }

  /**
   * Generate security report
   */
  public generateSecurityReport(): {
    summary: any;
    violations: any[];
    recommendations: string[];
    riskScore: number;
  } {
    const stats = this.getStats();
    const anomalies = this.detectAnomalies();
    
    const violations = anomalies.filter(a => a.severity === 'high');
    const riskScore = this.calculateRiskScore(stats, violations);
    
    const recommendations = this.generateRecommendations(stats, anomalies);

    return {
      summary: {
        totalCapabilities: stats.totalCapabilities,
        restrictedCapabilities: stats.restrictedCapabilities,
        violations: stats.violations,
        riskScore
      },
      violations: violations.map(v => ({
        capability: v.capability,
        issue: v.anomaly,
        severity: v.severity,
        timestamp: Date.now()
      })),
      recommendations,
      riskScore
    };
  }

  private validateSingleCapability(
    capability: string,
    context?: any,
    timestamp?: number
  ): { allowed: boolean; requiresApproval: boolean; appliedRules?: string[] } {
    // Check explicit restrictions first
    if (this.isRestricted(capability)) {
      this.stats.violations++;
      return { allowed: false, requiresApproval: false };
    }

    // Check approval requirements
    const needsApproval = this.requiresApproval(capability);

    // Check explicit allowlist
    const explicitlyAllowed = this.isExplicitlyAllowed(capability);

    return {
      allowed: explicitlyAllowed || !needsApproval,
      requiresApproval: needsApproval
    };
  }

  private applyContextualRules(
    capabilities: string[],
    context?: any,
    timestamp?: number
  ): { appliedRules?: string[] } {
    const appliedRules: string[] = [];

    if (!this.config.contextualRules) {
      return {};
    }

    for (const rule of this.config.contextualRules) {
      if (this.ruleApplies(rule, capabilities, context, timestamp)) {
        appliedRules.push(rule.id);
        this.stats.ruleApplications[rule.id] = (this.stats.ruleApplications[rule.id] || 0) + 1;
      }
    }

    return { appliedRules: appliedRules.length > 0 ? appliedRules : undefined };
  }

  private ruleApplies(
    rule: CapabilityRule,
    capabilities: string[],
    context?: any,
    timestamp?: number
  ): boolean {
    // Check if rule applies to any of the requested capabilities
    const hasMatchingCapability = capabilities.some(cap =>
      rule.capabilities.some(ruleCap => this.matchesPattern(cap, ruleCap))
    );

    if (!hasMatchingCapability) return false;

    // Check contextual conditions
    if (rule.condition.userRole && context?.userRole) {
      if (!rule.condition.userRole.includes(context.userRole)) {
        return false;
      }
    }

    if (rule.condition.timeRange && timestamp) {
      const now = new Date(timestamp);
      const startTime = new Date(rule.condition.timeRange.start);
      const endTime = new Date(rule.condition.timeRange.end);
      
      if (now < startTime || now > endTime) {
        return false;
      }
    }

    if (rule.condition.context && context?.sessionContext) {
      if (!rule.condition.context.includes(context.sessionContext)) {
        return false;
      }
    }

    return true;
  }

  private isRestricted(capability: string): boolean {
    return this.config.restricted.some(restricted => 
      this.matchesPattern(capability, restricted)
    );
  }

  private isExplicitlyAllowed(capability: string): boolean {
    return this.config.allowed.some(allowed => 
      this.matchesPattern(capability, allowed)
    );
  }

  private matchesPattern(capability: string, pattern: string): boolean {
    // Support wildcard patterns
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(capability);
    }
    
    return capability === pattern;
  }

  private recordUsage(capability: string, context?: any): void {
    const existing = this.usage.get(capability);
    
    if (existing) {
      existing.count++;
      existing.lastUsed = Date.now();
    } else {
      this.usage.set(capability, {
        capability,
        count: 1,
        lastUsed: Date.now(),
        userId: context?.userId,
        context: context?.sessionContext
      });
    }
  }

  private generateGrantId(): string {
    return `grant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeStats(): CapabilityStats {
    return {
      totalCapabilities: 0,
      allowedCapabilities: 0,
      restrictedCapabilities: 0,
      approvalRequiredCapabilities: 0,
      usageStats: {},
      ruleApplications: {},
      violations: 0
    };
  }

  private isOffHours(timestamp: number): boolean {
    const date = new Date(timestamp);
    const hour = date.getHours();
    const day = date.getDay();
    
    // Consider off hours as 10 PM - 6 AM on weekdays, all day on weekends
    const isWeekend = day === 0 || day === 6;
    const isNightTime = hour >= 22 || hour <= 6;
    
    return isWeekend || isNightTime;
  }

  private calculateRiskScore(stats: CapabilityStats, violations: any[]): number {
    let score = 0;
    
    // Base score from configuration
    score += (stats.restrictedCapabilities / stats.totalCapabilities) * 30;
    score += (stats.approvalRequiredCapabilities / stats.totalCapabilities) * 20;
    
    // Add for violations
    score += violations.length * 15;
    
    // Add for high usage capabilities
    const highUsageCapabilities = Object.values(stats.usageStats)
      .filter(usage => usage.count > 50).length;
    score += highUsageCapabilities * 5;
    
    return Math.min(100, Math.max(0, score));
  }

  private generateRecommendations(stats: CapabilityStats, anomalies: any[]): string[] {
    const recommendations: string[] = [];
    
    if (stats.violations > 10) {
      recommendations.push('High number of capability violations detected - review and tighten restrictions');
    }
    
    const highRiskAnomalies = anomalies.filter(a => a.severity === 'high');
    if (highRiskAnomalies.length > 0) {
      recommendations.push('Critical security anomalies detected - immediate investigation required');
    }
    
    if (stats.allowedCapabilities > stats.restrictedCapabilities * 2) {
      recommendations.push('Consider implementing principle of least privilege - too many capabilities allowed');
    }
    
    if (Object.keys(stats.ruleApplications).length === 0) {
      recommendations.push('No contextual rules applied - consider implementing context-specific capability controls');
    }
    
    return recommendations;
  }
}