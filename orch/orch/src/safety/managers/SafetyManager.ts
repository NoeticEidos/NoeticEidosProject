/**
 * SafetyManager - Comprehensive safety and validation system
 * Provides AJV validation, budget enforcement, and security checks
 */

import Ajv, { JSONSchemaType, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { ALL_SCHEMAS, SchemaType, OCRData, NERData, RouteData } from '../schemas/index.js';
import { BudgetEnforcer, BudgetLimits, ResourceUsage } from '../enforcers/BudgetEnforcer.js';
import { SignatureVerifier } from '../verifiers/SignatureVerifier.js';
import { DepthEnforcer } from '../enforcers/DepthEnforcer.js';
import { CapabilityIsolator } from '../enforcers/CapabilityIsolator.js';

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
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
  sanitizedData?: any;
}

export interface SafetyConfig {
  budgetLimits: BudgetLimits;
  signature?: {
    secretKey: string;
    algorithm: 'sha256' | 'sha512';
  };
  depthLimits: {
    maxDepth: number;
    maxBranching: number;
  };
  capabilities: {
    allowed: string[];
    restricted: string[];
    requireApproval: string[];
  };
  validation: {
    strictMode: boolean;
    allowUnknownProperties: boolean;
    coerceTypes: boolean;
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

export class SafetyManager {
  private ajv: Ajv;
  private validators: Map<SchemaType, ValidateFunction> = new Map();
  private budgetEnforcer: BudgetEnforcer;
  private signatureVerifier?: SignatureVerifier;
  private depthEnforcer: DepthEnforcer;
  private capabilityIsolator: CapabilityIsolator;
  private config: SafetyConfig;

  constructor(config: SafetyConfig) {
    this.config = config;
    
    // Initialize AJV with formats and strict validation
    this.ajv = new Ajv({
      strict: config.validation.strictMode,
      allowUnknownKeywords: !config.validation.strictMode,
      coerceTypes: config.validation.coerceTypes,
      removeAdditional: !config.validation.allowUnknownProperties,
      useDefaults: true,
      allErrors: true
    });
    
    addFormats(this.ajv);
    
    // Compile all schemas
    this.compileSchemas();
    
    // Initialize safety components
    this.budgetEnforcer = new BudgetEnforcer(config.budgetLimits);
    
    if (config.signature) {
      this.signatureVerifier = new SignatureVerifier(
        config.signature.secretKey,
        config.signature.algorithm
      );
    }
    
    this.depthEnforcer = new DepthEnforcer(config.depthLimits);
    this.capabilityIsolator = new CapabilityIsolator(config.capabilities);
  }

  /**
   * Compile all JSON schemas for efficient validation
   */
  private compileSchemas(): void {
    try {
      for (const [schemaName, schema] of Object.entries(ALL_SCHEMAS)) {
        const validator = this.ajv.compile(schema as JSONSchemaType<any>);
        this.validators.set(schemaName as SchemaType, validator);
      }
    } catch (error) {
      throw new SafetyValidationError(
        'Failed to compile validation schemas',
        'SCHEMA_COMPILATION_ERROR',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Validate a step's args_json against the appropriate schema
   */
  public async validateStep(step: Step): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 1. Budget enforcement
      const resourceUsage: ResourceUsage = {
        tokenCount: this.estimateTokenCount(step.args_json),
        cost: this.estimateCost(step),
        latency: 0, // Will be updated after processing
        timestamp: Date.now()
      };

      const budgetCheck = this.budgetEnforcer.checkBudget(resourceUsage);
      if (!budgetCheck.allowed) {
        return {
          isValid: false,
          errors: [`Budget limit exceeded: ${budgetCheck.reason}`]
        };
      }

      // 2. Depth enforcement
      const depth = step.metadata?.depth || 0;
      if (!this.depthEnforcer.checkDepth(depth)) {
        return {
          isValid: false,
          errors: [`Depth limit exceeded: ${depth} > ${this.config.depthLimits.maxDepth}`]
        };
      }

      // 3. Capability isolation
      const capabilities = step.metadata?.capabilities || [];
      const capabilityCheck = this.capabilityIsolator.validateCapabilities(capabilities);
      if (!capabilityCheck.allowed) {
        if (capabilityCheck.requiresApproval) {
          warnings.push(`Capabilities require approval: ${capabilityCheck.restrictedCapabilities?.join(', ')}`);
        } else {
          return {
            isValid: false,
            errors: [`Restricted capabilities: ${capabilityCheck.restrictedCapabilities?.join(', ')}`]
          };
        }
      }

      // 4. JSON parsing and validation
      let parsedArgs: any;
      try {
        parsedArgs = JSON.parse(step.args_json);
      } catch (parseError) {
        return {
          isValid: false,
          errors: ['Invalid JSON in args_json']
        };
      }

      // 5. Schema validation
      const validator = this.validators.get(step.type as SchemaType);
      if (!validator) {
        if (step.type === 'custom') {
          warnings.push('Custom step type - skipping schema validation');
          return {
            isValid: true,
            warnings,
            sanitizedData: parsedArgs
          };
        }
        
        return {
          isValid: false,
          errors: [`Unknown step type: ${step.type}`]
        };
      }

      const isValid = validator(parsedArgs);
      if (!isValid && validator.errors) {
        const validationErrors = validator.errors.map(error => 
          `${error.instancePath || 'root'}: ${error.message}`
        );
        errors.push(...validationErrors);
      }

      // 6. Update resource usage with actual latency
      resourceUsage.latency = Date.now() - startTime;
      this.budgetEnforcer.recordUsage(resourceUsage);

      return {
        isValid: isValid && errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        sanitizedData: parsedArgs
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * Validate multiple steps in batch
   */
  public async validateSteps(steps: Step[]): Promise<ValidationResult[]> {
    const results = await Promise.all(
      steps.map(step => this.validateStep(step))
    );

    // Check for branching limits
    const branchingCheck = this.depthEnforcer.checkBranching(steps.length);
    if (!branchingCheck) {
      // Mark all results as invalid if branching limit exceeded
      return results.map(result => ({
        ...result,
        isValid: false,
        errors: [...(result.errors || []), `Branching limit exceeded: ${steps.length} > ${this.config.depthLimits.maxBranching}`]
      }));
    }

    return results;
  }

  /**
   * Verify plan signature integrity
   */
  public verifyPlanSignature(plan: any, signature: string): boolean {
    if (!this.signatureVerifier) {
      throw new SafetyValidationError(
        'Signature verification not configured',
        'SIGNATURE_NOT_CONFIGURED'
      );
    }

    return this.signatureVerifier.verify(plan, signature);
  }

  /**
   * Generate signature for plan
   */
  public signPlan(plan: any): string {
    if (!this.signatureVerifier) {
      throw new SafetyValidationError(
        'Signature generation not configured',
        'SIGNATURE_NOT_CONFIGURED'
      );
    }

    return this.signatureVerifier.sign(plan);
  }

  /**
   * Get current budget status
   */
  public getBudgetStatus() {
    return this.budgetEnforcer.getStatus();
  }

  /**
   * Reset budget counters
   */
  public resetBudget(): void {
    this.budgetEnforcer.reset();
  }

  /**
   * Get safety statistics
   */
  public getStats() {
    return {
      budget: this.budgetEnforcer.getStatus(),
      validation: {
        schemasCompiled: this.validators.size,
        strictMode: this.config.validation.strictMode
      },
      capabilities: this.capabilityIsolator.getStats(),
      depth: this.depthEnforcer.getStats()
    };
  }

  /**
   * Estimate token count for content
   */
  private estimateTokenCount(content: string): number {
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(content.length / 4);
  }

  /**
   * Estimate cost for step execution
   */
  private estimateCost(step: Step): number {
    // Base cost estimation - can be refined based on step type
    const baseCosts = {
      ocr: 0.001,    // $0.001 per OCR operation
      ner: 0.0005,   // $0.0005 per NER operation  
      route: 0.0001, // $0.0001 per route operation
      custom: 0.002  // $0.002 for custom operations
    };
    
    return baseCosts[step.type as keyof typeof baseCosts] || baseCosts.custom;
  }

  /**
   * Add custom schema validator
   */
  public addCustomValidator(name: string, schema: any): void {
    try {
      const validator = this.ajv.compile(schema);
      this.validators.set(name as SchemaType, validator);
    } catch (error) {
      throw new SafetyValidationError(
        `Failed to compile custom schema: ${name}`,
        'CUSTOM_SCHEMA_ERROR',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Remove custom validator
   */
  public removeCustomValidator(name: string): boolean {
    return this.validators.delete(name as SchemaType);
  }

  /**
   * Update safety configuration
   */
  public updateConfig(newConfig: Partial<SafetyConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.budgetLimits) {
      this.budgetEnforcer.updateLimits(newConfig.budgetLimits);
    }
    
    if (newConfig.depthLimits) {
      this.depthEnforcer.updateLimits(newConfig.depthLimits);
    }
    
    if (newConfig.capabilities) {
      this.capabilityIsolator.updateConfig(newConfig.capabilities);
    }
  }
}