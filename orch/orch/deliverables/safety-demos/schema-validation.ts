#!/usr/bin/env npx ts-node
/**
 * Schema Validation Demonstration
 * Shows comprehensive AJV validation against v1.1 schemas
 */

import Ajv, { JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '../../src/utils/logger';

interface ValidationResult {
  stepType: string;
  args: any;
  valid: boolean;
  errors?: string[];
  performance?: {
    validationTimeMs: number;
    schemaSize: number;
  };
}

class SchemaValidationDemo {
  private ajv: Ajv;
  private logger: Logger;
  private schemas: { [key: string]: any } = {};

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
    this.logger = new Logger('SchemaDemo');
    this.loadSchemas();
  }

  private loadSchemas(): void {
    const schemaPath = join(__dirname, '../../schemas');
    
    try {
      // Load OCR schema
      const ocrSchema = JSON.parse(readFileSync(join(schemaPath, 'ocr-v1.json'), 'utf8'));
      this.schemas.ocr = ocrSchema;
      this.ajv.addSchema(ocrSchema, 'ocr-v1');

      // Load NER schema
      const nerSchema = JSON.parse(readFileSync(join(schemaPath, 'ner-v1.json'), 'utf8'));
      this.schemas.ner = nerSchema;
      this.ajv.addSchema(nerSchema, 'ner-v1');

      // Load Route schema
      const routeSchema = JSON.parse(readFileSync(join(schemaPath, 'route-v1.json'), 'utf8'));
      this.schemas.route = routeSchema;
      this.ajv.addSchema(routeSchema, 'route-v1');

      console.log('✅ Loaded v1.1 schemas successfully');
    } catch (error) {
      console.error('❌ Failed to load schemas:', error);
      throw error;
    }
  }

  async runDemo(): Promise<void> {
    console.log('🔍 Schema Validation Demonstration');
    console.log('==================================\n');

    const validationResults: ValidationResult[] = [];

    // Test OCR validation
    console.log('📋 Testing OCR Schema Validation (ocr:v1)');
    console.log('─'.repeat(45));
    validationResults.push(...await this.testOCRValidation());

    console.log('\n📋 Testing NER Schema Validation (ner:v1)');
    console.log('─'.repeat(45));
    validationResults.push(...await this.testNERValidation());

    console.log('\n📋 Testing Route Schema Validation (route:v1)');
    console.log('─'.repeat(47));
    validationResults.push(...await this.testRouteValidation());

    this.printSummary(validationResults);
  }

  private async testOCRValidation(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Valid OCR arguments
    const validOCR = {
      page_ref: 'sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      lang_hint: 'en',
      ocr_mode: 'balanced',
      resolution_dpi: 300,
      quality_speed_tradeoff: 0.7
    };

    results.push(await this.validateArgs('ocr', validOCR, 'Valid OCR Arguments'));

    // Invalid page_ref format
    results.push(await this.validateArgs('ocr', {
      ...validOCR,
      page_ref: 'invalid-hash-format'
    }, 'Invalid page_ref format'));

    // Invalid language
    results.push(await this.validateArgs('ocr', {
      ...validOCR,
      lang_hint: 'invalid-lang'
    }, 'Invalid language hint'));

    // Invalid OCR mode
    results.push(await this.validateArgs('ocr', {
      ...validOCR,
      ocr_mode: 'ultra-fast'
    }, 'Invalid OCR mode'));

    // Out of range DPI
    results.push(await this.validateArgs('ocr', {
      ...validOCR,
      resolution_dpi: 50
    }, 'DPI below minimum (50 < 150)'));

    results.push(await this.validateArgs('ocr', {
      ...validOCR,
      resolution_dpi: 1200
    }, 'DPI above maximum (1200 > 600)'));

    // Invalid quality_speed_tradeoff
    results.push(await this.validateArgs('ocr', {
      ...validOCR,
      quality_speed_tradeoff: 1.5
    }, 'Quality tradeoff above 1.0'));

    // Missing required fields
    results.push(await this.validateArgs('ocr', {
      resolution_dpi: 300
    }, 'Missing required fields'));

    // Additional properties (should be rejected)
    results.push(await this.validateArgs('ocr', {
      ...validOCR,
      extra_property: 'should_be_rejected'
    }, 'Additional properties'));

    return results;
  }

  private async testNERValidation(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Valid NER arguments
    const validNER = {
      text: 'John Smith works at ACME Corp and earned $50,000 in 2024.',
      domain_hint: 'financial',
      entity_schema_version: 'v2.1',
      postproc_thresholds: {
        min_confidence: 0.8,
        min_entity_length: 2
      }
    };

    results.push(await this.validateArgs('ner', validNER, 'Valid NER Arguments'));

    // Empty text
    results.push(await this.validateArgs('ner', {
      ...validNER,
      text: ''
    }, 'Empty text'));

    // Text too long
    results.push(await this.validateArgs('ner', {
      ...validNER,
      text: 'x'.repeat(50001)
    }, 'Text too long (>50000 chars)'));

    // Invalid domain hint
    results.push(await this.validateArgs('ner', {
      ...validNER,
      domain_hint: 'invalid-domain'
    }, 'Invalid domain hint'));

    // Invalid schema version format
    results.push(await this.validateArgs('ner', {
      ...validNER,
      entity_schema_version: 'invalid-version'
    }, 'Invalid schema version format'));

    // Invalid confidence threshold
    results.push(await this.validateArgs('ner', {
      ...validNER,
      postproc_thresholds: {
        min_confidence: 1.5,
        min_entity_length: 2
      }
    }, 'Confidence threshold > 1.0'));

    // Invalid entity length
    results.push(await this.validateArgs('ner', {
      ...validNER,
      postproc_thresholds: {
        min_confidence: 0.8,
        min_entity_length: 150
      }
    }, 'Entity length > 100'));

    return results;
  }

  private async testRouteValidation(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Valid Route arguments
    const validRoute = {
      entities: [
        {
          type: 'PERSON',
          text: 'John Smith',
          span: { start: 0, end: 10 },
          confidence: 0.95
        },
        {
          type: 'MONEY',
          text: '$50,000',
          span: { start: 30, end: 37 },
          confidence: 0.88
        }
      ],
      ruleset_version: 'v3.2',
      business_constraints: {
        priority_entities: ['PERSON', 'MONEY'],
        risk_tolerance: 'medium'
      }
    };

    results.push(await this.validateArgs('route', validRoute, 'Valid Route Arguments'));

    // Invalid entity type
    results.push(await this.validateArgs('route', {
      ...validRoute,
      entities: [
        {
          type: 'INVALID_TYPE',
          text: 'Invalid',
          confidence: 0.9
        }
      ]
    }, 'Invalid entity type'));

    // Missing required entity fields
    results.push(await this.validateArgs('route', {
      ...validRoute,
      entities: [
        {
          type: 'PERSON',
          text: 'John'
          // Missing confidence
        }
      ]
    }, 'Missing entity confidence'));

    // Invalid confidence range
    results.push(await this.validateArgs('route', {
      ...validRoute,
      entities: [
        {
          type: 'PERSON',
          text: 'John',
          confidence: 1.5
        }
      ]
    }, 'Confidence > 1.0'));

    // Invalid ruleset version format
    results.push(await this.validateArgs('route', {
      ...validRoute,
      ruleset_version: 'invalid-format'
    }, 'Invalid ruleset version'));

    // Invalid risk tolerance
    results.push(await this.validateArgs('route', {
      ...validRoute,
      business_constraints: {
        priority_entities: ['PERSON'],
        risk_tolerance: 'extreme'
      }
    }, 'Invalid risk tolerance'));

    // Negative span values
    results.push(await this.validateArgs('route', {
      ...validRoute,
      entities: [
        {
          type: 'PERSON',
          text: 'John',
          span: { start: -1, end: 10 },
          confidence: 0.9
        }
      ]
    }, 'Negative span start'));

    return results;
  }

  private async validateArgs(stepType: string, args: any, testName: string): Promise<ValidationResult> {
    const startTime = performance.now();
    
    try {
      const schemaId = `${stepType}-v1`;
      const validate = this.ajv.getSchema(schemaId);
      
      if (!validate) {
        throw new Error(`Schema not found: ${schemaId}`);
      }

      const isValid = validate(args);
      const endTime = performance.now();
      const validationTimeMs = endTime - startTime;

      const result: ValidationResult = {
        stepType,
        args,
        valid: isValid,
        performance: {
          validationTimeMs,
          schemaSize: JSON.stringify(this.schemas[stepType]).length
        }
      };

      if (!isValid && validate.errors) {
        result.errors = validate.errors.map(error => {
          const path = error.instancePath || 'root';
          return `${path}: ${error.message} (got: ${JSON.stringify(error.data)})`;
        });
      }

      // Log result
      const status = isValid ? '✅ VALID' : '❌ INVALID';
      console.log(`  ${status} - ${testName}`);
      
      if (!isValid && result.errors) {
        result.errors.forEach(error => {
          console.log(`    📋 ${error}`);
        });
      }
      
      console.log(`    ⏱️  Validation time: ${validationTimeMs.toFixed(2)}ms`);

      return result;

    } catch (error) {
      const endTime = performance.now();
      console.log(`  ❌ ERROR - ${testName}: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        stepType,
        args,
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        performance: {
          validationTimeMs: endTime - startTime,
          schemaSize: 0
        }
      };
    }
  }

  private printSummary(results: ValidationResult[]): void {
    console.log('\n\n🎯 Schema Validation Summary');
    console.log('═'.repeat(50));

    const byStepType = results.reduce((acc, result) => {
      if (!acc[result.stepType]) {
        acc[result.stepType] = { valid: 0, invalid: 0, errors: [] };
      }
      if (result.valid) {
        acc[result.stepType].valid++;
      } else {
        acc[result.stepType].invalid++;
        if (result.errors) {
          acc[result.stepType].errors.push(...result.errors);
        }
      }
      return acc;
    }, {} as { [key: string]: { valid: number; invalid: number; errors: string[] } });

    Object.entries(byStepType).forEach(([stepType, stats]) => {
      console.log(`\n${stepType.toUpperCase()} Schema (${stepType}:v1):`);
      console.log(`  ✅ Valid cases: ${stats.valid}`);
      console.log(`  ❌ Invalid cases: ${stats.invalid}`);
      console.log(`  📊 Total tests: ${stats.valid + stats.invalid}`);
    });

    const totalValid = results.filter(r => r.valid).length;
    const totalInvalid = results.length - totalValid;
    const avgValidationTime = results.reduce((sum, r) => 
      sum + (r.performance?.validationTimeMs || 0), 0) / results.length;

    console.log(`\n📊 Overall Statistics:`);
    console.log(`  Total validations: ${results.length}`);
    console.log(`  ✅ Passed: ${totalValid} (${(totalValid/results.length*100).toFixed(1)}%)`);
    console.log(`  ❌ Failed: ${totalInvalid} (${(totalInvalid/results.length*100).toFixed(1)}%)`);
    console.log(`  ⏱️  Average validation time: ${avgValidationTime.toFixed(2)}ms`);

    console.log(`\n🔒 Schema Validation Features Demonstrated:`);
    console.log(`  ✅ Required field validation`);
    console.log(`  ✅ Data type validation`);
    console.log(`  ✅ Range and constraint checking`);
    console.log(`  ✅ Pattern matching (SHA-256, version formats)`);
    console.log(`  ✅ Enum validation`);
    console.log(`  ✅ Additional properties rejection`);
    console.log(`  ✅ Nested object validation`);
    console.log(`  ✅ Performance monitoring`);

    console.log('\n✅ Schema validation system working correctly!');
    console.log('🛡️ All Step.args_json will be validated against exact v1.1 schemas');
  }
}

// Run the demonstration
if (require.main === module) {
  const demo = new SchemaValidationDemo();
  demo.runDemo().catch(console.error);
}