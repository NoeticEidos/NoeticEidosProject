#!/usr/bin/env node
/**
 * Schema Validation Demonstration
 * Shows comprehensive schema validation with various data scenarios
 */

import { SafetyManager, SafetyConfig, Step, ValidationResult } from '../../safety/managers/SafetyManager.js';
import { ALL_SCHEMAS } from '../../safety/schemas/index.js';
import * as fs from 'fs';

class SchemaValidationDemo {
  private safetyManager: SafetyManager;

  constructor() {
    const safetyConfig: SafetyConfig = {
      budgetLimits: {
        tokenLimit: 10000,
        costLimit: 10,
        requestLimit: 50,
        timeLimit: 300000,
        memoryLimit: 1024 * 1024 * 100,
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

    this.safetyManager = new SafetyManager(safetyConfig);
  }

  async runDemo(): Promise<void> {
    console.log('\n📋 Schema Validation Demonstration');
    console.log('='.repeat(50));

    try {
      await this.demonstrateSchemaOverview();
      await this.demonstrateValidOCRData();
      await this.demonstrateInvalidOCRData();
      await this.demonstrateValidNERData();
      await this.demonstrateInvalidNERData();
      await this.demonstrateValidRouteData();
      await this.demonstrateInvalidRouteData();
      await this.demonstrateEdgeCases();
      await this.demonstrateBatchValidation();
      await this.demonstrateCustomSchemas();
      
      console.log('\n✅ Schema Validation Demo Completed Successfully');
    } catch (error) {
      console.error('\n❌ Demo failed:', error);
      throw error;
    }
  }

  private async demonstrateSchemaOverview(): Promise<void> {
    console.log('\n🚀 1. Schema Overview');
    console.log('-'.repeat(25));

    console.log('Available schemas:');
    Object.keys(ALL_SCHEMAS).forEach(schemaName => {
      console.log(`  • ${schemaName}`);
    });

    const stats = this.safetyManager.getStats();
    console.log(`\nValidation system status:`);
    console.log(`  Schemas compiled: ${stats.validation.schemasCompiled}`);
    console.log(`  Strict mode: ${stats.validation.strictMode}`);
    console.log(`  Budget system: ${stats.budget ? 'enabled' : 'disabled'}`);
  }

  private async demonstrateValidOCRData(): Promise<void> {
    console.log('\n🟢 2. Valid OCR Data Validation');
    console.log('-'.repeat(35));

    const validOCRExamples = [
      {
        name: 'Basic OCR Result',
        data: {
          text: 'Hello, World! This is extracted text.',
          confidence: 0.95
        }
      },
      {
        name: 'OCR with Bounding Boxes',
        data: {
          text: 'Invoice #12345\nDate: 2024-12-08\nAmount: $1,234.56',
          confidence: 0.91,
          boundingBoxes: [
            {
              x: 10,
              y: 20,
              width: 150,
              height: 25,
              text: 'Invoice #12345',
              confidence: 0.98
            },
            {
              x: 10,
              y: 50,
              width: 120,
              height: 20,
              text: 'Date: 2024-12-08',
              confidence: 0.94
            }
          ]
        }
      },
      {
        name: 'OCR with Complete Metadata',
        data: {
          text: 'Complex document with multiple pages and detailed analysis.',
          confidence: 0.87,
          boundingBoxes: [
            {
              x: 0,
              y: 0,
              width: 200,
              height: 300,
              text: 'Full page content',
              confidence: 0.87
            }
          ],
          metadata: {
            pageNumber: 1,
            processingTime: 2450,
            imageSize: {
              width: 800,
              height: 1200
            }
          }
        }
      }
    ];

    for (const example of validOCRExamples) {
      const step: Step = {
        id: `valid-ocr-${Date.now()}`,
        type: 'ocr',
        args_json: JSON.stringify(example.data)
      };

      const result = await this.safetyManager.validateStep(step);
      console.log(`  ✓ ${example.name}: ${result.isValid ? 'VALID' : 'INVALID'}`);
      
      if (result.isValid && result.sanitizedData) {
        console.log(`    Text length: ${result.sanitizedData.text.length} chars`);
        console.log(`    Confidence: ${result.sanitizedData.confidence}`);
        if (result.sanitizedData.boundingBoxes) {
          console.log(`    Bounding boxes: ${result.sanitizedData.boundingBoxes.length}`);
        }
      }
    }
  }

  private async demonstrateInvalidOCRData(): Promise<void> {
    console.log('\n🔴 3. Invalid OCR Data Rejection');
    console.log('-'.repeat(35));

    const invalidOCRExamples = [
      {
        name: 'Missing Required Text',
        data: {
          confidence: 0.95
          // Missing 'text' field
        },
        expectedError: 'text.*required'
      },
      {
        name: 'Invalid Confidence Range',
        data: {
          text: 'Test text',
          confidence: 1.5 // > 1.0
        },
        expectedError: 'confidence.*maximum'
      },
      {
        name: 'Invalid Bounding Box Coordinates',
        data: {
          text: 'Test text',
          confidence: 0.9,
          boundingBoxes: [
            {
              x: -10, // Negative coordinate
              y: 20,
              width: 100,
              height: 30,
              text: 'Test',
              confidence: 0.8
            }
          ]
        },
        expectedError: 'x.*minimum'
      },
      {
        name: 'Extra Properties (Strict Mode)',
        data: {
          text: 'Test text',
          confidence: 0.9,
          extraProperty: 'This should not be allowed'
        },
        expectedError: 'additionalProperties'
      },
      {
        name: 'Wrong Data Types',
        data: {
          text: 123, // Should be string
          confidence: 'high' // Should be number
        },
        expectedError: 'type'
      }
    ];

    for (const example of invalidOCRExamples) {
      const step: Step = {
        id: `invalid-ocr-${Date.now()}`,
        type: 'ocr',
        args_json: JSON.stringify(example.data)
      };

      const result = await this.safetyManager.validateStep(step);
      console.log(`  ❌ ${example.name}: ${result.isValid ? 'UNEXPECTEDLY VALID' : 'CORRECTLY REJECTED'}`);
      
      if (!result.isValid && result.errors) {
        const matchesExpected = result.errors.some(error => 
          new RegExp(example.expectedError, 'i').test(error)
        );
        console.log(`    Expected error pattern matched: ${matchesExpected ? '✓' : '❌'}`);
        console.log(`    Errors: ${result.errors.slice(0, 2).join(', ')}`);
      }
    }
  }

  private async demonstrateValidNERData(): Promise<void> {
    console.log('\n🟢 4. Valid NER Data Validation');
    console.log('-'.repeat(35));

    const validNERExamples = [
      {
        name: 'Basic NER Result',
        data: {
          entities: [
            {
              text: 'John Doe',
              label: 'PERSON',
              start: 0,
              end: 8,
              confidence: 0.95
            }
          ],
          originalText: 'John Doe is a person'
        }
      },
      {
        name: 'Multiple Entity Types',
        data: {
          entities: [
            {
              text: 'Apple Inc.',
              label: 'ORG',
              start: 0,
              end: 10,
              confidence: 0.97
            },
            {
              text: '$1.5 billion',
              label: 'MONEY',
              start: 25,
              end: 37,
              confidence: 0.93
            },
            {
              text: 'December 2024',
              label: 'DATE',
              start: 50,
              end: 63,
              confidence: 0.89
            }
          ],
          originalText: 'Apple Inc. reported $1.5 billion in December 2024'
        }
      },
      {
        name: 'NER with Metadata and Processing Info',
        data: {
          entities: [
            {
              text: 'Microsoft Corporation',
              label: 'ORG',
              start: 0,
              end: 21,
              confidence: 0.96,
              metadata: {
                normalized: 'Microsoft Corp.',
                linkedEntity: 'https://en.wikipedia.org/wiki/Microsoft',
                alternativeLabels: ['COMPANY', 'TECH_CORP']
              }
            }
          ],
          originalText: 'Microsoft Corporation is a technology company',
          processingMetadata: {
            model: 'spacy-en-core-web-lg',
            version: '3.4.1',
            processingTime: 145,
            language: 'en-US'
          }
        }
      }
    ];

    for (const example of validNERExamples) {
      const step: Step = {
        id: `valid-ner-${Date.now()}`,
        type: 'ner',
        args_json: JSON.stringify(example.data)
      };

      const result = await this.safetyManager.validateStep(step);
      console.log(`  ✓ ${example.name}: ${result.isValid ? 'VALID' : 'INVALID'}`);
      
      if (result.isValid && result.sanitizedData) {
        console.log(`    Entities found: ${result.sanitizedData.entities.length}`);
        console.log(`    Original text length: ${result.sanitizedData.originalText.length} chars`);
        const uniqueLabels = [...new Set(result.sanitizedData.entities.map((e: any) => e.label))];
        console.log(`    Entity types: ${uniqueLabels.join(', ')}`);
      }
    }
  }

  private async demonstrateInvalidNERData(): Promise<void> {
    console.log('\n🔴 5. Invalid NER Data Rejection');
    console.log('-'.repeat(35));

    const invalidNERExamples = [
      {
        name: 'Invalid Entity Label',
        data: {
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
        },
        expectedError: 'label.*enum'
      },
      {
        name: 'Missing Original Text',
        data: {
          entities: [
            {
              text: 'Test',
              label: 'PERSON',
              start: 0,
              end: 4,
              confidence: 0.9
            }
          ]
          // Missing originalText
        },
        expectedError: 'originalText.*required'
      },
      {
        name: 'Invalid Confidence Range',
        data: {
          entities: [
            {
              text: 'Test Entity',
              label: 'PERSON',
              start: 0,
              end: 11,
              confidence: -0.5 // Negative confidence
            }
          ],
          originalText: 'Test Entity'
        },
        expectedError: 'confidence.*minimum'
      },
      {
        name: 'Invalid Language Code Format',
        data: {
          entities: [],
          originalText: 'Test text',
          processingMetadata: {
            model: 'test-model',
            version: '1.0',
            processingTime: 100,
            language: 'invalid-language-code' // Invalid format
          }
        },
        expectedError: 'language.*pattern'
      }
    ];

    for (const example of invalidNERExamples) {
      const step: Step = {
        id: `invalid-ner-${Date.now()}`,
        type: 'ner',
        args_json: JSON.stringify(example.data)
      };

      const result = await this.safetyManager.validateStep(step);
      console.log(`  ❌ ${example.name}: ${result.isValid ? 'UNEXPECTEDLY VALID' : 'CORRECTLY REJECTED'}`);
      
      if (!result.isValid && result.errors) {
        const matchesExpected = result.errors.some(error => 
          new RegExp(example.expectedError, 'i').test(error)
        );
        console.log(`    Expected error pattern matched: ${matchesExpected ? '✓' : '❌'}`);
        console.log(`    First error: ${result.errors[0]}`);
      }
    }
  }

  private async demonstrateValidRouteData(): Promise<void> {
    console.log('\n🟢 6. Valid Route Data Validation');
    console.log('-'.repeat(35));

    const validRouteExamples = [
      {
        name: 'Simple GET Request',
        data: {
          path: '/api/v1/users',
          method: 'GET'
        }
      },
      {
        name: 'POST with Body',
        data: {
          path: '/api/v1/users',
          method: 'POST',
          body: {
            contentType: 'application/json',
            data: {
              name: 'John Doe',
              email: 'john@example.com'
            }
          }
        }
      },
      {
        name: 'Complex Request with All Features',
        data: {
          path: '/api/v2/transactions',
          method: 'POST',
          parameters: {
            query: {
              page: 1,
              limit: 10,
              sort: 'created_at',
              filters: ['active', 'pending']
            },
            path: {
              userId: 12345
            },
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer token123',
              'X-Request-ID': 'req-789'
            }
          },
          body: {
            contentType: 'application/json',
            data: {
              amount: 1500.50,
              currency: 'USD',
              description: 'Payment for services'
            },
            size: 256
          },
          timeout: 30000,
          retries: 3,
          authentication: {
            type: 'bearer',
            credentials: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            scope: 'transactions:write'
          },
          validation: {
            expectedStatus: [200, 201, 202],
            maxResponseSize: 1048576
          }
        }
      }
    ];

    for (const example of validRouteExamples) {
      const step: Step = {
        id: `valid-route-${Date.now()}`,
        type: 'route',
        args_json: JSON.stringify(example.data)
      };

      const result = await this.safetyManager.validateStep(step);
      console.log(`  ✓ ${example.name}: ${result.isValid ? 'VALID' : 'INVALID'}`);
      
      if (result.isValid && result.sanitizedData) {
        console.log(`    Method: ${result.sanitizedData.method}`);
        console.log(`    Path: ${result.sanitizedData.path}`);
        if (result.sanitizedData.body) {
          console.log(`    Body type: ${result.sanitizedData.body.contentType}`);
        }
        if (result.sanitizedData.timeout) {
          console.log(`    Timeout: ${result.sanitizedData.timeout}ms`);
        }
      }
    }
  }

  private async demonstrateInvalidRouteData(): Promise<void> {
    console.log('\n🔴 7. Invalid Route Data Rejection');
    console.log('-'.repeat(35));

    const invalidRouteExamples = [
      {
        name: 'Invalid HTTP Method',
        data: {
          path: '/api/test',
          method: 'INVALID_METHOD'
        },
        expectedError: 'method.*enum'
      },
      {
        name: 'Invalid Path Format',
        data: {
          path: 'invalid-path-without-slash',
          method: 'GET'
        },
        expectedError: 'path.*pattern'
      },
      {
        name: 'Invalid Timeout Range',
        data: {
          path: '/api/test',
          method: 'GET',
          timeout: 50 // Below minimum of 100
        },
        expectedError: 'timeout.*minimum'
      },
      {
        name: 'Invalid Body Size',
        data: {
          path: '/api/test',
          method: 'POST',
          body: {
            contentType: 'application/json',
            data: { test: 'data' },
            size: 20971520 // 20MB, exceeds 10MB limit
          }
        },
        expectedError: 'size.*maximum'
      },
      {
        name: 'Invalid Authentication Type',
        data: {
          path: '/api/test',
          method: 'GET',
          authentication: {
            type: 'invalid_auth_type',
            credentials: 'test'
          }
        },
        expectedError: 'type.*enum'
      }
    ];

    for (const example of invalidRouteExamples) {
      const step: Step = {
        id: `invalid-route-${Date.now()}`,
        type: 'route',
        args_json: JSON.stringify(example.data)
      };

      const result = await this.safetyManager.validateStep(step);
      console.log(`  ❌ ${example.name}: ${result.isValid ? 'UNEXPECTEDLY VALID' : 'CORRECTLY REJECTED'}`);
      
      if (!result.isValid && result.errors) {
        const matchesExpected = result.errors.some(error => 
          new RegExp(example.expectedError, 'i').test(error)
        );
        console.log(`    Expected error pattern matched: ${matchesExpected ? '✓' : '❌'}`);
        console.log(`    First error: ${result.errors[0]}`);
      }
    }
  }

  private async demonstrateEdgeCases(): Promise<void> {
    console.log('\n⚡ 8. Edge Cases and Special Scenarios');
    console.log('-'.repeat(40));

    const edgeCases = [
      {
        name: 'Empty JSON Object',
        step: {
          id: 'edge-empty',
          type: 'ocr' as const,
          args_json: '{}'
        },
        expected: 'should reject due to missing required fields'
      },
      {
        name: 'Malformed JSON',
        step: {
          id: 'edge-malformed',
          type: 'ocr' as const,
          args_json: '{"text": "test", invalid}'
        },
        expected: 'should reject due to JSON parsing error'
      },
      {
        name: 'Very Large Text Content',
        step: {
          id: 'edge-large',
          type: 'ocr' as const,
          args_json: JSON.stringify({
            text: 'A'.repeat(100000), // Very large text
            confidence: 0.9
          })
        },
        expected: 'should handle large content gracefully'
      },
      {
        name: 'Unicode and Special Characters',
        step: {
          id: 'edge-unicode',
          type: 'ner' as const,
          args_json: JSON.stringify({
            entities: [
              {
                text: '💼 Corporation 中文 عربي',
                label: 'ORG',
                start: 0,
                end: 20,
                confidence: 0.85
              }
            ],
            originalText: '💼 Corporation 中文 عربي operates globally'
          })
        },
        expected: 'should handle unicode text correctly'
      },
      {
        name: 'Minimum Valid Values',
        step: {
          id: 'edge-minimum',
          type: 'ocr' as const,
          args_json: JSON.stringify({
            text: 'A', // Minimum length
            confidence: 0.0 // Minimum confidence
          })
        },
        expected: 'should accept minimum valid values'
      },
      {
        name: 'Maximum Valid Values',
        step: {
          id: 'edge-maximum',
          type: 'route' as const,
          args_json: JSON.stringify({
            path: '/api/test',
            method: 'POST',
            timeout: 300000, // Maximum timeout (5 minutes)
            retries: 5, // Maximum retries
            validation: {
              expectedStatus: Array.from({ length: 100 }, (_, i) => i + 200), // Many status codes
              maxResponseSize: 104857600 // 100MB maximum
            }
          })
        },
        expected: 'should accept maximum valid values'
      }
    ];

    for (const edgeCase of edgeCases) {
      try {
        const result = await this.safetyManager.validateStep(edgeCase.step);
        const status = result.isValid ? '✓ VALID' : '❌ INVALID';
        console.log(`  ${status} ${edgeCase.name}`);
        console.log(`    Expected: ${edgeCase.expected}`);
        
        if (!result.isValid && result.errors) {
          console.log(`    Actual errors: ${result.errors.slice(0, 2).join(', ')}`);
        }
        
        if (result.warnings && result.warnings.length > 0) {
          console.log(`    Warnings: ${result.warnings.join(', ')}`);
        }
      } catch (error) {
        console.log(`  ⚠️ EXCEPTION ${edgeCase.name}`);
        console.log(`    Error: ${(error as Error).message}`);
      }
    }
  }

  private async demonstrateBatchValidation(): Promise<void> {
    console.log('\n📦 9. Batch Validation Performance');
    console.log('-'.repeat(35));

    // Create a batch of mixed valid/invalid steps
    const batchSteps: Step[] = [
      {
        id: 'batch-1',
        type: 'ocr',
        args_json: JSON.stringify({ text: 'Valid OCR', confidence: 0.9 })
      },
      {
        id: 'batch-2',
        type: 'ner',
        args_json: JSON.stringify({
          entities: [{ text: 'John', label: 'PERSON', start: 0, end: 4, confidence: 0.95 }],
          originalText: 'John is here'
        })
      },
      {
        id: 'batch-3',
        type: 'route',
        args_json: JSON.stringify({ path: '/api/test', method: 'GET' })
      },
      {
        id: 'batch-4-invalid',
        type: 'ocr',
        args_json: JSON.stringify({ text: 'Invalid', confidence: 2.0 }) // Invalid confidence
      },
      {
        id: 'batch-5',
        type: 'ner',
        args_json: JSON.stringify({
          entities: [{ text: 'Apple', label: 'ORG', start: 0, end: 5, confidence: 0.88 }],
          originalText: 'Apple Inc.'
        })
      }
    ];

    console.log(`  Validating batch of ${batchSteps.length} steps...`);
    
    const startTime = Date.now();
    const results = await this.safetyManager.validateSteps(batchSteps);
    const duration = Date.now() - startTime;
    
    const validCount = results.filter(r => r.isValid).length;
    const invalidCount = results.length - validCount;
    
    console.log(`  ✓ Batch validation completed in ${duration}ms`);
    console.log(`  Valid steps: ${validCount}/${results.length}`);
    console.log(`  Invalid steps: ${invalidCount}/${results.length}`);
    console.log(`  Average time per step: ${(duration / results.length).toFixed(1)}ms`);
    
    results.forEach((result, index) => {
      const step = batchSteps[index];
      const status = result.isValid ? '✓' : '❌';
      console.log(`    ${status} ${step.id} (${step.type})`);
      if (!result.isValid && result.errors) {
        console.log(`      Error: ${result.errors[0]}`);
      }
    });
  }

  private async demonstrateCustomSchemas(): Promise<void> {
    console.log('\n🛠️ 10. Custom Schema Management');
    console.log('-'.repeat(35));

    // Define a custom schema
    const customSchema = {
      type: 'object',
      properties: {
        customField: {
          type: 'string',
          minLength: 1,
          maxLength: 100
        },
        numericField: {
          type: 'number',
          minimum: 0,
          maximum: 1000
        },
        optionalArray: {
          type: 'array',
          items: {
            type: 'string'
          }
        }
      },
      required: ['customField', 'numericField'],
      additionalProperties: false
    };

    console.log('  Adding custom schema validator...');
    try {
      this.safetyManager.addCustomValidator('custom-test', customSchema);
      console.log('  ✓ Custom schema added successfully');
    } catch (error) {
      console.log(`  ❌ Failed to add custom schema: ${(error as Error).message}`);
      return;
    }

    // Test valid custom data
    const validCustomStep: Step = {
      id: 'custom-valid',
      type: 'custom-test' as any,
      args_json: JSON.stringify({
        customField: 'Test value',
        numericField: 42,
        optionalArray: ['item1', 'item2']
      })
    };

    const validResult = await this.safetyManager.validateStep(validCustomStep);
    console.log(`  ✓ Valid custom data: ${validResult.isValid ? 'ACCEPTED' : 'REJECTED'}`);

    // Test invalid custom data
    const invalidCustomStep: Step = {
      id: 'custom-invalid',
      type: 'custom-test' as any,
      args_json: JSON.stringify({
        customField: '', // Empty string (violates minLength)
        numericField: 1500, // Exceeds maximum
        extraField: 'Not allowed' // Additional property
      })
    };

    const invalidResult = await this.safetyManager.validateStep(invalidCustomStep);
    console.log(`  ❌ Invalid custom data: ${invalidResult.isValid ? 'UNEXPECTEDLY ACCEPTED' : 'CORRECTLY REJECTED'}`);
    if (invalidResult.errors) {
      console.log(`    Errors: ${invalidResult.errors.slice(0, 2).join(', ')}`);
    }

    // Remove custom validator
    console.log('  Removing custom schema validator...');
    const removed = this.safetyManager.removeCustomValidator('custom-test');
    console.log(`  ${removed ? '✓' : '❌'} Custom schema removed: ${removed}`);

    // Verify removal
    const removedTestResult = await this.safetyManager.validateStep(validCustomStep);
    console.log(`  ✓ Post-removal validation: ${removedTestResult.isValid ? 'UNEXPECTED' : 'CORRECTLY FAILED'}`);
  }
}

// CLI execution
if (require.main === module) {
  const demo = new SchemaValidationDemo();
  
  demo.runDemo()
    .then(() => {
      console.log('\n🏆 Schema Validation Demo completed successfully!');
      console.log('\nKey Demonstrations:');
      console.log('  ✓ Valid data acceptance across all schema types (OCR, NER, Route)');
      console.log('  ✓ Invalid data rejection with detailed error messages');
      console.log('  ✓ Edge case handling (empty data, unicode, large content)');
      console.log('  ✓ Batch validation performance');
      console.log('  ✓ Custom schema management (add/remove validators)');
      console.log('  ✓ Strict mode enforcement and type coercion');
      console.log('  ✓ Comprehensive error reporting and debugging');
      
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Schema Validation Demo failed:', error);
      process.exit(1);
    });
}

export { SchemaValidationDemo };
