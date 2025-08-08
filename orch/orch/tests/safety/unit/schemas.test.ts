/**
 * Unit tests for JSON schemas validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Ajv, { JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';
import { 
  OCR_SCHEMA, 
  NER_SCHEMA, 
  ROUTE_SCHEMA, 
  ALL_SCHEMAS,
  OCRData,
  NERData, 
  RouteData
} from '../../../src/safety/schemas/index.js';

describe('JSON Schemas', () => {
  let ajv: Ajv;

  beforeEach(() => {
    ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
  });

  describe('OCR Schema', () => {
    it('should validate valid OCR data', () => {
      const validator = ajv.compile(OCR_SCHEMA as JSONSchemaType<OCRData>);
      
      const validData: OCRData = {
        text: 'Sample extracted text',
        confidence: 0.95,
        boundingBoxes: [
          {
            x: 10,
            y: 20,
            width: 100,
            height: 30,
            text: 'Sample',
            confidence: 0.98
          }
        ],
        metadata: {
          pageNumber: 1,
          processingTime: 1500,
          imageSize: {
            width: 800,
            height: 600
          }
        }
      };

      const isValid = validator(validData);
      expect(isValid).toBe(true);
      expect(validator.errors).toBeNull();
    });

    it('should reject OCR data with missing required fields', () => {
      const validator = ajv.compile(OCR_SCHEMA as JSONSchemaType<OCRData>);
      
      const invalidData = {
        confidence: 0.95
        // missing required 'text' field
      };

      const isValid = validator(invalidData);
      expect(isValid).toBe(false);
      expect(validator.errors).toHaveLength(1);
      expect(validator.errors![0].message).toContain("must have required property 'text'");
    });

    it('should reject OCR data with invalid confidence range', () => {
      const validator = ajv.compile(OCR_SCHEMA as JSONSchemaType<OCRData>);
      
      const invalidData = {
        text: 'Test',
        confidence: 1.5 // invalid: > 1
      };

      const isValid = validator(invalidData);
      expect(isValid).toBe(false);
      expect(validator.errors![0].message).toContain('must be <= 1');
    });

    it('should reject OCR data with invalid bounding box', () => {
      const validator = ajv.compile(OCR_SCHEMA as JSONSchemaType<OCRData>);
      
      const invalidData = {
        text: 'Test',
        confidence: 0.9,
        boundingBoxes: [
          {
            x: -5, // invalid: negative
            y: 10,
            width: 100,
            height: 20,
            text: 'Test',
            confidence: 0.8
          }
        ]
      };

      const isValid = validator(invalidData);
      expect(isValid).toBe(false);
      expect(validator.errors![0].message).toContain('must be >= 0');
    });

    it('should validate minimal valid OCR data', () => {
      const validator = ajv.compile(OCR_SCHEMA as JSONSchemaType<OCRData>);
      
      const minimalData: OCRData = {
        text: 'Minimal text',
        confidence: 0.5
      };

      const isValid = validator(minimalData);
      expect(isValid).toBe(true);
    });
  });

  describe('NER Schema', () => {
    it('should validate valid NER data', () => {
      const validator = ajv.compile(NER_SCHEMA as JSONSchemaType<NERData>);
      
      const validData: NERData = {
        entities: [
          {
            text: 'John Smith',
            label: 'PERSON',
            start: 0,
            end: 10,
            confidence: 0.98,
            metadata: {
              normalized: 'john-smith',
              linkedEntity: 'https://example.com/person/john-smith',
              alternativeLabels: ['INDIVIDUAL', 'NAME']
            }
          },
          {
            text: '$100',
            label: 'MONEY',
            start: 20,
            end: 24,
            confidence: 0.95
          }
        ],
        originalText: 'John Smith paid $100 for the service',
        processingMetadata: {
          model: 'spacy-en-core-web-sm',
          version: '3.4.0',
          processingTime: 250,
          language: 'en-US'
        }
      };

      const isValid = validator(validData);
      expect(isValid).toBe(true);
      expect(validator.errors).toBeNull();
    });

    it('should reject NER data with invalid entity label', () => {
      const validator = ajv.compile(NER_SCHEMA as JSONSchemaType<NERData>);
      
      const invalidData = {
        entities: [
          {
            text: 'Test',
            label: 'INVALID_LABEL', // not in allowed enum
            start: 0,
            end: 4,
            confidence: 0.9
          }
        ],
        originalText: 'Test text'
      };

      const isValid = validator(invalidData);
      expect(isValid).toBe(false);
      expect(validator.errors![0].message).toContain('must be equal to one of the allowed values');
    });

    it('should reject NER data with invalid language format', () => {
      const validator = ajv.compile(NER_SCHEMA as JSONSchemaType<NERData>);
      
      const invalidData = {
        entities: [],
        originalText: 'Test',
        processingMetadata: {
          language: 'english' // invalid format, should be 'en' or 'en-US'
        }
      };

      const isValid = validator(invalidData);
      expect(isValid).toBe(false);
      expect(validator.errors![0].message).toContain('must match pattern');
    });

    it('should validate minimal valid NER data', () => {
      const validator = ajv.compile(NER_SCHEMA as JSONSchemaType<NERData>);
      
      const minimalData: NERData = {
        entities: [],
        originalText: 'No entities found'
      };

      const isValid = validator(minimalData);
      expect(isValid).toBe(true);
    });
  });

  describe('Route Schema', () => {
    it('should validate valid Route data', () => {
      const validator = ajv.compile(ROUTE_SCHEMA as JSONSchemaType<RouteData>);
      
      const validData: RouteData = {
        path: '/api/v1/users',
        method: 'POST',
        parameters: {
          query: {
            limit: 10,
            offset: 0,
            active: true,
            tags: ['admin', 'user']
          },
          path: {
            userId: 123
          },
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token123'
          }
        },
        body: {
          contentType: 'application/json',
          data: {
            name: 'John Doe',
            email: 'john@example.com'
          },
          size: 1024
        },
        timeout: 5000,
        retries: 3,
        authentication: {
          type: 'bearer',
          credentials: 'secret-token',
          scope: 'user:write'
        },
        validation: {
          expectedStatus: [200, 201],
          maxResponseSize: 1048576
        }
      };

      const isValid = validator(validData);
      expect(isValid).toBe(true);
      expect(validator.errors).toBeNull();
    });

    it('should reject Route data with invalid path format', () => {
      const validator = ajv.compile(ROUTE_SCHEMA as JSONSchemaType<RouteData>);
      
      const invalidData = {
        path: 'invalid-path', // must start with /
        method: 'GET'
      };

      const isValid = validator(invalidData);
      expect(isValid).toBe(false);
      expect(validator.errors![0].message).toContain('must match pattern');
    });

    it('should reject Route data with invalid HTTP method', () => {
      const validator = ajv.compile(ROUTE_SCHEMA as JSONSchemaType<RouteData>);
      
      const invalidData = {
        path: '/api/test',
        method: 'INVALID' // not in allowed enum
      };

      const isValid = validator(invalidData);
      expect(isValid).toBe(false);
      expect(validator.errors![0].message).toContain('must be equal to one of the allowed values');
    });

    it('should reject Route data with oversized body', () => {
      const validator = ajv.compile(ROUTE_SCHEMA as JSONSchemaType<RouteData>);
      
      const invalidData = {
        path: '/api/upload',
        method: 'POST',
        body: {
          contentType: 'application/json',
          data: { test: 'data' },
          size: 20971520 // > 10MB limit
        }
      };

      const isValid = validator(invalidData);
      expect(isValid).toBe(false);
      expect(validator.errors![0].message).toContain('must be <= 10485760');
    });

    it('should reject Route data with invalid timeout range', () => {
      const validator = ajv.compile(ROUTE_SCHEMA as JSONSchemaType<RouteData>);
      
      const invalidData = {
        path: '/api/test',
        method: 'GET',
        timeout: 50 // < 100ms minimum
      };

      const isValid = validator(invalidData);
      expect(isValid).toBe(false);
      expect(validator.errors![0].message).toContain('must be >= 100');
    });

    it('should validate minimal valid Route data', () => {
      const validator = ajv.compile(ROUTE_SCHEMA as JSONSchemaType<RouteData>);
      
      const minimalData: RouteData = {
        path: '/simple',
        method: 'GET'
      };

      const isValid = validator(minimalData);
      expect(isValid).toBe(true);
    });
  });

  describe('Schema Compilation', () => {
    it('should compile all schemas successfully', () => {
      expect(() => {
        for (const [name, schema] of Object.entries(ALL_SCHEMAS)) {
          const validator = ajv.compile(schema as JSONSchemaType<any>);
          expect(validator).toBeDefined();
        }
      }).not.toThrow();
    });

    it('should have correct schema names in ALL_SCHEMAS', () => {
      expect(Object.keys(ALL_SCHEMAS)).toEqual(['ocr', 'ner', 'route']);
    });

    it('should validate schema properties are defined', () => {
      expect(OCR_SCHEMA.type).toBe('object');
      expect(OCR_SCHEMA.required).toContain('text');
      expect(OCR_SCHEMA.required).toContain('confidence');

      expect(NER_SCHEMA.type).toBe('object');
      expect(NER_SCHEMA.required).toContain('entities');
      expect(NER_SCHEMA.required).toContain('originalText');

      expect(ROUTE_SCHEMA.type).toBe('object');
      expect(ROUTE_SCHEMA.required).toContain('path');
      expect(ROUTE_SCHEMA.required).toContain('method');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty arrays in schemas', () => {
      const nerValidator = ajv.compile(NER_SCHEMA as JSONSchemaType<NERData>);
      
      const dataWithEmptyEntities: NERData = {
        entities: [],
        originalText: 'No entities found'
      };

      expect(nerValidator(dataWithEmptyEntities)).toBe(true);
    });

    it('should handle maximum values correctly', () => {
      const routeValidator = ajv.compile(ROUTE_SCHEMA as JSONSchemaType<RouteData>);
      
      const dataWithMaxValues: RouteData = {
        path: '/test',
        method: 'POST',
        timeout: 300000, // max allowed
        retries: 5, // max allowed
        body: {
          contentType: 'application/json',
          data: { test: 'data' },
          size: 10485760 // max allowed (10MB)
        }
      };

      expect(routeValidator(dataWithMaxValues)).toBe(true);
    });

    it('should reject additional properties when configured', () => {
      const strictAjv = new Ajv({ strict: true, additionalProperties: false });
      addFormats(strictAjv);
      
      const validator = strictAjv.compile(OCR_SCHEMA as JSONSchemaType<OCRData>);
      
      const dataWithExtraProps = {
        text: 'Test',
        confidence: 0.9,
        extraProperty: 'not allowed' // should be rejected
      };

      const isValid = validator(dataWithExtraProps);
      expect(isValid).toBe(false);
    });
  });
});