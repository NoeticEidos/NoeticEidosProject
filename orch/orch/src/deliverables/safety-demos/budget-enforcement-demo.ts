#!/usr/bin/env node
/**
 * Budget Enforcement Demonstration
 * Shows real-time budget tracking and enforcement mechanisms
 */

import { BudgetTracker, BudgetInfo, BudgetCheckResult } from '../../core/budget-tracker.js';
import { SafetyManager, SafetyConfig } from '../../safety/managers/SafetyManager.js';
import { WorkflowExecutor } from '../../core/workflow-executor.js';
import { WorkflowDefinition, ExecutionOptions } from '../../types/workflow-types.js';

class BudgetEnforcementDemo {
  private budgetTracker: BudgetTracker;
  private safetyManager: SafetyManager;
  private workflowExecutor: WorkflowExecutor;

  constructor() {
    this.budgetTracker = new BudgetTracker();
    
    const safetyConfig: SafetyConfig = {
      budgetLimits: {
        tokenLimit: 5000,
        costLimit: 5.0,
        requestLimit: 20,
        timeLimit: 120000, // 2 minutes
        memoryLimit: 1024 * 1024 * 50, // 50MB
        concurrencyLimit: 5
      },
      depthLimits: {
        maxDepth: 8,
        maxBranching: 3
      },
      capabilities: {
        allowed: ['ocr', 'ner', 'route'],
        restricted: ['admin'],
        requireApproval: ['sensitive']
      },
      validation: {
        strictMode: true,
        allowUnknownProperties: false,
        coerceTypes: false
      }
    };

    this.safetyManager = new SafetyManager(safetyConfig);
    this.workflowExecutor = new WorkflowExecutor({
      safetyManager: this.safetyManager,
      budgetTracker: this.budgetTracker
    });
  }

  async runDemo(): Promise<void> {
    console.log('\n💰 Budget Enforcement Demonstration');
    console.log('=' .repeat(50));

    try {
      await this.demonstrateBudgetInitialization();
      await this.demonstrateWithinBudgetExecution();
      await this.demonstrateBudgetWarnings();
      await this.demonstrateBudgetViolation();
      await this.demonstrateRecoveryMechanisms();
      await this.demonstrateRealTimeMonitoring();
      
      console.log('\n✅ Budget Enforcement Demo Completed Successfully');
    } catch (error) {
      console.error('\n❌ Demo failed:', error);
      throw error;
    }
  }

  private async demonstrateBudgetInitialization(): Promise<void> {
    console.log('\n🚀 1. Budget Initialization');
    console.log('-'.repeat(30));

    const executionId = 'demo-init-001';
    const budgetLimit: BudgetInfo = {
      tokens: 5000,
      computeTime: 120000,
      memory: 1024 * 1024 * 50,
      apiCalls: 20,
      monetaryCost: 5.0
    };

    this.budgetTracker.initialize(executionId, budgetLimit);
    const currentBudget = this.budgetTracker.getCurrentBudget(executionId);
    
    console.log('✓ Budget tracker initialized');
    console.log(`  Limits: ${JSON.stringify(budgetLimit, null, 2)}`);
    console.log(`  Current usage: ${JSON.stringify(currentBudget, null, 2)}`);
    
    const summary = this.budgetTracker.getBudgetSummary(executionId);
    console.log(`  Utilization: ${JSON.stringify(summary.utilization, null, 2)}`);
  }

  private async demonstrateWithinBudgetExecution(): Promise<void> {
    console.log('\n🟢 2. Within-Budget Execution');
    console.log('-'.repeat(30));

    const executionId = 'demo-within-001';
    const budgetLimit: BudgetInfo = {
      tokens: 2000,
      computeTime: 30000,
      memory: 1024 * 1024 * 20,
      apiCalls: 10,
      monetaryCost: 2.0
    };

    this.budgetTracker.initialize(executionId, budgetLimit);

    // Simulate normal operation
    const cost1: BudgetInfo = {
      tokens: 300,
      computeTime: 2500,
      memory: 1024 * 1024 * 2,
      apiCalls: 1,
      monetaryCost: 0.15
    };

    const result1 = this.budgetTracker.addCost(executionId, cost1);
    console.log('✓ First operation completed');
    console.log(`  Within budget: ${result1.withinBudget}`);
    console.log(`  Token utilization: ${(result1.utilizationPercent.tokens! * 100).toFixed(1)}%`);
    console.log(`  Cost utilization: ${(result1.utilizationPercent.monetaryCost! * 100).toFixed(1)}%`);

    // Another normal operation
    const cost2: BudgetInfo = {
      tokens: 450,
      computeTime: 3200,
      memory: 1024 * 1024 * 3,
      apiCalls: 1,
      monetaryCost: 0.25
    };

    const result2 = this.budgetTracker.addCost(executionId, cost2);
    console.log('✓ Second operation completed');
    console.log(`  Within budget: ${result2.withinBudget}`);
    console.log(`  Total token utilization: ${(result2.utilizationPercent.tokens! * 100).toFixed(1)}%`);
    console.log(`  Total cost utilization: ${(result2.utilizationPercent.monetaryCost! * 100).toFixed(1)}%`);

    const remaining = this.budgetTracker.getRemainingBudget(executionId);
    console.log(`  Remaining budget: ${JSON.stringify(remaining, null, 2)}`);
  }

  private async demonstrateBudgetWarnings(): Promise<void> {
    console.log('\n🟡 3. Budget Warning System');
    console.log('-'.repeat(30));

    const executionId = 'demo-warning-001';
    const budgetLimit: BudgetInfo = {
      tokens: 1000,
      monetaryCost: 1.0
    };

    this.budgetTracker.initialize(executionId, budgetLimit);

    // Set up alert callback
    let alertsReceived: any[] = [];
    this.budgetTracker.setAlertCallback((alert) => {
      alertsReceived.push(alert);
      console.log(`  🚨 ALERT: ${alert.severity.toUpperCase()} - ${alert.message}`);
      console.log(`    Metric: ${alert.metric}, Threshold: ${(alert.threshold * 100).toFixed(0)}%, Current: ${(alert.currentValue * 100).toFixed(1)}%`);
    });

    // Gradually increase usage to trigger warnings
    const costs = [
      { tokens: 400, monetaryCost: 0.4 }, // 40% - should trigger info
      { tokens: 200, monetaryCost: 0.2 }, // 60% - should trigger warning  
      { tokens: 150, monetaryCost: 0.15 }, // 75% - should trigger error
      { tokens: 100, monetaryCost: 0.1 }, // 85% - should trigger critical
    ];

    for (let i = 0; i < costs.length; i++) {
      const cost = costs[i];
      const result = this.budgetTracker.addCost(executionId, cost);
      
      console.log(`\n  Step ${i + 1}: Added cost - tokens: ${cost.tokens}, cost: $${cost.monetaryCost}`);
      console.log(`    Current utilization: ${(result.utilizationPercent.tokens! * 100).toFixed(1)}% tokens, ${(result.utilizationPercent.monetaryCost! * 100).toFixed(1)}% cost`);
      console.log(`    Within budget: ${result.withinBudget}`);
      
      if (result.warnings && result.warnings.length > 0) {
        console.log(`    Warnings: ${result.warnings.join(', ')}`);
      }
      
      // Small delay to show progressive alerts
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n  Total alerts generated: ${alertsReceived.length}`);
    alertsReceived.forEach((alert, index) => {
      console.log(`    ${index + 1}. ${alert.severity}: ${alert.message}`);
    });
  }

  private async demonstrateBudgetViolation(): Promise<void> {
    console.log('\n🔴 4. Budget Violation and Enforcement');
    console.log('-'.repeat(40));

    const executionId = 'demo-violation-001';
    const budgetLimit: BudgetInfo = {
      tokens: 500,
      computeTime: 10000,
      memory: 1024 * 1024 * 5,
      monetaryCost: 0.5
    };

    this.budgetTracker.initialize(executionId, budgetLimit);

    // First, use most of the budget
    const normalCost: BudgetInfo = {
      tokens: 400,
      computeTime: 8000,
      memory: 1024 * 1024 * 4,
      monetaryCost: 0.4
    };

    const normalResult = this.budgetTracker.addCost(executionId, normalCost);
    console.log('✓ Normal operation completed');
    console.log(`  Utilization: ${(normalResult.utilizationPercent.tokens! * 100).toFixed(1)}% tokens, ${(normalResult.utilizationPercent.monetaryCost! * 100).toFixed(1)}% cost`);

    // Now attempt an operation that would exceed budget
    const excessiveCost: BudgetInfo = {
      tokens: 200, // Would bring total to 600, exceeding 500 limit
      computeTime: 5000,
      memory: 1024 * 1024 * 2,
      monetaryCost: 0.2
    };

    console.log('\n  Attempting operation that would exceed budget...');
    
    // First check if it would exceed (without actually adding)
    const projectionCheck = this.budgetTracker.checkBudget(executionId, excessiveCost);
    console.log(`  Budget check result: ${projectionCheck.withinBudget ? 'ALLOWED' : 'REJECTED'}`);
    
    if (!projectionCheck.withinBudget) {
      console.log(`  ❌ Rejection reason: ${projectionCheck.message}`);
      console.log('  Operation cancelled to prevent budget violation');
      
      const remainingBudget = this.budgetTracker.getRemainingBudget(executionId);
      console.log(`  Remaining budget: tokens=${remainingBudget.tokens}, cost=$${remainingBudget.monetaryCost}`);
    }

    // Demonstrate what happens if we force the operation anyway
    console.log('\n  Forcing operation despite budget violation...');
    try {
      const violationResult = this.budgetTracker.addCost(executionId, excessiveCost);
      console.log(`  ☠️ Violation occurred: ${!violationResult.withinBudget}`);
      console.log(`  Message: ${violationResult.message}`);
      
      const finalSummary = this.budgetTracker.getBudgetSummary(executionId);
      console.log(`  Final utilization: ${JSON.stringify(finalSummary.utilization, null, 2)}`);
      console.log(`  Alert count: ${finalSummary.alertCount}`);
    } catch (error) {
      console.log(`  ☠️ System enforced budget limit: ${(error as Error).message}`);
    }
  }

  private async demonstrateRecoveryMechanisms(): Promise<void> {
    console.log('\n🔄 5. Budget Recovery and Reset');
    console.log('-'.repeat(35));

    const executionId = 'demo-recovery-001';
    const budgetLimit: BudgetInfo = {
      tokens: 1000,
      monetaryCost: 1.0
    };

    this.budgetTracker.initialize(executionId, budgetLimit);

    // Use up most of the budget
    const heavyCost: BudgetInfo = {
      tokens: 900,
      monetaryCost: 0.9
    };

    this.budgetTracker.addCost(executionId, heavyCost);
    let summary = this.budgetTracker.getBudgetSummary(executionId);
    
    console.log('✓ Heavy operation completed');
    console.log(`  Current utilization: ${(summary.utilization.tokens! * 100).toFixed(1)}% tokens, ${(summary.utilization.monetaryCost! * 100).toFixed(1)}% cost`);
    console.log(`  Remaining: tokens=${summary.remainingBudget.tokens}, cost=$${summary.remainingBudget.monetaryCost}`);

    console.log('\n  Demonstrating budget reset...');
    this.budgetTracker.reset(executionId);
    
    summary = this.budgetTracker.getBudgetSummary(executionId);
    console.log('✓ Budget reset completed');
    console.log(`  Current utilization: ${(summary.utilization.tokens! * 100).toFixed(1)}% tokens, ${(summary.utilization.monetaryCost! * 100).toFixed(1)}% cost`);
    console.log(`  Available: tokens=${summary.remainingBudget.tokens}, cost=$${summary.remainingBudget.monetaryCost}`);

    // Verify we can now execute operations again
    const testCost: BudgetInfo = {
      tokens: 100,
      monetaryCost: 0.1
    };

    const testResult = this.budgetTracker.addCost(executionId, testCost);
    console.log('\n✓ Post-reset operation successful');
    console.log(`  Within budget: ${testResult.withinBudget}`);
    console.log(`  New utilization: ${(testResult.utilizationPercent.tokens! * 100).toFixed(1)}% tokens`);
  }

  private async demonstrateRealTimeMonitoring(): Promise<void> {
    console.log('\n📊 6. Real-Time Budget Monitoring');
    console.log('-'.repeat(38));

    const executionId = 'demo-monitoring-001';
    const budgetLimit: BudgetInfo = {
      tokens: 2000,
      computeTime: 60000,
      memory: 1024 * 1024 * 20,
      apiCalls: 15,
      monetaryCost: 2.0
    };

    this.budgetTracker.initialize(executionId, budgetLimit);

    console.log('✓ Starting real-time monitoring simulation');
    console.log('  Executing multiple operations with live tracking...');

    const operations = [
      { name: 'OCR Processing', cost: { tokens: 250, computeTime: 3000, memory: 1024*1024*2, apiCalls: 1, monetaryCost: 0.15 } },
      { name: 'NER Analysis', cost: { tokens: 180, computeTime: 2200, memory: 1024*1024*1, apiCalls: 1, monetaryCost: 0.12 } },
      { name: 'Route Execution', cost: { tokens: 120, computeTime: 1500, memory: 1024*1024*0.5, apiCalls: 1, monetaryCost: 0.08 } },
      { name: 'Data Processing', cost: { tokens: 300, computeTime: 4000, memory: 1024*1024*3, apiCalls: 2, monetaryCost: 0.20 } },
      { name: 'Report Generation', cost: { tokens: 200, computeTime: 2500, memory: 1024*1024*1.5, apiCalls: 1, monetaryCost: 0.13 } }
    ];

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const startTime = Date.now();
      
      // Check budget before operation
      const preCheck = this.budgetTracker.checkBudget(executionId, operation.cost);
      
      if (preCheck.withinBudget) {
        const result = this.budgetTracker.addCost(executionId, operation.cost);
        const duration = Date.now() - startTime;
        
        console.log(`\n  ${i + 1}. ${operation.name} (✓ ${duration}ms)`);
        console.log(`     Tokens: ${(result.utilizationPercent.tokens! * 100).toFixed(1)}% | Cost: ${(result.utilizationPercent.monetaryCost! * 100).toFixed(1)}% | Memory: ${(result.utilizationPercent.memory! * 100).toFixed(1)}%`);
        
        if (result.warnings && result.warnings.length > 0) {
          console.log(`     🟡 Warnings: ${result.warnings.join(', ')}`);
        }
      } else {
        console.log(`\n  ${i + 1}. ${operation.name} (❌ REJECTED)`);
        console.log(`     Reason: ${preCheck.message}`);
        break;
      }

      // Add small delay to simulate real processing
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const finalSummary = this.budgetTracker.getBudgetSummary(executionId);
    console.log('\n📊 Final Monitoring Report:');
    console.log(`  Total operations: ${finalSummary.totalOperations}`);
    console.log(`  Total alerts: ${finalSummary.alertCount}`);
    console.log(`  Final utilization:`);
    console.log(`    Tokens: ${(finalSummary.utilization.tokens! * 100).toFixed(1)}%`);
    console.log(`    Cost: ${(finalSummary.utilization.monetaryCost! * 100).toFixed(1)}%`);
    console.log(`    Memory: ${(finalSummary.utilization.memory! * 100).toFixed(1)}%`);
    console.log(`    API Calls: ${(finalSummary.utilization.apiCalls! * 100).toFixed(1)}%`);
    console.log(`  Within budget: ${finalSummary.withinBudget ? '✓' : '❌'}`);
    
    const history = this.budgetTracker.getBudgetHistory(executionId);
    console.log(`  History entries: ${history.length}`);
  }

  private printSeparator(): void {
    console.log('\n' + '='.repeat(60));
  }
}

// CLI execution
if (require.main === module) {
  const demo = new BudgetEnforcementDemo();
  
  demo.runDemo()
    .then(() => {
      console.log('\n🏆 Budget Enforcement Demo completed successfully!');
      console.log('\nKey Demonstrations:');
      console.log('  ✓ Budget initialization and tracking');
      console.log('  ✓ Real-time utilization monitoring');
      console.log('  ✓ Progressive alert system (info → warning → error → critical)');
      console.log('  ✓ Budget violation detection and prevention');
      console.log('  ✓ Enforcement mechanisms and recovery');
      console.log('  ✓ Live monitoring and reporting');
      
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Budget Enforcement Demo failed:', error);
      process.exit(1);
    });
}

export { BudgetEnforcementDemo };
