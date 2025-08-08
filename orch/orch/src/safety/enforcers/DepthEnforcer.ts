/**
 * DepthEnforcer - Prevents infinite recursion and excessive plan depth
 * Enforces maximum depth and branching limits for safety
 */

export interface DepthLimits {
  maxDepth: number;        // Maximum nesting depth
  maxBranching: number;    // Maximum parallel branches
  maxStepsPerLevel?: number; // Maximum steps at any level
  timeout?: number;        // Maximum execution time per level (ms)
}

export interface DepthContext {
  currentDepth: number;
  parentIds: string[];     // Chain of parent step IDs
  branchingFactor: number; // Current branching at this level
  levelStepCount: number;  // Steps executed at current level
  startTime: number;       // Level execution start time
}

export interface DepthValidationResult {
  allowed: boolean;
  reason?: string;
  suggestedAction?: string;
  maxAllowedDepth?: number;
  maxAllowedBranching?: number;
}

export interface DepthStats {
  maxDepthReached: number;
  maxBranchingReached: number;
  totalStepsExecuted: number;
  depthViolations: number;
  branchingViolations: number;
  timeoutViolations: number;
  averageDepth: number;
  averageBranching: number;
}

export class DepthLimitError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: DepthContext
  ) {
    super(message);
    this.name = 'DepthLimitError';
  }
}

export class DepthEnforcer {
  private limits: Required<DepthLimits>;
  private contexts: Map<string, DepthContext> = new Map();
  private stats: DepthStats;
  
  private readonly defaultLimits: Required<DepthLimits> = {
    maxDepth: 10,           // Maximum 10 levels deep
    maxBranching: 5,        // Maximum 5 parallel branches
    maxStepsPerLevel: 100,  // Maximum 100 steps per level
    timeout: 300000         // 5 minutes per level
  };

  constructor(limits: DepthLimits) {
    this.limits = { ...this.defaultLimits, ...limits };
    this.stats = this.initializeStats();
  }

  /**
   * Check if depth is within limits
   */
  public checkDepth(currentDepth: number, parentChain?: string[]): boolean {
    if (currentDepth > this.limits.maxDepth) {
      this.stats.depthViolations++;
      return false;
    }

    // Check for circular dependencies
    if (parentChain && this.hasCircularDependency(parentChain)) {
      this.stats.depthViolations++;
      return false;
    }

    this.updateDepthStats(currentDepth);
    return true;
  }

  /**
   * Check if branching is within limits
   */
  public checkBranching(branchCount: number): boolean {
    if (branchCount > this.limits.maxBranching) {
      this.stats.branchingViolations++;
      return false;
    }

    this.updateBranchingStats(branchCount);
    return true;
  }

  /**
   * Create depth context for tracking execution
   */
  public createContext(
    stepId: string, 
    parentId?: string, 
    depth: number = 0
  ): DepthContext {
    const parentContext = parentId ? this.contexts.get(parentId) : null;
    const parentIds = parentContext ? [...parentContext.parentIds, parentId] : [];

    const context: DepthContext = {
      currentDepth: depth,
      parentIds,
      branchingFactor: 1,
      levelStepCount: 1,
      startTime: Date.now()
    };

    this.contexts.set(stepId, context);
    return context;
  }

  /**
   * Update context when new steps are added
   */
  public updateContext(stepId: string, additionalSteps: number = 1): void {
    const context = this.contexts.get(stepId);
    if (context) {
      context.levelStepCount += additionalSteps;
      context.branchingFactor = Math.max(context.branchingFactor, additionalSteps);
    }
  }

  /**
   * Validate depth context against all limits
   */
  public validateContext(stepId: string): DepthValidationResult {
    const context = this.contexts.get(stepId);
    if (!context) {
      return {
        allowed: false,
        reason: 'No context found for step',
        suggestedAction: 'Create context before validation'
      };
    }

    // Check depth limit
    if (context.currentDepth > this.limits.maxDepth) {
      return {
        allowed: false,
        reason: `Depth limit exceeded: ${context.currentDepth} > ${this.limits.maxDepth}`,
        suggestedAction: 'Reduce nesting depth or increase maxDepth limit',
        maxAllowedDepth: this.limits.maxDepth
      };
    }

    // Check branching limit
    if (context.branchingFactor > this.limits.maxBranching) {
      return {
        allowed: false,
        reason: `Branching limit exceeded: ${context.branchingFactor} > ${this.limits.maxBranching}`,
        suggestedAction: 'Reduce parallel execution or increase maxBranching limit',
        maxAllowedBranching: this.limits.maxBranching
      };
    }

    // Check steps per level limit
    if (context.levelStepCount > this.limits.maxStepsPerLevel) {
      return {
        allowed: false,
        reason: `Steps per level limit exceeded: ${context.levelStepCount} > ${this.limits.maxStepsPerLevel}`,
        suggestedAction: 'Break down large operations into smaller chunks'
      };
    }

    // Check timeout
    const executionTime = Date.now() - context.startTime;
    if (executionTime > this.limits.timeout) {
      this.stats.timeoutViolations++;
      return {
        allowed: false,
        reason: `Level timeout exceeded: ${executionTime}ms > ${this.limits.timeout}ms`,
        suggestedAction: 'Optimize operations or increase timeout limit'
      };
    }

    // Check for circular dependencies
    if (this.hasCircularDependency(context.parentIds)) {
      return {
        allowed: false,
        reason: 'Circular dependency detected in execution chain',
        suggestedAction: 'Review plan structure to eliminate circular references'
      };
    }

    return { allowed: true };
  }

  /**
   * Remove context when step completes
   */
  public removeContext(stepId: string): void {
    const context = this.contexts.get(stepId);
    if (context) {
      this.stats.totalStepsExecuted += context.levelStepCount;
      this.contexts.delete(stepId);
    }
  }

  /**
   * Get current depth statistics
   */
  public getStats(): DepthStats {
    // Calculate real-time averages
    const activeContexts = Array.from(this.contexts.values());
    const totalActiveSteps = activeContexts.reduce((sum, ctx) => sum + ctx.levelStepCount, 0);
    
    if (activeContexts.length > 0) {
      this.stats.averageDepth = activeContexts.reduce((sum, ctx) => sum + ctx.currentDepth, 0) / activeContexts.length;
      this.stats.averageBranching = activeContexts.reduce((sum, ctx) => sum + ctx.branchingFactor, 0) / activeContexts.length;
    }

    return { ...this.stats };
  }

  /**
   * Update depth limits
   */
  public updateLimits(newLimits: DepthLimits): void {
    this.limits = { ...this.limits, ...newLimits };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = this.initializeStats();
  }

  /**
   * Get active contexts for monitoring
   */
  public getActiveContexts(): Array<{ stepId: string; context: DepthContext }> {
    return Array.from(this.contexts.entries()).map(([stepId, context]) => ({
      stepId,
      context: { ...context }
    }));
  }

  /**
   * Check for potential infinite loops
   */
  public detectPotentialLoops(): Array<{ stepId: string; suspiciousPattern: string }> {
    const suspicious: Array<{ stepId: string; suspiciousPattern: string }> = [];

    for (const [stepId, context] of this.contexts.entries()) {
      // Check for repeating patterns in parent chain
      const parentPattern = this.findRepeatingPattern(context.parentIds);
      if (parentPattern) {
        suspicious.push({
          stepId,
          suspiciousPattern: `Repeating parent pattern: ${parentPattern}`
        });
      }

      // Check for excessive execution time without progress
      const executionTime = Date.now() - context.startTime;
      const avgTimePerStep = executionTime / context.levelStepCount;
      if (avgTimePerStep > 30000) { // 30 seconds per step is suspicious
        suspicious.push({
          stepId,
          suspiciousPattern: `Slow execution: ${avgTimePerStep}ms per step`
        });
      }

      // Check for excessive depth without branching
      if (context.currentDepth > 5 && context.branchingFactor === 1) {
        suspicious.push({
          stepId,
          suspiciousPattern: `Deep linear execution: depth ${context.currentDepth} with no branching`
        });
      }
    }

    return suspicious;
  }

  /**
   * Force cleanup of all contexts (emergency stop)
   */
  public emergencyCleanup(): void {
    const activeCount = this.contexts.size;
    this.contexts.clear();
    console.warn(`Emergency cleanup: removed ${activeCount} active contexts`);
  }

  /**
   * Export execution tree for analysis
   */
  public exportExecutionTree(): any {
    const tree: any = {};
    
    for (const [stepId, context] of this.contexts.entries()) {
      tree[stepId] = {
        depth: context.currentDepth,
        parents: [...context.parentIds],
        branching: context.branchingFactor,
        steps: context.levelStepCount,
        executionTime: Date.now() - context.startTime
      };
    }

    return {
      tree,
      stats: this.getStats(),
      limits: this.limits,
      timestamp: Date.now()
    };
  }

  private initializeStats(): DepthStats {
    return {
      maxDepthReached: 0,
      maxBranchingReached: 0,
      totalStepsExecuted: 0,
      depthViolations: 0,
      branchingViolations: 0,
      timeoutViolations: 0,
      averageDepth: 0,
      averageBranching: 0
    };
  }

  private updateDepthStats(depth: number): void {
    this.stats.maxDepthReached = Math.max(this.stats.maxDepthReached, depth);
  }

  private updateBranchingStats(branching: number): void {
    this.stats.maxBranchingReached = Math.max(this.stats.maxBranchingReached, branching);
  }

  private hasCircularDependency(parentIds: string[]): boolean {
    const seen = new Set<string>();
    
    for (const parentId of parentIds) {
      if (seen.has(parentId)) {
        return true;
      }
      seen.add(parentId);
    }

    return false;
  }

  private findRepeatingPattern(parentIds: string[]): string | null {
    if (parentIds.length < 4) return null;

    // Look for repeating subsequences
    for (let patternLength = 2; patternLength <= parentIds.length / 2; patternLength++) {
      for (let start = 0; start <= parentIds.length - patternLength * 2; start++) {
        const pattern = parentIds.slice(start, start + patternLength);
        const nextSequence = parentIds.slice(start + patternLength, start + patternLength * 2);
        
        if (JSON.stringify(pattern) === JSON.stringify(nextSequence)) {
          return pattern.join(' -> ');
        }
      }
    }

    return null;
  }
}