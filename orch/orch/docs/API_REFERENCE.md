# Mock gRPC Policy Service v1.1 - API Reference

## Overview

This document provides comprehensive API reference for the Mock gRPC Policy Service v1.1. The service implements a complete policy management system with TRPO reinforcement learning capabilities, workflow orchestration, and batch operations.

## Service Definition

**Package:** `policy.v1`  
**Service:** `PolicyService`  
**Protocol:** gRPC  
**Port:** 50051

## Core Policy Methods

### CreatePolicy

Creates a new policy in the system.

```protobuf
rpc CreatePolicy(CreatePolicyRequest) returns (CreatePolicyResponse);
```

**Request:**
```json
{
  "policy": {
    "name": "RBAC Policy",
    "description": "Role-based access control",
    "type": "POLICY_TYPE_ACCESS",
    "parameters": {
      "default_action": "deny",
      "log_violations": "true"
    }
  },
  "validate_only": false
}
```

**Response:**
```json
{
  "policy": {
    "id": "policy-123",
    "name": "RBAC Policy",
    "status": "POLICY_STATUS_ACTIVE",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "validation_errors": []
}
```

### GetPolicy

Retrieves a policy by ID.

```protobuf
rpc GetPolicy(GetPolicyRequest) returns (GetPolicyResponse);
```

### UpdatePolicy

Updates an existing policy.

```protobuf
rpc UpdatePolicy(UpdatePolicyRequest) returns (UpdatePolicyResponse);
```

### DeletePolicy

Deletes a policy.

```protobuf
rpc DeletePolicy(DeletePolicyRequest) returns (DeletePolicyResponse);
```

### ListPolicies

Lists policies with pagination support.

```protobuf
rpc ListPolicies(ListPoliciesRequest) returns (ListPoliciesResponse);
```

## Workflow Management

### GenerateWorkflowPlan

Generates a realistic workflow plan based on complexity requirements.

```protobuf
rpc GenerateWorkflowPlan(GenerateWorkflowPlanRequest) returns (GenerateWorkflowPlanResponse);
```

**Request:**
```json
{
  "policy_id": "policy-123",
  "complexity": "WORKFLOW_COMPLEXITY_MODERATE",
  "requirements": ["authenticate", "authorize", "audit", "notify"]
}
```

**Response:**
```json
{
  "plan": {
    "id": "workflow-456",
    "name": "Workflow-789",
    "steps": [
      {
        "id": "step-1",
        "name": "Validate Input",
        "action": "validate_input",
        "timeout_seconds": 30,
        "parallel_execution": false
      }
    ],
    "estimated_duration_seconds": 315
  },
  "confidence_score": 0.87,
  "recommendations": [
    "Consider parallel execution for independent steps"
  ]
}
```

### ExecuteWorkflow

Executes a generated workflow plan.

```protobuf
rpc ExecuteWorkflow(ExecuteWorkflowRequest) returns (ExecuteWorkflowResponse);
```

### GetWorkflowStatus

Retrieves the current status of a workflow execution.

```protobuf
rpc GetWorkflowStatus(GetWorkflowStatusRequest) returns (GetWorkflowStatusResponse);
```

## TRPO Methods

### EvaluateSurrogate

Evaluates surrogate loss with realistic TRPO metrics simulation.

```protobuf
rpc EvaluateSurrogate(EvaluateSurrogateRequest) returns (EvaluateSurrogateResponse);
```

**Request:**
```json
{
  "policy_id": "policy-123",
  "trajectory": [
    {
      "state": [0.1, 0.5, -0.3],
      "action": [0.2],
      "reward": 1.0,
      "value_estimate": 5.2,
      "log_probability": -0.693
    }
  ],
  "return_detailed_metrics": true,
  "trpo_params": {
    "delta": 0.01,
    "gamma": 0.99,
    "lambda": 0.95,
    "max_kl_samples": 1000,
    "cg_damping": 0.1,
    "cg_iterations": 10
  }
}
```

**Response:**
```json
{
  "surrogate_loss": -0.0234,
  "kl_divergence": 0.0087,
  "policy_entropy": 2.145,
  "advantage_variance": 0.425,
  "detailed_metrics": {
    "policy_loss": -0.0234,
    "value_loss": 0.156,
    "entropy_loss": -0.0214,
    "advantage_mean": 0.0123,
    "advantage_std": 0.652,
    "explained_variance": 0.784,
    "gradient_norm": 2.341,
    "trajectory_length": 100,
    "reward_distribution": [-0.5, 0.2, 1.0, ...]
  },
  "action_probabilities": [0.65, 0.23, 0.89, ...]
}
```

### UpdatePolicyGradient

Updates policy parameters using gradients.

```protobuf
rpc UpdatePolicyGradient(UpdatePolicyGradientRequest) returns (UpdatePolicyGradientResponse);
```

### ComputeAdvantage

Computes Generalized Advantage Estimation (GAE).

```protobuf
rpc ComputeAdvantage(ComputeAdvantageRequest) returns (ComputeAdvantageResponse);
```

## Batch Operations

### BatchCreatePolicies

Creates multiple policies in a single request.

```protobuf
rpc BatchCreatePolicies(BatchCreatePoliciesRequest) returns (BatchCreatePoliciesResponse);
```

### BatchEvaluate

Evaluates multiple TRPO trajectories in batch.

```protobuf
rpc BatchEvaluate(BatchEvaluateRequest) returns (BatchEvaluateResponse);
```

### BatchUpdate

Updates multiple policies atomically.

```protobuf
rpc BatchUpdate(BatchUpdateRequest) returns (BatchUpdateResponse);
```

## Authentication & Keys

### GetSigningKeys

Provides test signing keys for development and testing.

```protobuf
rpc GetSigningKeys(GetSigningKeysRequest) returns (GetSigningKeysResponse);
```

**Request:**
```json
{
  "key_type": "RSA",
  "key_size": 2048
}
```

**Response:**
```json
{
  "keys": [
    {
      "id": "key-123",
      "type": "RSA",
      "public_key": "-----BEGIN PUBLIC KEY-----\n...",
      "private_key": "-----BEGIN PRIVATE KEY-----\n...",
      "is_test_key": true,
      "created_at": "2024-01-01T00:00:00Z",
      "expires_at": "2024-01-31T00:00:00Z"
    }
  ]
}
```

### ValidateSignature

Validates digital signatures using provided keys.

```protobuf
rpc ValidateSignature(ValidateSignatureRequest) returns (ValidateSignatureResponse);
```

### RefreshToken

Refreshes authentication tokens.

```protobuf
rpc RefreshToken(RefreshTokenRequest) returns (RefreshTokenResponse);
```

## Health & Monitoring

### HealthCheck

Provides service health status.

```protobuf
rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
```

**Response:**
```json
{
  "status": "HEALTH_STATUS_HEALTHY",
  "message": "Service is healthy",
  "details": {
    "uptime": "3600s",
    "memory_usage": "128MB",
    "policies_count": "15",
    "workflows_count": "5"
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### GetMetrics

Retrieves service performance metrics.

```protobuf
rpc GetMetrics(GetMetricsRequest) returns (GetMetricsResponse);
```

## Error Handling

The service uses standard gRPC status codes:

- `OK` (0): Success
- `INVALID_ARGUMENT` (3): Invalid request parameters
- `NOT_FOUND` (5): Resource not found
- `ALREADY_EXISTS` (6): Resource already exists
- `INTERNAL` (13): Internal server error

## Data Types

### PolicyType
- `POLICY_TYPE_ACCESS`: Access control policies
- `POLICY_TYPE_SECURITY`: Security policies
- `POLICY_TYPE_WORKFLOW`: Workflow policies
- `POLICY_TYPE_REINFORCEMENT`: Reinforcement learning policies
- `POLICY_TYPE_COMPLIANCE`: Compliance policies

### WorkflowComplexity
- `WORKFLOW_COMPLEXITY_SIMPLE`: 3 steps
- `WORKFLOW_COMPLEXITY_MODERATE`: 7 steps
- `WORKFLOW_COMPLEXITY_COMPLEX`: 12 steps
- `WORKFLOW_COMPLEXITY_ENTERPRISE`: 20 steps

## Testing Examples

### Using grpcurl

```bash
# Health check
grpcurl -plaintext localhost:50051 policy.v1.PolicyService/HealthCheck

# Create policy
grpcurl -plaintext -d '{"policy": {"name": "Test Policy", "type": "POLICY_TYPE_ACCESS"}}' \
  localhost:50051 policy.v1.PolicyService/CreatePolicy

# List policies
grpcurl -plaintext -d '{"page_size": 10}' \
  localhost:50051 policy.v1.PolicyService/ListPolicies
```

### Using Node.js Test Client

```bash
# Run comprehensive test
node scripts/test-client.js

# Test specific server
node scripts/test-client.js --server localhost:50052
```

## Performance Characteristics

- **Throughput**: Handles 1000+ requests per second
- **Latency**: Sub-millisecond response times for simple operations
- **TRPO Simulation**: Realistic metrics based on trajectory size
- **Batch Processing**: Efficient parallel processing for batch operations
- **Memory Usage**: Approximately 128MB base memory usage

## Mock Data Features

### Realistic Policy Generation
- Varied policy types and rules
- Consistent metadata and timestamps
- Realistic parameter values

### Dynamic Workflow Plans
- Step count based on complexity
- Dependency relationships between steps
- Realistic execution time estimates

### TRPO Metrics Simulation
- Advantage estimation with proper variance
- KL divergence within reasonable bounds
- Policy entropy and loss calculations
- Reward distribution patterns

### Test Key Generation
- RSA, ECDSA key support
- Proper PEM format
- Expiration date handling
- Test-only markers for safety