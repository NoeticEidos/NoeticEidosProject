/**
 * Unit Tests for Schema Validation System
 * Tests AJV validation, safety constraints, and error handling
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SafetyManager, SafetyConfig, Step, ValidationResult } from '../../safety/managers/SafetyManager.js';
import { ALL_SCHEMAS, SchemaType } from '../../safety/schemas/index.js';
import { BudgetLimits } from '../../safety/enforcers/BudgetEnforcer.js';

describe('Schema Validation System', () => {
  let safetyManager: SafetyManager;
  let defaultConfig: SafetyConfig;

  beforeEach(() => {
    defaultConfig = {
      budgetLimits: {
        tokenLimit: 10000,
        costLimit: 100,
        requestLimit: 50,
        timeLimit: 300000, // 5 minutes
        memoryLimit: 1024 * 1024 * 100, // 100MB
        concurrencyLimit: 10
      },
      depthLimits: {
        maxDepth: 10,
        maxBranching: 5
      },
      capabilities: {
        allowed: ['ocr', 'ner', 'route'],
        restricted: ['admin', 'system'],
        requireApproval: ['sensitive']
      },
      validation: {
        strictMode: true,
        allowUnknownProperties: false,
        coerceTypes: false
      }
    };

    safetyManager = new SafetyManager(defaultConfig);
  });

  afterEach(() => {
    // Cleanup any state
  });

  describe('OCR Schema Validation', () => {
    it('should validate valid OCR data', async () => {
      const validStep: Step = {
        id: 'test-ocr-1',
        type: 'ocr',
        args_json: JSON.stringify({
          text: 'Hello World',
          confidence: 0.95,
          boundingBoxes: [
            {
              x: 10,
              y: 20,
              width: 100,
              height: 30,
              text: 'Hello',
              confidence: 0.98
            }
          ]
        }),
        metadata: {
          timestamp: Date.now(),
          userId: 'test-user',
          depth: 1
        }
      };

      const result = await safetyManager.validateStep(validStep);
      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.sanitizedData).toBeDefined();
      expect(result.sanitizedData.text).toBe('Hello World');
    });

    it('should reject OCR data with invalid confidence range', async () => {
      const invalidStep: Step = {
        id: 'test-ocr-2',
        type: 'ocr',
        args_json: JSON.stringify({
          text: 'Hello World',
          confidence: 1.5 // Invalid: > 1
        })
      };

      const result = await safetyManager.validateStep(invalidStep);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        expect.stringMatching(/confidence.*maximum/)
      );
    });

    it('should reject OCR data missing required fields', async () => {
      const invalidStep: Step = {
        id: 'test-ocr-3',
        type: 'ocr',
        args_json: JSON.stringify({
          text: 'Hello World'
          // Missing confidence
        })
      };

      const result = await safetyManager.validateStep(invalidStep);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        expect.stringMatching(/confidence.*required/)
      );
    });

    it('should validate complex OCR data with metadata', async () => {
      const complexStep: Step = {
        id: 'test-ocr-4',
        type: 'ocr',
        args_json: JSON.stringify({
          text: 'Complex document text with multiple elements',
          confidence: 0.89,
          boundingBoxes: [
            {
              x: 0,
              y: 0,
              width: 200,
              height: 50,
              text: 'Header Text',
              confidence: 0.95
            },
            {
              x: 0,
              y: 60,
              width: 180,
              height: 30,
              text: 'Body Content',
              confidence: 0.88
            }
          ],
          metadata: {
            pageNumber: 1,
            processingTime: 1250,
            imageSize: {
              width: 800,
              height: 600
            }
          }
        })
      };

      const result = await safetyManager.validateStep(complexStep);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedData.boundingBoxes).toHaveLength(2);
      expect(result.sanitizedData.metadata.pageNumber).toBe(1);
    });
  });

  describe('NER Schema Validation', () => {
    it('should validate valid NER data', async () => {
      const validStep: Step = {
        id: 'test-ner-1',
        type: 'ner',
        args_json: JSON.stringify({
          entities: [
            {
              text: 'John Doe',
              label: 'PERSON',
              start: 0,
              end: 8,
              confidence: 0.95
            },
            {
              text: 'Apple Inc.',
              label: 'ORG',
              start: 20,
              end: 30,
              confidence: 0.88
            }
          ],
          originalText: 'John Doe works at Apple Inc.'
        })
      };

      const result = await safetyManager.validateStep(validStep);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedData.entities).toHaveLength(2);
      expect(result.sanitizedData.entities[0].label).toBe('PERSON');
    });

    it('should reject NER data with invalid entity labels', async () => {
      const invalidStep: Step = {
        id: 'test-ner-2',
        type: 'ner',
        args_json: JSON.stringify({
          entities: [
            {
              text: 'John Doe',
              label: 'INVALID_LABEL', // Not in enum
              start: 0,
              end: 8,
              confidence: 0.95
            }
          ],
          originalText: 'John Doe'
        })
      };

      const result = await safetyManager.validateStep(invalidStep);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        expect.stringMatching(/label.*enum/)
      );
    });

    it('should validate NER data with metadata', async () => {
      const metadataStep: Step = {
        id: 'test-ner-3',
        type: 'ner',
        args_json: JSON.stringify({
          entities: [
            {
              text: '$100',
              label: 'MONEY',
              start: 15,
              end: 19,
              confidence: 0.92,
              metadata: {
                normalized: '100 USD',
                alternativeLabels: ['CURRENCY']
              }
            }
          ],
          originalText: 'The cost is $100',
          processingMetadata: {
            model: 'spacy-en-core-web-sm',
            version: '3.4.1',
            processingTime: 45,
            language: 'en-US'
          }
        })
      };

      const result = await safetyManager.validateStep(metadataStep);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedData.entities[0].metadata.normalized).toBe('100 USD');
      expect(result.sanitizedData.processingMetadata.model).toBe('spacy-en-core-web-sm');
    });
  });

  describe('Route Schema Validation', () => {
    it('should validate valid route data', async () => {
      const validStep: Step = {
        id: 'test-route-1',
        type: 'route',
        args_json: JSON.stringify({
          path: '/api/v1/users',
          method: 'GET',
          parameters: {
            query: {
              page: 1,
              limit: 10,
              active: true
            },
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer token123'
            }
          },
          timeout: 5000,
          retries: 3
        })
      };

      const result = await safetyManager.validateStep(validStep);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedData.method).toBe('GET');
      expect(result.sanitizedData.parameters.query.page).toBe(1);
    });

    it('should reject route with invalid HTTP method', async () => {
      const invalidStep: Step = {
        id: 'test-route-2',
        type: 'route',
        args_json: JSON.stringify({
          path: '/api/test',
          method: 'INVALID' // Not in enum
        })
      };

      const result = await safetyManager.validateStep(invalidStep);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        expect.stringMatching(/method.*enum/)
      );
    });

    it('should reject route with invalid path pattern', async () => {
      const invalidStep: Step = {
        id: 'test-route-3',
        type: 'route',
        args_json: JSON.stringify({
          path: 'invalid-path', // Must start with /
          method: 'GET'
        })
      };

      const result = await safetyManager.validateStep(invalidStep);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        expect.stringMatching(/path.*pattern/)
      );
    });

    it('should validate route with body and authentication', async () => {
      const complexStep: Step = {
        id: 'test-route-4',
        type: 'route',
        args_json: JSON.stringify({
          path: '/api/v1/users',
          method: 'POST',
          body: {
            contentType: 'application/json',
            data: {
              name: 'John Doe',
              email: 'john@example.com'
            },
            size: 256
          },
          authentication: {
            type: 'bearer',
            credentials: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            scope: 'user:write'
          },
          validation: {
            expectedStatus: [200, 201],
            maxResponseSize: 1048576
          }
        })
      };

      const result = await safetyManager.validateStep(complexStep);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedData.body.contentType).toBe('application/json');
      expect(result.sanitizedData.authentication.type).toBe('bearer');
    });
  });

  describe('Custom Step Types', () => {
    it('should handle custom step types with warnings', async () => {
      const customStep: Step = {
        id: 'test-custom-1',
        type: 'custom',
        args_json: JSON.stringify({
          customField: 'value',
          anyStructure: {
            nested: true,
            array: [1, 2, 3]
          }
        })
      };

      const result = await safetyManager.validateStep(customStep);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        expect.stringMatching(/custom.*schema.*validation/i)
      );
    });

    it('should reject unknown step types', async () => {
      const unknownStep: Step = {
        id: 'test-unknown-1',
        type: 'unknown' as any,
        args_json: JSON.stringify({
          data: 'test'
        })
      };

      const result = await safetyManager.validateStep(unknownStep);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        expect.stringMatching(/unknown step type/i)
      );
    });
  });

  describe('JSON Parsing Validation', () => {
    it('should reject steps with invalid JSON', async () => {
      const invalidJsonStep: Step = {
        id: 'test-json-1',
        type: 'ocr',
        args_json: '{"text": "test", invalid}' // Malformed JSON
      };

      const result = await safetyManager.validateStep(invalidJsonStep);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        expect.stringMatching(/invalid json/i)
      );
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple steps correctly', async () => {
      const steps: Step[] = [
        {
          id: 'batch-1',
          type: 'ocr',
          args_json: JSON.stringify({ text: 'Test 1', confidence: 0.9 })
        },
        {
          id: 'batch-2',
          type: 'ner',
          args_json: JSON.stringify({
            entities: [],
            originalText: 'Test 2'
          })
        },
        {
          id: 'batch-3',
          type: 'route',
          args_json: JSON.stringify({ path: '/test', method: 'GET' })
        }
      ];

      const results = await safetyManager.validateSteps(steps);
      expect(results).toHaveLength(3);
      expect(results.every(r => r.isValid)).toBe(true);
    });

    it('should enforce branching limits', async () => {
      // Create more steps than the branching limit
      const steps: Step[] = Array.from({ length: 10 }, (_, i) => ({
        id: `batch-${i}`,
        type: 'ocr',
        args_json: JSON.stringify({ text: `Test ${i}`, confidence: 0.9 })
      }));

      const results = await safetyManager.validateSteps(steps);
      expect(results).toHaveLength(10);
      expect(results.every(r => !r.isValid)).toBe(true);
      expect(results[0].errors).toContain(
        expect.stringMatching(/branching limit exceeded/i)
      );
    });
  });

  describe('Configuration Flexibility', () => {
    it('should respect strict mode settings', async () => {
      const lenientConfig = {
        ...defaultConfig,
        validation: {
          strictMode: false,
          allowUnknownProperties: true,
          coerceTypes: true
        }
      };

      const lenientManager = new SafetyManager(lenientConfig);
      
      const stepWithExtra: Step = {
        id: 'lenient-1',
        type: 'ocr',
        args_json: JSON.stringify({
          text: 'Test',
          confidence: 0.9,
          extraField: 'should be allowed' // Extra field
        })
      };

      const result = await lenientManager.validateStep(stepWithExtra);
      expect(result.isValid).toBe(true);
    });

    it('should enforce strict mode properly', async () => {
      const stepWithExtra: Step = {
        id: 'strict-1',
        type: 'ocr',
        args_json: JSON.stringify({
          text: 'Test',
          confidence: 0.9,
          extraField: 'should be rejected'
        })
      };

      const result = await safetyManager.validateStep(stepWithExtra);
      expect(result.isValid).toBe(false);
    });
  });

  describe('Custom Schema Management', () => {
    it('should allow adding custom validators', () => {
      const customSchema = {
        type: 'object',
        properties: {
          customField: { type: 'string' }
        },
        required: ['customField']
      };

      expect(() => {
        safetyManager.addCustomValidator('custom-type', customSchema);
      }).not.toThrow();
    });

    it('should allow removing custom validators', () => {
      const customSchema = {
        type: 'object',
        properties: {
          customField: { type: 'string' }
        },
        required: ['customField']
      };

      safetyManager.addCustomValidator('removable', customSchema);
      const removed = safetyManager.removeCustomValidator('removable');
      expect(removed).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      const problematicStep: Step = {
        id: 'error-1',
        type: 'ocr',
        args_json: JSON.stringify({
          text: null, // Invalid type
          confidence: 'invalid' // Invalid type
        })
      };

      const result = await safetyManager.validateStep(problematicStep);
      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide validation statistics', () => {
      const stats = safetyManager.getStats();
      expect(stats).toHaveProperty('validation');
      expect(stats.validation.schemasCompiled).toBeGreaterThan(0);
      expect(stats.validation.strictMode).toBe(true);
    });
  });
});
