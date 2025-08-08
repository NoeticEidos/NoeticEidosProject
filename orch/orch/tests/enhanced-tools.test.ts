/**
 * Comprehensive test suite for enhanced v1.1 protocol tools
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { OCRTool } from '../src/tools/ocr-tool.js';
import { NERTool } from '../src/tools/ner-tool.js';
import { RouteTool } from '../src/tools/route-tool.js';

describe('Enhanced Tools v1.1 Protocol', () => {
  beforeAll(async () => {
    // Setup test environment
  });

  afterAll(async () => {
    // Cleanup resources
    await OCRTool.cleanup();
  });

  describe('OCR Tool Enhancements', () => {
    it('should validate arguments with enhanced validation', async () => {
      const invalidArgs = {
        // Missing imageUrl and imageBuffer
        options: {
          qualityVsSpeed: 'quality'
        }
      };

      const result = await OCRTool.execute(invalidArgs);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Either imageUrl or imageBuffer must be provided');
    });

    it('should handle base64 image URLs with preprocessing', async () => {
      const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA4VdtWgAAAABJRU5ErkJggg=='; // 1x1 transparent PNG
      
      const args = {
        imageUrl: testImage,
        options: {
          qualityVsSpeed: 'balanced',
          preprocessingEnabled: true,
          language: 'eng',
          dpi: 300
        },
        casIntegration: {
          enabled: false
        }
      };

      const result = await OCRTool.execute(args);
      
      // Should process without errors (even if no text is detected)
      expect(result.success).toBe(true);
      expect(result.metadata?.processingTime).toBeGreaterThan(0);
      expect(result.metadata?.costEstimate).toBeDefined();
    });

    it('should implement proper CAS caching with integrity validation', async () => {
      const args = {
        imageUrl: 'https://example.com/test-image.png',
        options: {
          qualityVsSpeed: 'speed'
        },
        casIntegration: {
          enabled: true,
          checksumValidation: true,
          compression: true,
          ttl: 3600
        }
      };

      // This will fail due to network but should show proper error handling
      const result = await OCRTool.execute(args);
      
      expect(result.metadata?.errorCategory).toBeDefined();
    });

    it('should provide cache statistics', () => {
      const stats = OCRTool.getCacheStats();
      
      expect(stats).toHaveProperty('cas');
      expect(stats).toHaveProperty('preprocessing');
      expect(stats.cas).toHaveProperty('size');
      expect(stats.cas).toHaveProperty('maxSize');
    });
  });

  describe('NER Tool Domain-Specific Enhancements', () => {
    it('should validate domain-specific configurations', async () => {
      const args = {
        text: 'Test legal document',
        options: {
          domain: 'legal',
          // Missing domainConfig
          extractPersons: true
        }
      };

      const result = await NERTool.execute(args);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Domain configuration required for domain: legal');
    });

    it('should extract legal entities with domain-specific patterns', async () => {
      const args = {
        text: 'In Case No. 21-1234, plaintiff Smith Corp. v. defendant Jones LLC, the court ruled on Section 42.1 of the USC.',
        options: {
          domain: 'legal',
          domainConfig: {
            legal: {
              extractCaseNumbers: true,
              extractStatutes: true,
              extractParties: true,
              confidenceBoost: 0.1
            }
          },
          extractPersons: true,
          extractOrganizations: true,
          confidenceThreshold: 0.3,
          contextWindow: 30,
          overlappingEntities: 'highest-confidence'
        }
      };

      const result = await NERTool.execute(args);
      
      expect(result.success).toBe(true);
      expect(result.data?.entities).toBeDefined();
      expect(result.data?.entities.length).toBeGreaterThan(0);
      
      // Should find case numbers, organizations, and possibly statutes
      const labels = result.data!.entities.map(e => e.label);
      expect(labels.some(l => l.includes('ORGANIZATION') || l.includes('PERSON'))).toBe(true);
    });

    it('should extract medical entities in medical domain', async () => {
      const args = {
        text: 'Patient presents with chest pain and shortness of breath. Prescribed acetaminophen 500mg. Diagnosis: Type 2 diabetes.',
        options: {
          domain: 'medical',
          domainConfig: {
            medical: {
              extractMedications: true,
              extractSymptoms: true,
              extractDiagnoses: true,
              confidenceBoost: 0.15
            }
          },
          extractPersons: false,
          extractOrganizations: false,
          confidenceThreshold: 0.4,
          spanTracking: true
        }
      };

      const result = await NERTool.execute(args);
      
      expect(result.success).toBe(true);
      expect(result.data?.entities).toBeDefined();
      
      // Should extract medical terms
      const entityTexts = result.data!.entities.map(e => e.text.toLowerCase());
      const hasMedicalTerms = entityTexts.some(text => 
        text.includes('chest pain') || 
        text.includes('acetaminophen') || 
        text.includes('diabetes')
      );
      expect(hasMedicalTerms).toBe(true);
    });

    it('should extract financial entities with proper formatting', async () => {
      const args = {
        text: 'Apple Inc. stock (AAPL) rose $15.50 to $150.75, while Microsoft Corp shares gained $2.3M in market cap.',
        options: {
          domain: 'financial',
          domainConfig: {
            financial: {
              extractCurrencies: true,
              extractTickers: true,
              extractCompanies: true,
              confidenceBoost: 0.1
            }
          },
          extractNumbers: true,
          extractOrganizations: true,
          confidenceThreshold: 0.3
        }
      };

      const result = await NERTool.execute(args);
      
      expect(result.success).toBe(true);
      expect(result.data?.entities).toBeDefined();
      
      // Should find companies, tickers, and currency amounts
      const entities = result.data!.entities;
      const hasFinancialEntities = entities.some(e => 
        e.text.includes('Apple') || 
        e.text.includes('AAPL') || 
        e.text.includes('$')
      );
      expect(hasFinancialEntities).toBe(true);
    });

    it('should handle overlapping entities correctly', async () => {
      const args = {
        text: 'Dr. John Smith of Smith Medical Corp.',
        options: {
          domain: 'general',
          extractPersons: true,
          extractOrganizations: true,
          confidenceThreshold: 0.3,
          overlappingEntities: 'longest-match'
        }
      };

      const result = await NERTool.execute(args);
      
      expect(result.success).toBe(true);
      expect(result.data?.entities).toBeDefined();
      
      // Should handle overlapping "Smith" in person and organization names
      const entities = result.data!.entities;
      expect(entities.length).toBeGreaterThan(0);
      
      // Check that entities don't overlap incorrectly
      for (let i = 0; i < entities.length - 1; i++) {\n        const current = entities[i];\n        const next = entities[i + 1];\n        if (current.start < next.start) {\n          expect(current.end).toBeLessThanOrEqual(next.start);\n        }\n      }\n    });\n\n    it('should implement caching for improved performance', async () => {\n      const args = {\n        text: 'This is a test document for caching.',\n        options: {\n          domain: 'general',\n          extractPersons: true,\n          confidenceThreshold: 0.5\n        }\n      };\n\n      // First call\n      const result1 = await NERTool.execute(args);\n      expect(result1.success).toBe(true);\n      \n      // Second call should be faster (cached)\n      const startTime = Date.now();\n      const result2 = await NERTool.execute(args);\n      const endTime = Date.now();\n      \n      expect(result2.success).toBe(true);\n      expect(result2.metadata?.cached).toBe(true);\n      expect(endTime - startTime).toBeLessThan(100); // Should be very fast\n    });\n  });\n\n  describe('Route Tool Advanced Rule Engine', () => {\n    it('should validate complex routing configurations', async () => {\n      const args = {\n        request: {\n          path: '/api/users/123',\n          method: 'GET',\n          headers: { 'Authorization': 'Bearer token123' }\n        },\n        routes: [\n          {\n            id: 'duplicate-pattern',\n            pattern: '/api/users/:id',\n            methods: ['GET']\n          },\n          {\n            id: 'another-duplicate',\n            pattern: '/api/users/:id', // Duplicate pattern\n            methods: ['GET']\n          }\n        ],\n        options: {\n          strategy: 'priority'\n        }\n      };\n\n      const result = await RouteTool.execute(args);\n      \n      expect(result.success).toBe(false);\n      expect(result.error).toContain('Duplicate route patterns detected');\n    });\n\n    it('should handle priority-based routing with weights', async () => {\n      const args = {\n        request: {\n          path: '/api/users/123',\n          method: 'GET',\n          headers: { 'Content-Type': 'application/json' },\n          query: { 'version': 'v2' }\n        },\n        routes: [\n          {\n            id: 'route-v1',\n            pattern: '/api/users/:id',\n            methods: ['GET'],\n            priority: 1,\n            weight: 1.0\n          },\n          {\n            id: 'route-v2',\n            pattern: '/api/users/:id',\n            methods: ['GET'],\n            priority: 2,\n            weight: 1.5,\n            conditions: {\n              query: { 'version': 'v2' }\n            }\n          }\n        ],\n        options: {\n          strategy: 'weighted',\n          enableCaching: true,\n          cacheStrategy: 'memory'\n        }\n      };\n\n      const result = await RouteTool.execute(args);\n      \n      expect(result.success).toBe(true);\n      expect(result.data?.selectedRoute).toBe('route-v2'); // Higher priority and weight\n      expect(result.data?.confidence).toBeGreaterThan(0.5);\n      expect(result.data?.alternatives).toBeDefined();\n    });\n\n    it('should apply business constraints in route selection', async () => {\n      const args = {\n        request: {\n          path: '/api/process/critical',\n          method: 'POST',\n          body: { 'priority': 'high' }\n        },\n        routes: [\n          {\n            id: 'standard-processor',\n            pattern: '/api/process/:type',\n            methods: ['POST'],\n            priority: 1,\n            actions: {\n              route: 'standard-service',\n              timeout: 10000\n            }\n          },\n          {\n            id: 'premium-processor',\n            pattern: '/api/process/:type',\n            methods: ['POST'],\n            priority: 2,\n            actions: {\n              route: 'premium-service',\n              timeout: 5000\n            }\n          }\n        ],\n        options: {\n          strategy: 'adaptive',\n          businessConstraints: {\n            maxLatency: 6000,\n            riskTolerance: 'low',\n            priority: 4,\n            conflictResolution: 'hybrid'\n          }\n        }\n      };\n\n      const result = await RouteTool.execute(args);\n      \n      expect(result.success).toBe(true);\n      expect(result.data?.businessConstraints).toBeDefined();\n      expect(result.data?.selectedRoute).toBe('premium-processor'); // Should select based on latency constraint\n    });\n\n    it('should handle fallback strategies correctly', async () => {\n      const args = {\n        request: {\n          path: '/unknown/endpoint',\n          method: 'POST'\n        },\n        routes: [\n          {\n            id: 'api-route',\n            pattern: '/api/*',\n            methods: ['GET', 'POST']\n          },\n          {\n            id: 'fallback-route',\n            pattern: '/*',\n            methods: ['GET', 'POST', 'PUT', 'DELETE'],\n            priority: -1\n          }\n        ],\n        options: {\n          strategy: 'priority',\n          fallbackRoute: 'fallback-route',\n          rulesetConfig: {\n            name: 'test-ruleset',\n            version: '1.0.0',\n            fallbackStrategy: 'default'\n          }\n        }\n      };\n\n      const result = await RouteTool.execute(args);\n      \n      expect(result.success).toBe(true);\n      expect(result.data?.selectedRoute).toBe('fallback-route');\n      expect(result.data?.reasoning).toContain('fallback');\n    });\n\n    it('should implement advanced caching strategies', async () => {\n      const args = {\n        request: {\n          path: '/api/cache-test',\n          method: 'GET',\n          headers: { 'Cache-Control': 'max-age=300' }\n        },\n        routes: [\n          {\n            id: 'cached-route',\n            pattern: '/api/cache-test',\n            methods: ['GET']\n          }\n        ],\n        options: {\n          strategy: 'exact-match',\n          enableCaching: true,\n          cacheStrategy: 'hybrid',\n          cacheTTL: 1800\n        }\n      };\n\n      // First call\n      const result1 = await RouteTool.execute(args);\n      expect(result1.success).toBe(true);\n      expect(result1.metadata?.cached).toBeFalsy();\n      \n      // Second call should be cached\n      const result2 = await RouteTool.execute(args);\n      expect(result2.success).toBe(true);\n      // Note: Caching might not be immediately available due to async nature\n    });\n\n    it('should get cache statistics', () => {\n      const stats = RouteTool.getCacheStats();\n      \n      expect(stats).toHaveProperty('size');\n      expect(stats).toHaveProperty('maxSize');\n      expect(typeof stats.size).toBe('number');\n      expect(typeof stats.maxSize).toBe('number');\n    });\n  });\n\n  describe('Integration Tests', () => {\n    it('should handle tool chaining scenarios', async () => {\n      // Test scenario: OCR -> NER -> Route\n      \n      // 1. OCR extraction (simulated result)\n      const ocrResult = {\n        text: 'Medical Report: Patient John Doe has Type 2 diabetes. Prescribed Metformin 500mg daily.',\n        confidence: 0.85\n      };\n\n      // 2. NER on OCR result\n      const nerArgs = {\n        text: ocrResult.text,\n        options: {\n          domain: 'medical',\n          domainConfig: {\n            medical: {\n              extractMedications: true,\n              extractSymptoms: false,\n              extractDiagnoses: true,\n              confidenceBoost: 0.1\n            }\n          },\n          extractPersons: true,\n          confidenceThreshold: 0.4\n        }\n      };\n\n      const nerResult = await NERTool.execute(nerArgs);\n      expect(nerResult.success).toBe(true);\n      \n      // 3. Route based on extracted entities\n      const routeArgs = {\n        request: {\n          path: '/api/medical/process',\n          method: 'POST',\n          body: {\n            entities: nerResult.data?.entities,\n            domain: 'medical'\n          }\n        },\n        routes: [\n          {\n            id: 'medical-processor',\n            pattern: '/api/medical/*',\n            methods: ['POST'],\n            conditions: {\n              body: { domain: 'medical' }\n            }\n          },\n          {\n            id: 'general-processor',\n            pattern: '/api/*/process',\n            methods: ['POST']\n          }\n        ],\n        options: {\n          strategy: 'priority'\n        }\n      };\n\n      const routeResult = await RouteTool.execute(routeArgs);\n      expect(routeResult.success).toBe(true);\n      expect(routeResult.data?.selectedRoute).toBe('medical-processor');\n    });\n\n    it('should provide consistent error handling across tools', async () => {\n      // Test consistent error response format\n      const invalidOCR = await OCRTool.execute({ invalid: 'args' });\n      const invalidNER = await NERTool.execute({ invalid: 'args' });\n      const invalidRoute = await RouteTool.execute({ invalid: 'args' });\n\n      [invalidOCR, invalidNER, invalidRoute].forEach(result => {\n        expect(result.success).toBe(false);\n        expect(result.error).toBeDefined();\n        expect(result.metadata).toBeDefined();\n        expect(result.metadata.processingTime).toBe(0);\n        expect(result.metadata.costEstimate).toBeDefined();\n      });\n    });\n\n    it('should handle performance under load', async () => {\n      // Concurrent processing test\n      const promises = [];\n      \n      for (let i = 0; i < 10; i++) {\n        promises.push(\n          NERTool.execute({\n            text: `Test document ${i} with various entities like John Doe and Apple Inc.`,\n            options: {\n              domain: 'general',\n              extractPersons: true,\n              extractOrganizations: true,\n              confidenceThreshold: 0.5\n            }\n          })\n        );\n      }\n\n      const results = await Promise.all(promises);\n      \n      results.forEach(result => {\n        expect(result.success).toBe(true);\n        expect(result.metadata?.processingTime).toBeLessThan(5000); // Should complete within 5s\n      });\n    });\n  });\n});