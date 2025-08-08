import { z } from 'zod';
import { ValidationResult } from '../types/index.js';

export class SchemaValidator {
  static validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult & { data?: T } {
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

  static createErrorResponse(errors: string[]): { success: false; error: string; metadata: any } {
    return {
      success: false,
      error: `Validation failed: ${errors.join('; ')}`,
      metadata: {
        processingTime: 0,
        costEstimate: {
          tokens: 0,
          computeUnits: 0,
          estimatedDurationMs: 0,
          complexity: 'low' as const
        }
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
    blacklistChars: z.string().optional()
  }).default({}),
  casIntegration: z.object({
    enabled: z.boolean().default(false),
    endpoint: z.string().url().optional(),
    apiKey: z.string().optional()
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
    confidenceThreshold: z.number().min(0).max(1).default(0.5)
  }).default({})
});

export const routeArgsSchema = z.object({
  request: z.object({
    path: z.string().min(1),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
    headers: z.record(z.string()).default({}),
    body: z.any().optional(),
    query: z.record(z.string()).default({})
  }),
  routes: z.array(z.object({
    id: z.string(),
    pattern: z.string(),
    methods: z.array(z.string()).default(['GET']),
    priority: z.number().default(0),
    conditions: z.object({
      headers: z.record(z.string()).optional(),
      query: z.record(z.string()).optional(),
      body: z.any().optional()
    }).optional()
  })).min(1),
  options: z.object({
    strategy: z.enum(['priority', 'exact-match', 'pattern-match']).default('priority'),
    fallbackRoute: z.string().optional(),
    enableCaching: z.boolean().default(true)
  }).default({})
});

export type OCRArgs = z.infer<typeof ocrArgsSchema>;
export type NERArgs = z.infer<typeof nerArgsSchema>;
export type RouteArgs = z.infer<typeof routeArgsSchema>;