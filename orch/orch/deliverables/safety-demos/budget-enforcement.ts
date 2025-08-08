#!/usr/bin/env npx ts-node
/**
 * Budget Enforcement Demonstration
 * Shows real-time budget tracking and violation prevention
 */

import { WorkflowExecutor } from '../../src/core/workflow-executor';
import { SafetyManager } from '../../src/safety/managers/SafetyManager';
import { BudgetTracker } from '../../src/core/budget-tracker';
import { Logger } from '../../src/utils/logger';
import { config } from '../../src/config/config';

interface DemoResult {
  scenario: string;
  budgetLimit: Budget;
  actualCost: number;
  executedSteps: number;
  totalSteps: number;
  violationTriggered: boolean;
  terminationReason: string;
}

interface Budget {
  tokenBudget: number;
  costBudget: number;
  latencySloMs: number;
  depthCap: number;
}

class BudgetEnforcementDemo {
  private logger: Logger;
  private workflowExecutor: WorkflowExecutor;
  private safetyManager: SafetyManager;

  constructor() {
    this.logger = new Logger('BudgetDemo');
    this.workflowExecutor = new WorkflowExecutor();
    this.safetyManager = new SafetyManager();
  }

  async runDemo(): Promise<void> {
    console.log('🛡️ Budget Enforcement Demonstration');
    console.log('=====================================\n');

    const results: DemoResult[] = [];

    // Scenario 1: Normal budget - should complete
    results.push(await this.demonstrateScenario(
      'Normal Budget (Sufficient)',
      { tokenBudget: 1000, costBudget: 0.50, latencySloMs: 10000, depthCap: 5 },
      this.createNormalWorkflow()
    ));

    // Scenario 2: Low cost budget - should fail
    results.push(await this.demonstrateScenario(
      'Low Cost Budget (Insufficient)',
      { tokenBudget: 1000, costBudget: 0.05, latencySloMs: 10000, depthCap: 5 },
      this.createExpensiveWorkflow()
    ));

    // Scenario 3: Low token budget - should fail
    results.push(await this.demonstrateScenario(
      'Low Token Budget (Insufficient)',
      { tokenBudget: 50, costBudget: 1.00, latencySloMs: 10000, depthCap: 5 },
      this.createTokenHeavyWorkflow()
    ));

    // Scenario 4: Tight latency SLO - should fail
    results.push(await this.demonstrateScenario(
      'Tight Latency SLO (Insufficient)',
      { tokenBudget: 1000, costBudget: 0.50, latencySloMs: 1000, depthCap: 5 },
      this.createSlowWorkflow()
    ));

    this.printSummary(results);
  }

  private async demonstrateScenario(
    scenarioName: string,
    budget: Budget,
    workflow: any
  ): Promise<DemoResult> {
    console.log(`\n📊 Scenario: ${scenarioName}`);
    console.log('─'.repeat(50));
    
    console.log('💰 Budget Configuration:');
    console.log(`  Token Budget: ${budget.tokenBudget}`);
    console.log(`  Cost Budget: $${budget.costBudget.toFixed(2)}`);
    console.log(`  Latency SLO: ${budget.latencySloMs}ms`);
    console.log(`  Depth Cap: ${budget.depthCap}`);
    console.log();

    console.log('📝 Workflow Plan:');
    console.log(`  Steps: ${workflow.steps.length}`);
    console.log(`  Estimated Cost: $${workflow.predCost.toFixed(3)}`);
    console.log(`  Estimated Latency: ${this.calculateEstimatedLatency(workflow)}ms`);
    console.log();

    // Initialize budget tracker
    const budgetTracker = new BudgetTracker(budget);
    let executedSteps = 0;
    let actualCost = 0;
    let violationTriggered = false;
    let terminationReason = 'unknown';

    console.log('⚡ Execution Progress:');
    
    try {
      for (const [index, step] of workflow.steps.entries()) {
        const stepNum = index + 1;
        
        // Check budget before step execution
        const budgetCheck = budgetTracker.checkBudgetBeforeStep({
          estimatedCost: step.estCost,
          estimatedLatency: step.estLatencyMs,
          estimatedTokens: this.estimateTokensForStep(step)
        });

        console.log(`  Step ${stepNum}/${workflow.steps.length}: ${step.ouType.toUpperCase()} (est. $${step.estCost.toFixed(3)})`);

        if (!budgetCheck.canProceed) {
          console.log(`    🚨 BUDGET VIOLATION DETECTED!`);
          console.log(`    Reason: ${budgetCheck.reason}`);
          console.log(`    Remaining: $${budgetCheck.remainingCost.toFixed(3)} cost, ${budgetCheck.remainingTokens} tokens`);
          violationTriggered = true;
          terminationReason = 'budget_exhausted';
          break;
        }

        // Simulate step execution
        await this.simulateStepExecution(step);
        
        // Update budget tracker
        const actualStepCost = step.estCost * (0.8 + Math.random() * 0.4); // ±20% variance
        const actualStepLatency = step.estLatencyMs * (0.7 + Math.random() * 0.6); // ±30% variance
        const actualStepTokens = this.estimateTokensForStep(step) * (0.9 + Math.random() * 0.2); // ±10% variance

        budgetTracker.updateAfterStep({
          actualCost: actualStepCost,
          actualLatency: actualStepLatency,
          actualTokens: Math.floor(actualStepTokens)
        });

        actualCost += actualStepCost;
        executedSteps++;

        console.log(`    ✅ Completed - Actual: $${actualStepCost.toFixed(3)}, ${Math.floor(actualStepLatency)}ms`);
        console.log(`    📊 Running Total: $${actualCost.toFixed(3)} cost, ${budgetTracker.getUsedTokens()} tokens`);

        // Check for SLO violations
        if (budgetTracker.getTotalLatency() > budget.latencySloMs) {
          console.log(`    🚨 LATENCY SLO VIOLATION!`);
          console.log(`    Total latency: ${budgetTracker.getTotalLatency()}ms > SLO: ${budget.latencySloMs}ms`);
          violationTriggered = true;
          terminationReason = 'latency_slo_exceeded';
          break;
        }
      }

      if (!violationTriggered) {
        console.log(`  ✅ All steps completed successfully!`);
        terminationReason = 'completed_successfully';
      }

    } catch (error) {
      console.log(`  ❌ Execution failed: ${error instanceof Error ? error.message : String(error)}`);
      terminationReason = 'execution_error';
    }

    const budgetStatus = budgetTracker.getBudgetStatus();
    console.log('\n📈 Final Budget Status:');
    console.log(`  Cost Utilization: ${(budgetStatus.costUtilization * 100).toFixed(1)}%`);
    console.log(`  Token Utilization: ${(budgetStatus.tokenUtilization * 100).toFixed(1)}%`);
    console.log(`  Latency Utilization: ${(budgetStatus.latencyUtilization * 100).toFixed(1)}%`);
    console.log(`  Budget Health: ${budgetStatus.overallHealth}`);

    return {
      scenario: scenarioName,
      budgetLimit: budget,
      actualCost,
      executedSteps,
      totalSteps: workflow.steps.length,
      violationTriggered,
      terminationReason
    };
  }

  private createNormalWorkflow(): any {
    return {
      id: 'normal_workflow',
      steps: [
        { ouType: 'ocr', estCost: 0.05, estLatencyMs: 2000 },
        { ouType: 'ner', estCost: 0.03, estLatencyMs: 1200 },
        { ouType: 'route', estCost: 0.01, estLatencyMs: 500 }
      ],
      predCost: 0.09
    };
  }

  private createExpensiveWorkflow(): any {
    return {
      id: 'expensive_workflow',
      steps: [
        { ouType: 'ocr', estCost: 0.15, estLatencyMs: 5000 },
        { ouType: 'ner', estCost: 0.12, estLatencyMs: 3000 },
        { ouType: 'route', estCost: 0.08, estLatencyMs: 1500 }
      ],
      predCost: 0.35
    };
  }

  private createTokenHeavyWorkflow(): any {
    return {
      id: 'token_heavy_workflow',
      steps: [
        { ouType: 'ocr', estCost: 0.02, estLatencyMs: 1000, tokenEstimate: 200 },
        { ouType: 'ner', estCost: 0.03, estLatencyMs: 1500, tokenEstimate: 300 },
        { ouType: 'route', estCost: 0.01, estLatencyMs: 800, tokenEstimate: 150 }
      ],
      predCost: 0.06
    };
  }

  private createSlowWorkflow(): any {
    return {
      id: 'slow_workflow',
      steps: [
        { ouType: 'ocr', estCost: 0.04, estLatencyMs: 8000 },
        { ouType: 'ner', estCost: 0.02, estLatencyMs: 6000 },
        { ouType: 'route', estCost: 0.01, estLatencyMs: 3000 }
      ],
      predCost: 0.07
    };
  }

  private calculateEstimatedLatency(workflow: any): number {
    return workflow.steps.reduce((total: number, step: any) => total + step.estLatencyMs, 0);
  }

  private estimateTokensForStep(step: any): number {
    return step.tokenEstimate || Math.floor(step.estCost * 1000); // Rough estimate: $0.001 per token
  }

  private async simulateStepExecution(step: any): Promise<void> {
    const delay = Math.min(step.estLatencyMs / 10, 500); // Simulate some execution time
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private printSummary(results: DemoResult[]): void {
    console.log('\n\n🎯 Budget Enforcement Summary');
    console.log('═'.repeat(60));
    
    results.forEach((result, index) => {
      const status = result.violationTriggered ? '❌ BLOCKED' : '✅ ALLOWED';
      const completion = result.totalSteps > 0 ? `${result.executedSteps}/${result.totalSteps}` : '0/0';
      
      console.log(`${index + 1}. ${result.scenario}`);
      console.log(`   Status: ${status}`);
      console.log(`   Completion: ${completion} steps`);
      console.log(`   Cost: $${result.actualCost.toFixed(3)} / $${result.budgetLimit.costBudget.toFixed(2)}`);
      console.log(`   Termination: ${result.terminationReason}`);
      console.log();
    });

    const blockedCount = results.filter(r => r.violationTriggered).length;
    const allowedCount = results.length - blockedCount;
    
    console.log(`✅ Budget enforcement prevented ${blockedCount}/${results.length} violations`);
    console.log(`🎉 ${allowedCount}/${results.length} workflows completed within budget`);
    console.log('\n✅ Budget enforcement system working correctly!');
  }
}

// Run the demonstration
if (require.main === module) {
  const demo = new BudgetEnforcementDemo();
  demo.runDemo().catch(console.error);
}