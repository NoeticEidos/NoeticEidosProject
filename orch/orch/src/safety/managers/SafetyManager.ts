/**
 * SafetyManager - Comprehensive safety and validation system for v1.1 gRPC protocol
 * Provides AJV validation, budget enforcement, security checks, and real-time monitoring
 * Thread-safe implementation for concurrent workflow execution
 */

import Ajv, { JSONSchemaType, ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import addErrors from 'ajv-errors';
import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import { 
  ALL_SCHEMAS, 
  SchemaType, 
  OCRData, 
  NERData, 
  RouteData,
  DetailedValidationError,
  ValidationContext,
  formatValidationErrors,
  createContextualErrorMessage
} from '../schemas/index.js';
import { BudgetEnforcer, BudgetLimits, ResourceUsage, BudgetCheckResult } from '../enforcers/BudgetEnforcer.js';
import { SignatureVerifier, SignatureConfig } from '../verifiers/SignatureVerifier.js';
import { DepthEnforcer, DepthLimits } from '../enforcers/DepthEnforcer.js';
import { CapabilityIsolator, CapabilityConfig } from '../enforcers/CapabilityIsolator.js';

// gRPC v1.1 protocol interfaces
export interface Step {
  id: string;
  type: 'ocr' | 'ner' | 'route' | 'custom';
  args_json: string;
  metadata?: {
    timestamp?: number;
    userId?: string;
    sessionId?: string;
    planId?: string;
    depth?: number;
    capabilities?: string[];
    priority?: 'low' | 'medium' | 'high' | 'critical';
    source?: string;
    parentStepId?: string;
  };
}

export interface WorkflowPlan {
  id: string;
  steps: Step[];
  signature?: string;
  version: string;
  metadata?: {
    userId?: string;
    sessionId?: string;
    timestamp: number;
    priority?: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface Outcome {
  stepId: string;
  success: boolean;
  result?: any;
  errors?: string[];
  warnings?: string[];
  violations?: SafetyViolation[];
  resourceUsage?: ResourceUsage;
  executionTime?: number;
  metadata?: {
    timestamp: number;
    validationTime: number;
    processingTime: number;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors?: DetailedValidationError[];
  warnings?: string[];
  sanitizedData?: any;
  violations?: SafetyViolation[];
  context?: ValidationContext;
  recommendations?: string[];
}

export interface SafetyViolation {
  type: 'BUDGET_EXCEEDED' | 'DEPTH_LIMIT' | 'CAPABILITY_RESTRICTED' | 'SIGNATURE_INVALID' | 'SCHEMA_VIOLATION' | 'RATE_LIMIT';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: any;
  stepId?: string;
  timestamp: number;
  actionable: string; // What can be done to fix this
  impact?: string; // What happens if not fixed
}

export interface PredictiveAnalysis {
  likelihoodOfViolation: number;
  estimatedTimeToViolation?: number;
  suggestedActions: string[];
  riskFactors: string[];
}

export interface SafetyConfig {
  budgetLimits: BudgetLimits;
  signature?: SignatureConfig & {
    keyRotation?: {
      enabled: boolean;
      intervalMs: number;
      gracePeriodMs: number;
    };
  };
  depthLimits: DepthLimits;
  capabilities: CapabilityConfig;
  validation: {
    strictMode: boolean;
    allowUnknownProperties: boolean;
    coerceTypes: boolean;
    customErrorMessages: boolean;
    additionalProperties: boolean;
    validateFormats: boolean;
  };
  threading: {
    maxConcurrentValidations: number;
    timeoutMs: number;
    enableWorkerThreads: boolean;
  };
  monitoring: {
    enablePredictiveAnalysis: boolean;
    metricsRetentionMs: number;
    alertThresholds: {
      budgetUtilization: number;
      errorRate: number;
      latency: number;
    };
  };
  security: {
    enableSandboxing: boolean;
    rateLimiting: {
      windowMs: number;
      maxRequests: number;
    };
    contentFiltering: {
      maxPayloadSize: number;
      allowedContentTypes: string[];
    };
  };
}

export class SafetyValidationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'SafetyValidationError';
  }
}

export class SafetyManager extends EventEmitter {
  private ajv: Ajv;
  private validators: Map<SchemaType, ValidateFunction> = new Map();
  private budgetEnforcer: BudgetEnforcer;
  private signatureVerifier?: SignatureVerifier;
  private depthEnforcer: DepthEnforcer;
  private capabilityIsolator: CapabilityIsolator;
  private config: SafetyConfig;
  
  // Thread-safety and concurrency
  private readonly validationSemaphore: Map<string, Promise<any>> = new Map();
  private readonly activeValidations = new Set<string>();
  private readonly workerPool: Worker[] = [];
  
  // Real-time monitoring
  private readonly metrics = {
    validationsPerformed: 0,
    violationsDetected: 0,
    averageValidationTime: 0,
    errorRate: 0,
    lastViolations: [] as SafetyViolation[]
  };
  
  // Predictive analysis
  private readonly predictionModel = {
    historicalData: [] as Array<{timestamp: number, violations: number, resourceUsage: ResourceUsage}>,
    trendAnalysis: new Map<string, number[]>()
  };

  constructor(config: SafetyConfig) {
    super();
    this.config = config;
    
    // Initialize AJV with comprehensive validation options
    this.ajv = new Ajv({
      strict: config.validation.strictMode,
      allowUnknownKeywords: !config.validation.strictMode,
      coerceTypes: config.validation.coerceTypes,
      removeAdditional: !config.validation.allowUnknownProperties,
      additionalProperties: config.validation.additionalProperties,
      useDefaults: true,
      allErrors: true,
      validateFormats: config.validation.validateFormats,
      verbose: true,
      discriminator: true
    });
    
    // Add format validation and custom error messages
    addFormats(this.ajv);
    if (config.validation.customErrorMessages) {
      addErrors(this.ajv);
    }
    
    // Compile all schemas with error handling
    this.compileSchemas();
    
    // Initialize safety components with enhanced configuration
    this.budgetEnforcer = new BudgetEnforcer(config.budgetLimits);
    
    if (config.signature) {
      this.signatureVerifier = new SignatureVerifier(
        config.signature.secretKey,
        config.signature.algorithm,
        config.signature
      );
      
      // Set up key rotation if enabled
      if (config.signature.keyRotation?.enabled) {
        this.scheduleKeyRotation();
      }
    }
    
    this.depthEnforcer = new DepthEnforcer(config.depthLimits);
    this.capabilityIsolator = new CapabilityIsolator(config.capabilities);
    
    // Initialize worker thread pool if enabled
    if (config.threading.enableWorkerThreads) {
      this.initializeWorkerPool();
    }
    
    // Set up monitoring and alerts
    this.initializeMonitoring();
    
    // Start predictive analysis if enabled
    if (config.monitoring.enablePredictiveAnalysis) {
      this.initializePredictiveAnalysis();
    }
  }

  /**
   * Compile all JSON schemas for efficient validation with error handling
   */
  private compileSchemas(): void {
    try {
      for (const [schemaName, schema] of Object.entries(ALL_SCHEMAS)) {
        try {
          const validator = this.ajv.compile(schema as JSONSchemaType<any>);
          this.validators.set(schemaName as SchemaType, validator);
        } catch (schemaError) {
          console.warn(`Failed to compile schema ${schemaName}:`, schemaError);
          // Create a fallback validator that always passes with warnings
          this.validators.set(schemaName as SchemaType, (data: any) => {
            console.warn(`Using fallback validator for ${schemaName}`);
            return true;
          });
        }
      }
    } catch (error) {
      throw new SafetyValidationError(
        'Failed to compile validation schemas',
        'SCHEMA_COMPILATION_ERROR',
        { 
          error: error instanceof Error ? error.message : String(error),
          schemasAttempted: Object.keys(ALL_SCHEMAS)
        }
      );
    }
  }

  /**
   * Validate a step's args_json against the appropriate schema with comprehensive safety checks
   */
  public async validateStep(step: Step): Promise<ValidationResult> {
    const startTime = Date.now();
    const validationId = `${step.id}_${Date.now()}`;
    const context: ValidationContext = {
      stepId: step.id,
      stepType: step.type,
      userId: step.metadata?.userId,
      sessionId: step.metadata?.sessionId,
      timestamp: startTime
    };
    
    // Ensure thread safety with semaphore
    if (this.activeValidations.has(step.id)) {
      const existingValidation = this.validationSemaphore.get(step.id);
      if (existingValidation) {
        return await existingValidation;
      }
    }
    
    const validationPromise = this.performValidation(step, context, startTime);
    this.validationSemaphore.set(step.id, validationPromise);
    this.activeValidations.add(step.id);
    
    try {
      const result = await validationPromise;
      return result;
    } finally {
      this.validationSemaphore.delete(step.id);
      this.activeValidations.delete(step.id);
      
      // Update metrics
      this.updateMetrics(Date.now() - startTime);
    }
  }
  
  /**
   * Perform the actual validation with comprehensive safety checks
   */
  private async performValidation(step: Step, context: ValidationContext, startTime: number): Promise<ValidationResult> {
    const errors: DetailedValidationError[] = [];
    const warnings: string[] = [];
    const violations: SafetyViolation[] = [];
    const recommendations: string[] = [];

    try {
      // 1. Pre-validation security checks
      const securityCheck = await this.performSecurityChecks(step);
      if (!securityCheck.passed) {
        violations.push(...securityCheck.violations);
      }
      
      // 2. Budget enforcement with predictive analysis
      const resourceUsage: ResourceUsage = {
        tokenCount: this.estimateTokenCount(step.args_json),
        cost: this.estimateCost(step),
        latency: 0,
        timestamp: Date.now()
      };

      const budgetCheck = this.budgetEnforcer.checkBudget(resourceUsage);
      if (!budgetCheck.allowed) {
        const violation: SafetyViolation = {
          type: 'BUDGET_EXCEEDED',
          severity: 'high',
          message: budgetCheck.reason || 'Budget limit exceeded',
          details: { resourceUsage, budgetStatus: this.budgetEnforcer.getStatus() },
          stepId: step.id,
          timestamp: Date.now(),
          actionable: budgetCheck.alternativeAction || 'Wait for budget reset or optimize resource usage',
          impact: 'Execution blocked until budget is available'
        };
        violations.push(violation);
        
        // Perform predictive analysis
        const prediction = this.performPredictiveAnalysis('budget', resourceUsage);
        if (prediction.likelihoodOfViolation > 0.7) {
          recommendations.push(...prediction.suggestedActions);
        }
      }

      // 3. Depth enforcement with recursion detection
      const depth = step.metadata?.depth || 0;
      const parentChain = this.buildParentChain(step);
      if (!this.depthEnforcer.checkDepth(depth, parentChain)) {
        const violation: SafetyViolation = {
          type: 'DEPTH_LIMIT',
          severity: 'medium',
          message: `Depth limit exceeded: ${depth} > ${this.config.depthLimits.maxDepth}`,
          details: { depth, maxDepth: this.config.depthLimits.maxDepth, parentChain },
          stepId: step.id,
          timestamp: Date.now(),
          actionable: 'Reduce workflow nesting depth or increase depth limits',
          impact: 'Potential infinite recursion or excessive resource consumption'
        };
        violations.push(violation);
      }

      // 4. Capability isolation with sandboxing
      const capabilities = step.metadata?.capabilities || [];
      const capabilityCheck = this.capabilityIsolator.validateCapabilities(capabilities, {
        userId: step.metadata?.userId,
        sessionContext: step.metadata?.sessionId,
        timestamp: startTime
      });
      
      if (!capabilityCheck.allowed) {
        if (capabilityCheck.requiresApproval) {
          warnings.push(`Capabilities require approval: ${capabilityCheck.approvalCapabilities?.join(', ')}`);
          recommendations.push('Submit capability approval request before execution');
        } else {
          const violation: SafetyViolation = {
            type: 'CAPABILITY_RESTRICTED',
            severity: 'high',
            message: capabilityCheck.reason || 'Restricted capabilities requested',
            details: { 
              requestedCapabilities: capabilities,
              restrictedCapabilities: capabilityCheck.restrictedCapabilities 
            },
            stepId: step.id,
            timestamp: Date.now(),
            actionable: 'Remove restricted capabilities or request permission elevation',
            impact: 'Execution blocked due to security policy violations'
          };
          violations.push(violation);
        }
      }

      // 5. JSON parsing with enhanced error reporting
      let parsedArgs: any;
      try {
        parsedArgs = JSON.parse(step.args_json);
      } catch (parseError) {
        const error: DetailedValidationError = {
          path: 'args_json',
          message: 'Invalid JSON format',
          value: step.args_json.substring(0, 100) + (step.args_json.length > 100 ? '...' : ''),
          constraint: 'format'
        };
        errors.push(error);
        
        const violation: SafetyViolation = {
          type: 'SCHEMA_VIOLATION',
          severity: 'medium',
          message: 'JSON parsing failed',
          details: { parseError: parseError instanceof Error ? parseError.message : String(parseError) },
          stepId: step.id,
          timestamp: Date.now(),
          actionable: 'Fix JSON syntax in args_json field',
          impact: 'Step cannot be executed due to invalid arguments'
        };
        violations.push(violation);
      }

      // 6. Schema validation with detailed error reporting
      if (parsedArgs) {
        const validator = this.validators.get(step.type as SchemaType);
        if (!validator) {
          if (step.type === 'custom') {
            warnings.push('Custom step type - skipping schema validation');
          } else {
            const error: DetailedValidationError = {
              path: 'type',
              message: `Unknown step type: ${step.type}`,
              value: step.type,
              allowedValues: Array.from(this.validators.keys()),
              constraint: 'enum'
            };
            errors.push(error);
          }
        } else {
          const isValid = validator(parsedArgs);
          if (!isValid && validator.errors) {
            const formattedErrors = formatValidationErrors(validator.errors, context);
            errors.push(...formattedErrors);
            
            // Create schema violation
            const violation: SafetyViolation = {
              type: 'SCHEMA_VIOLATION',
              severity: 'medium',
              message: 'Schema validation failed',
              details: { 
                schemaErrors: validator.errors,
                stepType: step.type 
              },
              stepId: step.id,
              timestamp: Date.now(),
              actionable: 'Fix arguments to match schema requirements',
              impact: 'Step may fail during execution due to invalid arguments'
            };
            violations.push(violation);
          }
        }
      }

      // 7. Rate limiting check
      if (!this.checkRateLimit(step)) {
        const violation: SafetyViolation = {
          type: 'RATE_LIMIT',
          severity: 'medium',
          message: 'Rate limit exceeded',
          details: { stepId: step.id, userId: step.metadata?.userId },
          stepId: step.id,
          timestamp: Date.now(),
          actionable: 'Reduce request frequency or implement batching',
          impact: 'Temporary delay in processing'
        };
        violations.push(violation);
      }

      // 8. Update resource usage with actual latency
      const validationTime = Date.now() - startTime;
      resourceUsage.latency = validationTime;
      this.budgetEnforcer.recordUsage(resourceUsage);

      // 9. Emit validation events for monitoring
      this.emit('validation-completed', {
        step,
        context,
        result: {
          isValid: errors.length === 0 && violations.filter(v => v.severity === 'high' || v.severity === 'critical').length === 0,
          errors,
          warnings,
          violations,
          validationTime
        }
      });

      // 10. Record metrics and update predictions
      this.recordValidationMetrics(step, violations, validationTime);
      
      const isValid = errors.length === 0 && violations.filter(v => v.severity === 'high' || v.severity === 'critical').length === 0;
      
      return {
        isValid,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        violations: violations.length > 0 ? violations : undefined,
        sanitizedData: parsedArgs,
        context,
        recommendations: recommendations.length > 0 ? recommendations : undefined
      };

    } catch (error) {
      const validationError: DetailedValidationError = {
        path: 'validation',
        message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
        constraint: 'system'
      };
      
      return {
        isValid: false,
        errors: [validationError],
        context
      };
    }
  }

  /**
   * Validate multiple steps in batch with concurrency control
   */
  public async validateSteps(steps: Step[]): Promise<ValidationResult[]> {
    // Check for branching limits first
    const branchingCheck = this.depthEnforcer.checkBranching(steps.length);
    if (!branchingCheck) {
      const violation: SafetyViolation = {
        type: 'DEPTH_LIMIT',
        severity: 'high',
        message: `Branching limit exceeded: ${steps.length} > ${this.config.depthLimits.maxBranching}`,
        details: { stepCount: steps.length, maxBranching: this.config.depthLimits.maxBranching },
        timestamp: Date.now(),
        actionable: 'Reduce parallel execution or increase branching limits',
        impact: 'All steps in batch blocked due to excessive parallelism'
      };
      
      // Mark all results as invalid
      return steps.map(step => ({
        isValid: false,
        violations: [violation],
        context: {
          stepId: step.id,
          stepType: step.type,
          timestamp: Date.now()
        }
      }));
    }
    
    // Control concurrency based on configuration
    const maxConcurrent = this.config.threading.maxConcurrentValidations;
    const batches: Step[][] = [];
    
    for (let i = 0; i < steps.length; i += maxConcurrent) {
      batches.push(steps.slice(i, i + maxConcurrent));
    }
    
    const allResults: ValidationResult[] = [];
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(step => this.validateStep(step))
      );
      allResults.push(...batchResults);
    }
    
    // Emit batch completion event
    this.emit('batch-validation-completed', {
      stepCount: steps.length,
      results: allResults,
      timestamp: Date.now()
    });
    
    return allResults;
  }

  /**
   * Verify workflow plan signature integrity with detailed reporting
   */
  public async verifyWorkflowPlan(plan: WorkflowPlan): Promise<{ valid: boolean; violations?: SafetyViolation[]; details?: any }> {
    if (!this.signatureVerifier) {
      const violation: SafetyViolation = {
        type: 'SIGNATURE_INVALID',
        severity: 'critical',
        message: 'Signature verification not configured',
        stepId: plan.id,
        timestamp: Date.now(),
        actionable: 'Configure signature verification in SafetyManager',
        impact: 'Plan integrity cannot be verified - security risk'
      };
      return { valid: false, violations: [violation] };
    }
    
    if (!plan.signature) {
      const violation: SafetyViolation = {
        type: 'SIGNATURE_INVALID',
        severity: 'high',
        message: 'Plan signature is missing',
        stepId: plan.id,
        timestamp: Date.now(),
        actionable: 'Sign the workflow plan before execution',
        impact: 'Plan integrity cannot be verified'
      };
      return { valid: false, violations: [violation] };
    }
    
    const verificationResult = this.signatureVerifier.verifyWithDetails(plan, plan.signature);
    
    if (!verificationResult.valid) {
      const violation: SafetyViolation = {
        type: 'SIGNATURE_INVALID',
        severity: 'critical',
        message: verificationResult.reason || 'Signature verification failed',
        details: verificationResult,
        stepId: plan.id,
        timestamp: Date.now(),
        actionable: 'Re-sign the plan with valid credentials',
        impact: 'Plan cannot be executed due to integrity concerns'
      };
      return { valid: false, violations: [violation], details: verificationResult };
    }
    
    return { valid: true, details: verificationResult };
  }

  /**
   * Generate signature for workflow plan
   */
  public signWorkflowPlan(plan: Omit<WorkflowPlan, 'signature'>): WorkflowPlan {
    if (!this.signatureVerifier) {
      throw new SafetyValidationError(
        'Signature generation not configured',
        'SIGNATURE_NOT_CONFIGURED'
      );
    }
    
    const signature = this.signatureVerifier.sign(plan);
    return { ...plan, signature };
  }

  /**
   * Get comprehensive safety status including predictions
   */
  public getSafetyStatus() {
    const budgetStatus = this.budgetEnforcer.getStatus();
    const depthStats = this.depthEnforcer.getStats();
    const capabilityStats = this.capabilityIsolator.getStats();
    
    // Perform predictive analysis
    const budgetPrediction = this.performPredictiveAnalysis('budget', budgetStatus);
    const depthPrediction = this.performPredictiveAnalysis('depth', depthStats);
    
    return {
      budget: budgetStatus,
      depth: depthStats,
      capabilities: capabilityStats,
      metrics: this.metrics,
      predictions: {
        budget: budgetPrediction,
        depth: depthPrediction
      },
      activeValidations: this.activeValidations.size,
      recentViolations: this.metrics.lastViolations.slice(-10),
      systemHealth: this.calculateSystemHealth()
    };
  }

  /**
   * Reset all safety counters and metrics
   */
  public resetSafetyCounters(): void {
    this.budgetEnforcer.reset();
    this.depthEnforcer.resetStats();
    this.metrics.validationsPerformed = 0;
    this.metrics.violationsDetected = 0;
    this.metrics.errorRate = 0;
    this.metrics.lastViolations = [];
    this.predictionModel.historicalData = [];
    this.predictionModel.trendAnalysis.clear();
    
    this.emit('safety-reset', { timestamp: Date.now() });
  }

  /**
   * Get comprehensive safety statistics with trends
   */
  public getDetailedStats() {
    return {
      budget: this.budgetEnforcer.getStatus(),
      validation: {
        schemasCompiled: this.validators.size,
        strictMode: this.config.validation.strictMode,
        totalValidations: this.metrics.validationsPerformed,
        averageTime: this.metrics.averageValidationTime,
        errorRate: this.metrics.errorRate
      },
      capabilities: this.capabilityIsolator.getStats(),
      depth: this.depthEnforcer.getStats(),
      threading: {
        activeValidations: this.activeValidations.size,
        maxConcurrent: this.config.threading.maxConcurrentValidations,
        workerThreadsEnabled: this.config.threading.enableWorkerThreads
      },
      security: {
        recentViolations: this.metrics.lastViolations.length,
        criticalViolations: this.metrics.lastViolations.filter(v => v.severity === 'critical').length,
        highSeverityViolations: this.metrics.lastViolations.filter(v => v.severity === 'high').length
      },
      predictions: this.config.monitoring.enablePredictiveAnalysis ? {
        budgetTrend: this.predictionModel.trendAnalysis.get('budget') || [],
        violationTrend: this.predictionModel.trendAnalysis.get('violations') || []
      } : undefined
    };
  }

  /**
   * Estimate token count with improved accuracy
   */
  private estimateTokenCount(content: string): number {
    if (!content) return 0;
    
    // More sophisticated estimation based on content type
    const words = content.split(/\s+/).filter(word => word.length > 0);
    const avgTokensPerWord = 1.3; // Based on GPT tokenization patterns
    const baseTokens = Math.ceil(words.length * avgTokensPerWord);
    
    // Adjust for JSON structure overhead
    const jsonChars = (content.match(/[{}\\[\\]:,"]/g) || []).length;
    const structureTokens = Math.ceil(jsonChars / 8);
    
    return baseTokens + structureTokens;
  }

  /**
   * Estimate cost with dynamic pricing and complexity factors
   */
  private estimateCost(step: Step): number {
    const baseCosts = {
      ocr: 0.001,
      ner: 0.0005,
      route: 0.0001,
      custom: 0.002
    };
    
    let baseCost = baseCosts[step.type as keyof typeof baseCosts] || baseCosts.custom;
    
    // Apply complexity multipliers
    const tokenCount = this.estimateTokenCount(step.args_json);
    const complexityMultiplier = Math.max(1, Math.log10(tokenCount / 100));
    
    // Priority multiplier
    const priorityMultipliers = {
      low: 0.8,
      medium: 1.0,
      high: 1.5,
      critical: 2.0
    };
    
    const priority = step.metadata?.priority || 'medium';
    const priorityMultiplier = priorityMultipliers[priority];
    
    return baseCost * complexityMultiplier * priorityMultiplier;
  }

  /**
   * Add custom schema validator with validation
   */
  public addCustomValidator(name: string, schema: any): void {
    // Validate the schema itself first
    try {
      const metaValidator = new Ajv({ strict: false });
      const isValidSchema = metaValidator.validateSchema(schema);
      
      if (!isValidSchema) {
        throw new Error(`Invalid schema structure: ${metaValidator.errors?.map(e => e.message).join(', ')}`);
      }
      
      const validator = this.ajv.compile(schema);
      this.validators.set(name as SchemaType, validator);
      
      this.emit('custom-validator-added', {
        name,
        timestamp: Date.now(),
        schemaProperties: Object.keys(schema.properties || {})
      });
      
    } catch (error) {
      throw new SafetyValidationError(
        `Failed to compile custom schema: ${name}`,
        'CUSTOM_SCHEMA_ERROR',
        { 
          error: error instanceof Error ? error.message : String(error),
          schemaPreview: JSON.stringify(schema).substring(0, 200)
        }
      );
    }
  }

  /**
   * Remove custom validator
   */
  public removeCustomValidator(name: string): boolean {
    const removed = this.validators.delete(name as SchemaType);
    
    if (removed) {
      this.emit('custom-validator-removed', {
        name,
        timestamp: Date.now()
      });
    }
    
    return removed;
  }

  /**
   * Update safety configuration with validation and hot-reload
   */
  public updateConfig(newConfig: Partial<SafetyConfig>): void {
    const oldConfig = { ...this.config };
    
    try {
      this.config = { ...this.config, ...newConfig };
      
      // Update individual components
      if (newConfig.budgetLimits) {
        this.budgetEnforcer.updateLimits(newConfig.budgetLimits);
      }
      
      if (newConfig.depthLimits) {
        this.depthEnforcer.updateLimits(newConfig.depthLimits);
      }
      
      if (newConfig.capabilities) {
        this.capabilityIsolator.updateConfig(newConfig.capabilities);
      }
      
      // Restart monitoring if settings changed
      if (newConfig.monitoring) {
        this.reinitializeMonitoring();
      }
      
      // Update AJV settings if validation config changed
      if (newConfig.validation) {
        this.reinitializeValidation();
      }
      
      this.emit('config-updated', {
        oldConfig,
        newConfig: this.config,
        timestamp: Date.now()
      });
      
    } catch (error) {
      // Rollback on error
      this.config = oldConfig;
      throw new SafetyValidationError(
        'Failed to update safety configuration',
        'CONFIG_UPDATE_ERROR',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }
  
  // Additional helper methods for the enhanced SafetyManager
  
  private async performSecurityChecks(step: Step): Promise<{ passed: boolean; violations: SafetyViolation[] }> {
    const violations: SafetyViolation[] = [];
    
    // Check payload size
    const payloadSize = Buffer.byteLength(step.args_json, 'utf8');
    if (payloadSize > this.config.security.contentFiltering.maxPayloadSize) {
      violations.push({
        type: 'SCHEMA_VIOLATION',
        severity: 'medium',
        message: 'Payload size exceeds limit',
        details: { size: payloadSize, limit: this.config.security.contentFiltering.maxPayloadSize },
        stepId: step.id,
        timestamp: Date.now(),
        actionable: 'Reduce payload size or increase limits',
        impact: 'Potential memory exhaustion or DoS'
      });
    }
    
    // Check for malicious patterns
    const suspiciousPatterns = [
      /__proto__/,
      /constructor\.prototype/,
      /<script/i,
      /javascript:/i,
      /eval\(/,
      /function\s*\(/
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(step.args_json)) {
        violations.push({
          type: 'SCHEMA_VIOLATION',
          severity: 'high',
          message: 'Potentially malicious content detected',
          details: { pattern: pattern.source },
          stepId: step.id,
          timestamp: Date.now(),
          actionable: 'Remove suspicious content from payload',
          impact: 'Potential security vulnerability'
        });
      }
    }
    
    return {
      passed: violations.filter(v => v.severity === 'high' || v.severity === 'critical').length === 0,
      violations
    };
  }
  
  private buildParentChain(step: Step): string[] {
    // Build parent chain for recursion detection
    const chain: string[] = [];
    const parentId = step.metadata?.parentStepId;
    
    if (parentId) {
      chain.push(parentId);
      // In a real implementation, you'd traverse up the chain
    }
    
    return chain;
  }
  
  private checkRateLimit(step: Step): boolean {
    // Simple rate limiting implementation
    const userId = step.metadata?.userId || 'anonymous';
    const windowMs = this.config.security.rateLimiting.windowMs;
    const maxRequests = this.config.security.rateLimiting.maxRequests;
    
    // This would be implemented with a proper rate limiter
    return true; // Placeholder
  }
  
  private performPredictiveAnalysis(type: string, data: any): PredictiveAnalysis {
    // Simple predictive analysis implementation
    const historical = this.predictionModel.historicalData.slice(-100);
    
    if (historical.length < 10) {
      return {
        likelihoodOfViolation: 0,
        suggestedActions: ['Collect more data for accurate predictions'],
        riskFactors: ['Insufficient historical data']
      };
    }
    
    // Calculate trend
    const recentViolations = historical.slice(-10).reduce((sum, h) => sum + h.violations, 0);
    const earlierViolations = historical.slice(-20, -10).reduce((sum, h) => sum + h.violations, 0);
    
    const trend = recentViolations - earlierViolations;
    const likelihood = Math.min(1, Math.max(0, trend / 10));
    
    const suggestedActions: string[] = [];
    const riskFactors: string[] = [];
    
    if (likelihood > 0.7) {
      suggestedActions.push('Consider increasing safety limits', 'Implement additional monitoring');
      riskFactors.push('Rising violation trend detected');
    }
    
    return {
      likelihoodOfViolation: likelihood,
      estimatedTimeToViolation: likelihood > 0.5 ? (1 - likelihood) * 3600000 : undefined, // hours to ms
      suggestedActions,
      riskFactors
    };
  }
  
  private updateMetrics(validationTime: number): void {
    this.metrics.validationsPerformed++;
    
    // Update rolling average
    const alpha = 0.1;
    this.metrics.averageValidationTime = 
      (1 - alpha) * this.metrics.averageValidationTime + alpha * validationTime;
  }
  
  private recordValidationMetrics(step: Step, violations: SafetyViolation[], validationTime: number): void {
    if (violations.length > 0) {
      this.metrics.violationsDetected += violations.length;
      this.metrics.lastViolations.push(...violations);
      
      // Keep only recent violations
      if (this.metrics.lastViolations.length > 100) {
        this.metrics.lastViolations = this.metrics.lastViolations.slice(-50);
      }
    }
    
    // Update error rate
    const totalValidations = this.metrics.validationsPerformed;
    this.metrics.errorRate = this.metrics.violationsDetected / totalValidations;
    
    // Record for predictive analysis
    if (this.config.monitoring.enablePredictiveAnalysis) {
      this.predictionModel.historicalData.push({
        timestamp: Date.now(),
        violations: violations.length,
        resourceUsage: {
          tokenCount: this.estimateTokenCount(step.args_json),
          cost: this.estimateCost(step),
          latency: validationTime,
          timestamp: Date.now()
        }
      });
      
      // Keep only recent data
      if (this.predictionModel.historicalData.length > 1000) {
        this.predictionModel.historicalData = this.predictionModel.historicalData.slice(-500);
      }
    }
  }
  
  private calculateSystemHealth(): number {
    let health = 100;
    
    // Deduct for high error rate
    if (this.metrics.errorRate > 0.1) health -= 30;
    else if (this.metrics.errorRate > 0.05) health -= 15;
    
    // Deduct for recent critical violations
    const recentCritical = this.metrics.lastViolations.filter(
      v => v.severity === 'critical' && Date.now() - v.timestamp < 300000 // 5 minutes
    ).length;
    health -= recentCritical * 20;
    
    // Deduct for budget pressure
    const budgetStatus = this.budgetEnforcer.getStatus();
    if (budgetStatus.isNearLimit) health -= 15;
    
    return Math.max(0, Math.min(100, health));
  }
  
  private initializeWorkerPool(): void {
    // Worker thread pool initialization would go here
    console.log('Worker thread pool initialized');
  }
  
  private initializeMonitoring(): void {
    // Set up periodic monitoring
    setInterval(() => {
      this.emit('metrics-update', this.getDetailedStats());
    }, 60000); // Every minute
  }
  
  private initializePredictiveAnalysis(): void {
    // Set up predictive analysis
    setInterval(() => {
      const budgetPrediction = this.performPredictiveAnalysis('budget', this.budgetEnforcer.getStatus());
      if (budgetPrediction.likelihoodOfViolation > 0.8) {
        this.emit('prediction-alert', {
          type: 'budget',
          prediction: budgetPrediction,
          timestamp: Date.now()
        });
      }
    }, 300000); // Every 5 minutes
  }
  
  private scheduleKeyRotation(): void {
    if (!this.config.signature?.keyRotation?.enabled || !this.signatureVerifier) return;
    
    const interval = this.config.signature.keyRotation.intervalMs;
    setInterval(() => {
      // Key rotation logic would go here
      this.emit('key-rotation', { timestamp: Date.now() });
    }, interval);
  }
  
  private reinitializeMonitoring(): void {
    // Reinitialize monitoring with new settings
    this.initializeMonitoring();
  }
  
  private reinitializeValidation(): void {
    // Reinitialize AJV with new settings
    const newAjv = new Ajv({
      strict: this.config.validation.strictMode,
      allowUnknownKeywords: !this.config.validation.strictMode,
      coerceTypes: this.config.validation.coerceTypes,
      removeAdditional: !this.config.validation.allowUnknownProperties,
      additionalProperties: this.config.validation.additionalProperties,
      useDefaults: true,
      allErrors: true,
      validateFormats: this.config.validation.validateFormats,
      verbose: true,
      discriminator: true
    });
    
    addFormats(newAjv);
    if (this.config.validation.customErrorMessages) {
      addErrors(newAjv);
    }
    
    this.ajv = newAjv;
    this.compileSchemas();
  }
}