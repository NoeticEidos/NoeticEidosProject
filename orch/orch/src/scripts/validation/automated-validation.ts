#!/usr/bin/env node
/**
 * Automated Validation Script
 * Validates budget enforcement, schema compliance, and safety constraints
 */

import { SafetyManager, SafetyConfig } from '../../safety/managers/SafetyManager.js';
import { BudgetTracker, BudgetInfo } from '../../core/budget-tracker.js';
import { WorkflowExecutor } from '../../core/workflow-executor.js';
import { WorkflowDefinition } from '../../types/workflow-types.js';
import { PolicyServiceClient } from '../../client/policy-service-client.js';
import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  testName: string;
  passed: boolean;
  message: string;
  duration: number;
  details?: any;
}

interface ValidationReport {
  timestamp: Date;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: ValidationResult[];
  summary: string;
}

class AutomatedValidator {
  private safetyManager: SafetyManager;
  private budgetTracker: BudgetTracker;
  private workflowExecutor: WorkflowExecutor;
  private mockClient: any;

  constructor() {
    const safetyConfig: SafetyConfig = {
      budgetLimits: {
        tokenLimit: 10000,
        costLimit: 25,
        requestLimit: 100,
        timeLimit: 300000,
        memoryLimit: 1024 * 1024 * 200,
        concurrencyLimit: 10
      },
      depthLimits: {
        maxDepth: 8,
        maxBranching: 4
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
    this.budgetTracker = new BudgetTracker();
    
    // Mock gRPC client for validation
    this.mockClient = {
      processOCR: async (params: any) => ({
        text: `Mocked OCR result for ${params.imageUrl}`,
        confidence: 0.9
      }),
      processNER: async (params: any) => ({
        entities: [
          { text: 'Mock Entity', label: 'PERSON', start: 0, end: 11, confidence: 0.95 }
        ],
        originalText: params.text
      }),
      executeRoute: async (params: any) => ({
        status: 200,
        data: { message: 'Mock API response' }
      })
    };
  }

  async runAllValidations(): Promise<ValidationReport> {
    const results: ValidationResult[] = [];
    const startTime = Date.now();

    console.log('🚀 Starting Automated Validation Suite...');
    console.log('=' .repeat(50));

    // Schema Validation Tests
    results.push(...await this.runSchemaValidationTests());
    
    // Budget Enforcement Tests
    results.push(...await this.runBudgetEnforcementTests());
    
    // Safety Constraint Tests
    results.push(...await this.runSafetyConstraintTests());
    
    // Tool Execution Tests
    results.push(...await this.runToolExecutionTests());
    
    // Integration Tests
    results.push(...await this.runIntegrationTests());

    const totalDuration = Date.now() - startTime;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.length - passedTests;

    const report: ValidationReport = {
      timestamp: new Date(),
      totalTests: results.length,
      passedTests,
      failedTests,
      results,
      summary: this.generateSummary(passedTests, failedTests, totalDuration)
    };

    await this.saveReport(report);
    this.printReport(report);

    return report;
  }

  private async runSchemaValidationTests(): Promise<ValidationResult[]> {
    console.log('\n📋 Running Schema Validation Tests...');
    const results: ValidationResult[] = [];

    // Test 1: Valid OCR Schema
    results.push(await this.runTest(
      'Valid OCR Schema Validation',
      async () => {
        const step = {
          id: 'test-ocr',
          type: 'ocr' as const,
          args_json: JSON.stringify({
            text: 'Test OCR result',
            confidence: 0.95
          })
        };
        
        const result = await this.safetyManager.validateStep(step);
        if (!result.isValid) {
          throw new Error(`Validation failed: ${result.errors?.join(', ')}`);
        }
        return { validated: true, result };
      }
    ));

    // Test 2: Invalid OCR Schema
    results.push(await this.runTest(
      'Invalid OCR Schema Rejection',
      async () => {
        const step = {
          id: 'test-ocr-invalid',
          type: 'ocr' as const,
          args_json: JSON.stringify({
            text: 'Test',
            confidence: 2.0 // Invalid: > 1
          })
        };
        
        const result = await this.safetyManager.validateStep(step);
        if (result.isValid) {
          throw new Error('Should have rejected invalid schema');
        }
        return { rejected: true, errors: result.errors };
      }
    ));

    // Test 3: Valid NER Schema
    results.push(await this.runTest(
      'Valid NER Schema Validation',
      async () => {
        const step = {
          id: 'test-ner',
          type: 'ner' as const,
          args_json: JSON.stringify({
            entities: [
              {
                text: 'John Doe',
                label: 'PERSON',
                start: 0,
                end: 8,
                confidence: 0.95
              }
            ],
            originalText: 'John Doe is here'
          })
        };
        
        const result = await this.safetyManager.validateStep(step);
        if (!result.isValid) {
          throw new Error(`Validation failed: ${result.errors?.join(', ')}`);
        }
        return { validated: true, result };
      }
    ));

    // Test 4: Valid Route Schema
    results.push(await this.runTest(
      'Valid Route Schema Validation',
      async () => {
        const step = {
          id: 'test-route',
          type: 'route' as const,
          args_json: JSON.stringify({
            path: '/api/v1/test',
            method: 'GET',
            parameters: {
              query: { id: 123 }
            }
          })
        };
        
        const result = await this.safetyManager.validateStep(step);
        if (!result.isValid) {
          throw new Error(`Validation failed: ${result.errors?.join(', ')}`);
        }
        return { validated: true, result };
      }
    ));

    return results;
  }

  private async runBudgetEnforcementTests(): Promise<ValidationResult[]> {
    console.log('\n💰 Running Budget Enforcement Tests...');
    const results: ValidationResult[] = [];
    const executionId = 'budget-test-execution';

    // Test 1: Budget Initialization
    results.push(await this.runTest(
      'Budget Tracker Initialization',
      async () => {
        const budgetLimit: BudgetInfo = {
          tokens: 1000,
          monetaryCost: 10,
          apiCalls: 20
        };
        
        this.budgetTracker.initialize(executionId, budgetLimit);
        const current = this.budgetTracker.getCurrentBudget(executionId);
        
        if (current.tokens !== 0 || current.monetaryCost !== 0) {
          throw new Error('Budget should initialize to zero');
        }
        
        return { initialized: true, budget: current };
      }
    ));

    // Test 2: Within Budget Limits
    results.push(await this.runTest(
      'Within Budget Limits Check',
      async () => {
        const cost: BudgetInfo = {
          tokens: 100,
          monetaryCost: 1,
          apiCalls: 2
        };
        
        const result = this.budgetTracker.addCost(executionId, cost);
        
        if (!result.withinBudget) {
          throw new Error('Should be within budget limits');
        }
        
        return { withinBudget: true, utilization: result.utilizationPercent };
      }
    ));

    // Test 3: Budget Exceeded
    results.push(await this.runTest(
      'Budget Limit Exceeded Detection',
      async () => {
        const excessiveCost: BudgetInfo = {
          tokens: 2000, // Exceeds limit of 1000
          monetaryCost: 5,
          apiCalls: 5
        };
        
        const result = this.budgetTracker.addCost(executionId, excessiveCost);
        
        if (result.withinBudget) {
          throw new Error('Should detect budget violation');
        }
        
        return { budgetExceeded: true, message: result.message };
      }
    ));

    // Test 4: Budget Reset
    results.push(await this.runTest(
      'Budget Reset Functionality',
      async () => {
        this.budgetTracker.reset(executionId);
        const current = this.budgetTracker.getCurrentBudget(executionId);
        
        if (current.tokens !== 0) {
          throw new Error('Budget should reset to zero');
        }
        
        return { reset: true, budget: current };
      }
    ));

    return results;
  }

  private async runSafetyConstraintTests(): Promise<ValidationResult[]> {
    console.log('\n🛡️ Running Safety Constraint Tests...');
    const results: ValidationResult[] = [];

    // Test 1: Depth Limit Enforcement
    results.push(await this.runTest(
      'Depth Limit Enforcement',
      async () => {
        const step = {
          id: 'deep-step',
          type: 'ocr' as const,
          args_json: JSON.stringify({
            text: 'Test',
            confidence: 0.9
          }),
          metadata: {
            depth: 15 // Exceeds limit of 8
          }
        };
        
        const result = await this.safetyManager.validateStep(step);
        
        if (result.isValid) {
          throw new Error('Should reject steps exceeding depth limit');
        }
        
        return { depthViolation: true, errors: result.errors };
      }
    ));

    // Test 2: Capability Restriction
    results.push(await this.runTest(
      'Capability Restriction Enforcement',
      async () => {
        const step = {
          id: 'restricted-step',
          type: 'ocr' as const,
          args_json: JSON.stringify({
            text: 'Test',
            confidence: 0.9
          }),
          metadata: {
            capabilities: ['ocr', 'admin'] // Admin is restricted
          }
        };
        
        const result = await this.safetyManager.validateStep(step);
        
        if (result.isValid) {
          throw new Error('Should reject restricted capabilities');
        }
        
        return { capabilityViolation: true, errors: result.errors };
      }
    ));

    // Test 3: Branching Limit
    results.push(await this.runTest(
      'Branching Limit Enforcement',
      async () => {
        const steps = Array.from({ length: 6 }, (_, i) => ({
          id: `branch-step-${i}`,
          type: 'ocr' as const,
          args_json: JSON.stringify({
            text: `Test ${i}`,
            confidence: 0.9
          })
        }));
        
        const results = await this.safetyManager.validateSteps(steps);
        
        if (results.every(r => r.isValid)) {
          throw new Error('Should reject excessive branching');
        }
        
        return { branchingViolation: true, results: results.length };
      }
    ));

    return results;
  }

  private async runToolExecutionTests(): Promise<ValidationResult[]> {
    console.log('\n🔧 Running Tool Execution Tests...');
    const results: ValidationResult[] = [];

    // Test 1: OCR Tool Execution
    results.push(await this.runTest(
      'OCR Tool Mock Execution',
      async () => {
        const params = {
          imageUrl: 'https://example.com/test.jpg',
          language: 'en'
        };
        
        const result = await this.mockClient.processOCR(params);
        
        if (!result.text || !result.confidence) {
          throw new Error('Invalid OCR response format');
        }
        
        return { executed: true, result };
      }
    ));

    // Test 2: NER Tool Execution
    results.push(await this.runTest(
      'NER Tool Mock Execution',
      async () => {
        const params = {
          text: 'John Doe works at Google',
          entityTypes: ['PERSON', 'ORG']
        };
        
        const result = await this.mockClient.processNER(params);
        
        if (!result.entities || !Array.isArray(result.entities)) {
          throw new Error('Invalid NER response format');
        }
        
        return { executed: true, result };
      }
    ));

    // Test 3: Route Tool Execution
    results.push(await this.runTest(
      'Route Tool Mock Execution',
      async () => {
        const params = {
          route: {
            path: '/api/test',
            method: 'GET'
          }
        };
        
        const result = await this.mockClient.executeRoute(params);
        
        if (!result.status || !result.data) {
          throw new Error('Invalid Route response format');
        }
        
        return { executed: true, result };
      }
    ));

    return results;
  }

  private async runIntegrationTests(): Promise<ValidationResult[]> {
    console.log('\n🔗 Running Integration Tests...');
    const results: ValidationResult[] = [];

    // Test 1: End-to-End Validation
    results.push(await this.runTest(
      'End-to-End Safety Validation',
      async () => {
        const step = {
          id: 'integration-test',
          type: 'ocr' as const,
          args_json: JSON.stringify({
            text: 'Integration test document',
            confidence: 0.88
          }),
          metadata: {
            timestamp: Date.now(),
            userId: 'test-user',
            depth: 2,
            capabilities: ['ocr']
          }
        };
        
        const validationResult = await this.safetyManager.validateStep(step);
        
        if (!validationResult.isValid) {
          throw new Error(`Integration validation failed: ${validationResult.errors?.join(', ')}`);
        }
        
        // Test budget tracking integration
        const executionId = 'integration-test-exec';
        const budgetLimit: BudgetInfo = {
          tokens: 2000,
          monetaryCost: 5,
          apiCalls: 10
        };
        
        this.budgetTracker.initialize(executionId, budgetLimit);
        
        const cost: BudgetInfo = {
          tokens: 200,
          monetaryCost: 0.5,
          apiCalls: 1
        };
        
        const budgetResult = this.budgetTracker.addCost(executionId, cost);
        
        return {
          validationPassed: true,
          budgetWithinLimits: budgetResult.withinBudget,
          utilization: budgetResult.utilizationPercent
        };
      }
    ));

    // Test 2: Configuration Update
    results.push(await this.runTest(
      'Dynamic Configuration Update',
      async () => {
        const newConfig = {
          depthLimits: {
            maxDepth: 15,
            maxBranching: 8
          }
        };
        
        this.safetyManager.updateConfig(newConfig);
        
        // Test with previously invalid depth
        const step = {
          id: 'config-test',
          type: 'ocr' as const,
          args_json: JSON.stringify({
            text: 'Test',
            confidence: 0.9
          }),
          metadata: {
            depth: 12 // Should now be valid
          }
        };
        
        const result = await this.safetyManager.validateStep(step);
        
        if (!result.isValid) {
          throw new Error('Configuration update failed');
        }
        
        return { configurationUpdated: true, validationPassed: true };
      }
    ));

    return results;
  }

  private async runTest(name: string, testFn: () => Promise<any>): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      process.stdout.write(`  • ${name}... `);
      const result = await testFn();
      const duration = Date.now() - startTime;
      
      console.log('✅ PASSED');
      return {
        testName: name,
        passed: true,
        message: 'Test passed successfully',
        duration,
        details: result
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      
      console.log('❌ FAILED');
      return {
        testName: name,
        passed: false,
        message,
        duration,
        details: { error: message }
      };
    }
  }

  private generateSummary(passed: number, failed: number, duration: number): string {
    const total = passed + failed;
    const successRate = ((passed / total) * 100).toFixed(1);
    
    return `Validation Complete: ${passed}/${total} tests passed (${successRate}%) in ${duration}ms`;
  }

  private async saveReport(report: ValidationReport): Promise<void> {
    const reportsDir = path.join(__dirname, '../../reports');
    
    // Ensure reports directory exists
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const filename = `validation-report-${Date.now()}.json`;
    const filepath = path.join(reportsDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    console.log(`\n📊 Report saved to: ${filepath}`);
  }

  private printReport(report: ValidationReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('🏁 VALIDATION REPORT');
    console.log('='.repeat(60));
    console.log(`Timestamp: ${report.timestamp.toISOString()}`);
    console.log(`Total Tests: ${report.totalTests}`);
    console.log(`Passed: ${report.passedTests} ✅`);
    console.log(`Failed: ${report.failedTests} ❌`);
    console.log(`Success Rate: ${((report.passedTests / report.totalTests) * 100).toFixed(1)}%`);
    console.log('\n' + report.summary);
    
    if (report.failedTests > 0) {
      console.log('\n🚨 FAILED TESTS:');
      report.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  • ${r.testName}: ${r.message}`);
        });
    }
    
    console.log('\n' + '='.repeat(60));
  }
}

// CLI execution
if (require.main === module) {
  const validator = new AutomatedValidator();
  
  validator.runAllValidations()
    .then(report => {
      process.exit(report.failedTests > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('\n❌ Validation suite failed:', error);
      process.exit(1);
    });
}

export { AutomatedValidator, ValidationResult, ValidationReport };
