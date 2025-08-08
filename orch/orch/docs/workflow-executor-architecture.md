# Enhanced WorkflowExecutor Architecture

## Overview

The Enhanced WorkflowExecutor is a comprehensive orchestration engine that handles multi-step workflow execution with budget tracking, safety enforcement, tool integration, and trajectory recording. It provides deterministic execution capabilities with full replay support.

## Core Components

### 1. WorkflowExecutor
The main orchestration engine that coordinates all workflow execution aspects.

**Key Features:**
- Multi-step sequential and parallel execution
- Real-time budget tracking and enforcement
- Comprehensive safety validation
- Dynamic tool loading via registry
- Plan execution with recursion limits
- Complete trajectory recording
- Deterministic replay capabilities

### 2. Tool Registry
Dynamic tool loading and execution system based on `ou_type` parameters.

**Registered Tools:**
- `ocr`: Optical Character Recognition processing
- `ner`: Named Entity Recognition
- `route`: Request routing and decision making
- `plan_execution`: Sub-workflow orchestration

**Features:**
- Cost multipliers per tool
- Execution metrics tracking
- Timeout management
- Retry policies

### 3. Budget Tracker
Real-time cost accumulation and budget enforcement.

**Tracked Metrics:**
- Token consumption
- Compute time
- Memory usage
- API calls
- Monetary cost
- Custom metrics

**Budget Enforcement:**
- Pre-execution budget checks
- Real-time cost accumulation
- Threshold alerts
- Budget exceeded termination

### 4. Safety Manager
Comprehensive safety validation and constraint enforcement.

**Safety Features:**
- JSON schema validation
- Budget limit enforcement
- Execution depth limits
- Capability isolation
- Content filtering
- Custom validators

### 5. Replay Manager
Deterministic replay system for workflow executions.

**Replay Features:**
- Complete trajectory recording
- Environment state capture
- External dependency mocking
- Deterministic randomization
- Replay validation

## Execution Flow

### 1. Initialization
```typescript
const executor = new WorkflowExecutor(safetyManager);
const workflow: WorkflowDefinition = {
  id: 'my-workflow',
  name: 'My Workflow',
  version: '1.0.0',
  steps: [...],
  budgetLimit: { tokens: 10000, monetaryCost: 1.0 }
};
```

### 2. Execution Process
1. **Pre-execution Setup**
   - Initialize budget tracking
   - Setup safety constraints
   - Create execution context
   - Generate trajectory recording

2. **Step Execution Loop**
   - For each step in workflow:
     - Validate step safety
     - Check budget limits
     - Execute step via appropriate method
     - Record step results
     - Update context and trajectory
     - Accumulate costs

3. **Step Types**
   - **Action**: Execute via tool registry or default executor
   - **Decision**: Evaluate condition and branch
   - **Parallel**: Execute child steps concurrently
   - **Sequential**: Execute child steps in order
   - **Condition**: Conditional execution of children

4. **Post-execution**
   - Generate final outcome
   - Clean up resources
   - Emit completion events

### 3. Tool Integration
```typescript
// Steps with ou_type use tool registry
{
  id: 'ocr-step',
  type: 'action',
  action: {
    type: 'ocr',
    parameters: {
      ou_type: 'ocr',
      imageUrl: 'image.jpg',
      options: { language: 'en' }
    }
  }
}
```

### 4. Plan Execution
```typescript
// Nested workflow execution
{
  id: 'plan-step',
  type: 'action', 
  action: {
    type: 'plan_execution',
    parameters: {
      ou_type: 'plan_execution',
      plan: {
        id: 'sub-plan',
        steps: [...] // Sub-workflow steps
      }
    }
  }
}
```

## Key Interfaces

### WorkflowDefinition
```typescript
interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  steps: WorkflowStep[];
  initialContext?: Partial<WorkflowContext>;
  budgetLimit?: BudgetInfo;
  safetyConstraints?: SafetyConstraint[];
}
```

### ExecutionOutcome
```typescript
interface ExecutionOutcome {
  workflowId: string;
  executionId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'budget_exceeded' | 'safety_violation';
  startTime: Date;
  endTime: Date;
  duration: number;
  totalCost: BudgetInfo;
  stepResults: Record<string, StepResult>;
  safetyViolations: SafetyViolation[];
  hasViolations: boolean;
  violationFlags: ViolationFlags;
  finalContext: WorkflowContext;
}
```

### Trajectory
```typescript
interface Trajectory {
  executionId: string;
  workflowId: string;
  steps: TrajectoryStep[];
  totalDuration: number;
  totalCost: BudgetInfo;
  contextEvolution: WorkflowContext[];
  decisionPoints: DecisionPoint[];
  parallelBranches: ParallelBranch[];
  replayInfo: ReplayInfo;
}
```

## Usage Examples

### Basic Workflow Execution
```typescript
const executor = new WorkflowExecutor();

const workflow: WorkflowDefinition = {
  id: 'document-processing',
  name: 'Document Processing Workflow',
  version: '1.0.0',
  steps: [
    {
      id: 'ocr-step',
      type: 'action',
      name: 'Extract Text',
      action: {
        type: 'ocr',
        parameters: {
          ou_type: 'ocr',
          imageUrl: 'document.pdf',
          options: { language: 'en' }
        }
      }
    },
    {
      id: 'ner-step',
      type: 'action',
      name: 'Extract Entities',
      action: {
        type: 'ner',
        parameters: {
          ou_type: 'ner',
          text: '${ocr-step.result.text}',
          entityTypes: ['PERSON', 'ORG', 'DATE']
        }
      }
    }
  ],
  budgetLimit: {
    tokens: 5000,
    monetaryCost: 0.50,
    computeTime: 30000
  }
};

const result = await executor.execute(workflow);
console.log('Execution result:', result.status);
console.log('Total cost:', result.totalCost);
console.log('Steps executed:', Object.keys(result.stepResults).length);
```

### Plan Execution
```typescript
const planWorkflow: WorkflowDefinition = {
  id: 'batch-processing',
  name: 'Batch Document Processing',
  version: '1.0.0',
  steps: [
    {
      id: 'batch-plan',
      type: 'action',
      name: 'Execute Batch Plan',
      action: {
        type: 'plan_execution',
        parameters: {
          ou_type: 'plan_execution',
          plan: {
            id: 'document-batch',
            name: 'Document Batch',
            version: '1.0.0',
            steps: [
              {
                id: 'validate-documents',
                type: 'action',
                name: 'Validate Documents',
                ou_type: 'route',
                args_json: {
                  request: { path: '/validate', method: 'POST' },
                  routes: [{ id: 'validator', pattern: '/validate' }]
                }
              },
              {
                id: 'process-documents',
                type: 'parallel',
                name: 'Process All Documents',
                children: documents.map(doc => ({
                  id: `process-${doc.id}`,
                  type: 'action',
                  name: `Process ${doc.name}`,
                  ou_type: 'ocr',
                  args_json: { imageUrl: doc.url }
                }))
              }
            ]
          }
        }
      }
    }
  ]
};

const result = await executor.execute(planWorkflow);
```

### Trajectory Recording and Replay
```typescript
// Execute with trajectory recording
const options: ExecutionOptions = {
  recordTrajectory: true,
  enableReplay: true,
  budgetLimit: { tokens: 10000 }
};

const originalResult = await executor.execute(workflow, options);

// Replay the execution
if (originalResult.trajectory) {
  const replayResult = await executor.replay(
    originalResult.trajectory,
    originalResult.trajectory.replayInfo,
    { dryRun: true }
  );
  
  console.log('Original duration:', originalResult.duration);
  console.log('Replay duration:', replayResult.duration);
}
```

## Performance Characteristics

### Throughput
- **Sequential Steps**: ~100-500 steps/second depending on complexity
- **Parallel Steps**: Limited by available resources and tool execution time
- **Memory Usage**: ~1-10MB per active execution depending on context size

### Scalability
- **Concurrent Executions**: Limited by memory and tool constraints
- **Step Count**: No hard limits, constrained by budget and safety limits
- **Plan Depth**: Configurable maximum recursion depth (default: 5 levels)

## Error Handling

### Error Types
1. **Safety Violations**: Step validation failures, constraint violations
2. **Budget Exceeded**: Cost limits reached during execution
3. **Tool Errors**: Tool execution failures, timeouts
4. **Plan Errors**: Invalid plan structure, recursion limits
5. **System Errors**: Infrastructure failures, resource constraints

### Recovery Strategies
- **Retry Logic**: Configurable retry policies per step
- **Fallback Execution**: Default executors for unknown tools
- **Graceful Degradation**: Continue execution where possible
- **Error Isolation**: Prevent single step failures from cascading

## Monitoring and Metrics

### Execution Metrics
- Active executions count
- Tool execution statistics
- Budget utilization rates
- Safety violation rates

### Performance Metrics  
- Step execution times
- Cost accumulation rates
- Memory usage patterns
- Error frequency

### Access Patterns
```typescript
const metrics = executor.getExecutionMetrics();
console.log('Active executions:', metrics.activeExecutions);
console.log('Tool metrics:', metrics.toolMetrics);
console.log('Safety stats:', metrics.safetyStats);

const toolRegistry = executor.getToolRegistry();
console.log('Available tools:', toolRegistry.getAllTools());

const safetyManager = executor.getSafetyManager();
console.log('Safety configuration:', safetyManager.getStats());
```

## Integration Points

### External Systems
- **Tool Providers**: OCR services, NLP APIs, routing engines
- **Safety Services**: Validation APIs, content filters
- **Storage Systems**: Trajectory persistence, context storage
- **Monitoring**: Metrics collection, alerting systems

### Extensibility
- **Custom Tools**: Register new tool executors
- **Safety Validators**: Add custom safety constraints  
- **Step Types**: Extend with new execution patterns
- **Replay Providers**: Custom mock data sources

This architecture provides a robust, scalable, and extensible foundation for complex workflow orchestration with comprehensive safety and monitoring capabilities.