import { z } from 'zod';
import { SchemaValidationResult, DomainConfig, BusinessConstraints, RulesetConfig } from '../types/index.js';

export class SchemaValidator {
  static validate<T>(schema: z.ZodSchema<T>, data: unknown): SchemaValidationResult & { data?: T } {
    try {
      const parsed = schema.parse(data);
      return {
        valid: true,
        errors: [],
        data: parsed
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
        };
      }
      return {
        valid: false,
        errors: [`Validation error: ${error}`]
      };
    }
  }

  static createErrorResponse(errors: string[], context?: string): { success: false; error: string; metadata: any } {
    return {
      success: false,
      error: `Validation failed${context ? ` (${context})` : ''}: ${errors.join('; ')}`,
      metadata: {
        processingTime: 0,
        costEstimate: {
          tokens: 0,
          computeUnits: 0,
          estimatedDurationMs: 0,
          complexity: 'low' as const
        },
        validationErrors: errors.map(error => ({ message: error, severity: 'error' as const }))
      }
    };
  }
}

export const ocrArgsSchema = z.object({
  imageUrl: z.string().url().or(z.string().min(1)),
  imageBuffer: z.instanceof(Buffer).optional(),
  options: z.object({
    language: z.string().default('eng'),
    psm: z.number().min(0).max(13).default(6),
    oem: z.number().min(0).max(3).default(1),
    whitelistChars: z.string().optional(),
    blacklistChars: z.string().optional(),
    qualityVsSpeed: z.enum(['quality', 'balanced', 'speed']).default('balanced'),
    dpi: z.number().min(72).max(600).default(300),
    preprocessingEnabled: z.boolean().default(true),
    rotationCorrection: z.boolean().default(true)
  }).default({}),
  casIntegration: z.object({
    enabled: z.boolean().default(false),
    endpoint: z.string().url().optional(),
    apiKey: z.string().optional(),
    ttl: z.number().min(300).max(86400).default(3600),
    compression: z.boolean().default(true),
    checksumValidation: z.boolean().default(true)
  }).default({ enabled: false })
});

export const nerArgsSchema = z.object({
  text: z.string().min(1),
  options: z.object({
    extractPersons: z.boolean().default(true),
    extractOrganizations: z.boolean().default(true),
    extractPlaces: z.boolean().default(true),
    extractDates: z.boolean().default(true),
    extractNumbers: z.boolean().default(false),
    customEntities: z.array(z.string()).default([]),
    confidenceThreshold: z.number().min(0).max(1).default(0.5),
    domain: z.enum(['legal', 'medical', 'financial', 'general']).default('general'),
    domainConfig: z.object({
      legal: z.object({
        extractCaseNumbers: z.boolean().default(true),
        extractStatutes: z.boolean().default(true),
        extractParties: z.boolean().default(true),
        confidenceBoost: z.number().min(0).max(0.3).default(0.1)
      }).optional(),
      medical: z.object({
        extractMedications: z.boolean().default(true),
        extractSymptoms: z.boolean().default(true),
        extractDiagnoses: z.boolean().default(true),
        confidenceBoost: z.number().min(0).max(0.3).default(0.1)
      }).optional(),
      financial: z.object({
        extractCurrencies: z.boolean().default(true),
        extractTickers: z.boolean().default(true),
        extractCompanies: z.boolean().default(true),
        confidenceBoost: z.number().min(0).max(0.3).default(0.1)
      }).optional()
    }).optional(),
    spanTracking: z.boolean().default(true),
    overlappingEntities: z.enum(['keep-all', 'highest-confidence', 'longest-match']).default('highest-confidence'),
    contextWindow: z.number().min(0).max(500).default(50)
  }).default({})
});

export const routeArgsSchema = z.object({
  request: z.object({
    path: z.string().min(1),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).default('GET'),
    headers: z.record(z.string()).default({}),
    body: z.any().optional(),
    query: z.record(z.string()).default({}),
    metadata: z.record(z.any()).optional()
  }),
  routes: z.array(z.object({
    id: z.string(),
    pattern: z.string(),
    methods: z.array(z.string()).default(['GET']),
    priority: z.number().default(0),
    weight: z.number().min(0.1).max(10).default(1),
    conditions: z.object({
      headers: z.record(z.string()).optional(),
      query: z.record(z.string()).optional(),
      body: z.any().optional(),
      customConditions: z.array(z.object({
        field: z.string(),
        operator: z.enum(['eq', 'ne', 'gt', 'lt', 'contains', 'regex', 'exists']),
        value: z.any()
      })).optional()
    }).optional(),
    actions: z.object({
      route: z.string(),
      transform: z.any().optional(),
      headers: z.record(z.string()).optional(),
      timeout: z.number().min(100).max(30000).optional(),
      retries: z.number().min(0).max(5).default(0)
    }).optional(),
    metadata: z.object({
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      owner: z.string().optional(),
      lastModified: z.date().optional()
    }).optional()
  })).min(1),
  options: z.object({
    strategy: z.enum(['priority', 'exact-match', 'pattern-match', 'weighted', 'adaptive']).default('priority'),
    fallbackRoute: z.string().optional(),
    enableCaching: z.boolean().default(true),
    cacheStrategy: z.enum(['none', 'memory', 'redis', 'hybrid']).default('memory'),
    cacheTTL: z.number().min(60).max(86400).default(3600),
    businessConstraints: z.object({
      maxCost: z.number().min(0).optional(),
      maxLatency: z.number().min(10).optional(),
      riskTolerance: z.enum(['low', 'medium', 'high']).default('medium'),
      priority: z.number().min(1).max(5).default(3),
      entityPriorities: z.record(z.number()).optional(),
      conflictResolution: z.enum(['first-match', 'best-score', 'priority', 'hybrid']).default('hybrid')
    }).optional(),
    rulesetConfig: z.object({
      name: z.string(),
      version: z.string().regex(/^\d+\.\d+\.\d+$/),
      fallbackStrategy: z.enum(['reject', 'default', 'last-match']).default('default'),
      validation: z.object({
        strictMode: z.boolean().default(false),
        allowCustomFields: z.boolean().default(true),
        maxRuleComplexity: z.number().min(1).max(10).default(5)
      }).optional()
    }).optional()
  }).default({})
});

// Enhanced validation functions
export class EnhancedValidator {
  static validateOCRArgs(data: unknown): SchemaValidationResult & { data?: OCRArgs } {
    const result = SchemaValidator.validate(ocrArgsSchema, data);
    
    // Additional business logic validation
    if (result.valid && result.data) {
      const errors: string[] = [];
      
      // Validate image URL/buffer requirement
      if (!result.data.imageUrl && !result.data.imageBuffer) {
        errors.push('Either imageUrl or imageBuffer must be provided');
      }
      
      // Validate CAS configuration
      if (result.data.casIntegration.enabled && !result.data.casIntegration.endpoint) {
        errors.push('CAS endpoint is required when CAS integration is enabled');
      }
      
      // DPI validation based on quality setting
      if (result.data.options.qualityVsSpeed === 'quality' && result.data.options.dpi < 150) {
        errors.push('Quality mode requires DPI >= 150 for optimal results');
      }
      
      if (errors.length > 0) {
        return { valid: false, errors };
      }
    }
    
    return result;
  }
  
  static validateNERArgs(data: unknown): SchemaValidationResult & { data?: NERArgs } {
    const result = SchemaValidator.validate(nerArgsSchema, data);
    
    if (result.valid && result.data) {
      const errors: string[] = [];
      
      // Validate text length limits
      if (result.data.text.length > 1000000) {
        errors.push('Text length exceeds maximum limit of 1,000,000 characters');
      }
      
      // Validate domain-specific configuration
      if (result.data.options.domain !== 'general' && !result.data.options.domainConfig) {
        errors.push(`Domain configuration required for domain: ${result.data.options.domain}`);
      }
      
      // Custom entity pattern validation
      for (const pattern of result.data.options.customEntities) {
        try {
          new RegExp(pattern);
        } catch (error) {
          errors.push(`Invalid regex pattern in customEntities: ${pattern}`);
        }
      }
      
      if (errors.length > 0) {
        return { valid: false, errors };
      }
    }
    
    return result;
  }
  
  static validateRouteArgs(data: unknown): SchemaValidationResult & { data?: RouteArgs } {
    const result = SchemaValidator.validate(routeArgsSchema, data);
    
    if (result.valid && result.data) {
      const errors: string[] = [];
      
      // Validate route pattern uniqueness
      const patterns = result.data.routes.map(r => r.pattern);
      const duplicates = patterns.filter((p, i) => patterns.indexOf(p) !== i);
      if (duplicates.length > 0) {
        errors.push(`Duplicate route patterns detected: ${duplicates.join(', ')}`);
      }
      
      // Validate fallback route exists
      if (result.data.options.fallbackRoute) {
        const fallbackExists = result.data.routes.some(r => r.id === result.data.options.fallbackRoute);
        if (!fallbackExists) {
          errors.push(`Fallback route '${result.data.options.fallbackRoute}' not found in routes`);
        }
      }
      
      // Validate business constraints consistency
      const bc = result.data.options.businessConstraints;
      if (bc && bc.maxLatency && bc.riskTolerance === 'low' && bc.maxLatency > 5000) {
        errors.push('Low risk tolerance requires maxLatency <= 5000ms');
      }
      
      if (errors.length > 0) {
        return { valid: false, errors };
      }
    }
    
    return result;
  }
}

export type OCRArgs = z.infer<typeof ocrArgsSchema>;
export type NERArgs = z.infer<typeof nerArgsSchema>;
export type RouteArgs = z.infer<typeof routeArgsSchema>;