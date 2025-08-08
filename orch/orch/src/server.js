const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Load proto file
const PROTO_PATH = path.join(__dirname, '../proto/policy_service.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const policyProto = grpc.loadPackageDefinition(packageDefinition).policy.v1;

// In-memory storage
const storage = {
  policies: new Map(),
  workflows: new Map(),
  executions: new Map(),
  signingKeys: new Map(),
  metrics: {
    requests: 0,
    errors: 0,
    policies_created: 0,
    workflows_executed: 0
  }
};

// Mock data generators
class MockDataGenerator {
  static generatePolicy(overrides = {}) {
    const id = overrides.id || uuidv4();
    const now = new Date();
    
    return {
      id,
      name: overrides.name || `Policy-${Math.floor(Math.random() * 1000)}`,
      description: overrides.description || `Auto-generated policy for testing purposes`,
      type: overrides.type || this.randomPolicyType(),
      status: overrides.status || 'POLICY_STATUS_ACTIVE',
      parameters: overrides.parameters || {
        'max_retries': '3',
        'timeout': '30s',
        'priority': 'medium'
      },
      rules: overrides.rules || this.generatePolicyRules(),
      created_at: { seconds: Math.floor(now.getTime() / 1000) },
      updated_at: { seconds: Math.floor(now.getTime() / 1000) },
      version: overrides.version || '1.0.0',
      tags: overrides.tags || ['test', 'mock', 'v1.1'],
      metadata: overrides.metadata || {
        owner: 'system',
        team: 'engineering',
        labels: { 'environment': 'test', 'service': 'mock' },
        environments: ['development', 'testing']
      }
    };
  }

  static generatePolicyRules(count = 3) {
    const rules = [];
    const actions = ['allow', 'deny', 'log', 'alert', 'redirect'];
    const conditions = [
      'user.role == "admin"',
      'time.hour >= 9 && time.hour <= 17',
      'request.method == "POST"',
      'resource.sensitivity == "high"',
      'source.ip in allowlist'
    ];

    for (let i = 0; i < count; i++) {
      rules.push({
        id: uuidv4(),
        condition: conditions[Math.floor(Math.random() * conditions.length)],
        action: actions[Math.floor(Math.random() * actions.length)],
        priority: Math.floor(Math.random() * 100),
        enabled: Math.random() > 0.2,
        parameters: {}
      });
    }
    return rules;
  }

  static randomPolicyType() {
    const types = [
      'POLICY_TYPE_ACCESS',
      'POLICY_TYPE_SECURITY', 
      'POLICY_TYPE_WORKFLOW',
      'POLICY_TYPE_REINFORCEMENT',
      'POLICY_TYPE_COMPLIANCE'
    ];
    return types[Math.floor(Math.random() * types.length)];
  }

  static generateWorkflowPlan(complexity = 'WORKFLOW_COMPLEXITY_MODERATE') {
    const id = uuidv4();
    const stepCounts = {
      'WORKFLOW_COMPLEXITY_SIMPLE': 3,
      'WORKFLOW_COMPLEXITY_MODERATE': 7,
      'WORKFLOW_COMPLEXITY_COMPLEX': 12,
      'WORKFLOW_COMPLEXITY_ENTERPRISE': 20
    };

    const stepCount = stepCounts[complexity] || 7;
    const steps = this.generateWorkflowSteps(stepCount);

    return {
      id,
      name: `Workflow-${Math.floor(Math.random() * 1000)}`,
      description: `Auto-generated ${complexity.toLowerCase()} workflow plan`,
      steps,
      parameters: {
        'max_parallel': (stepCount > 10 ? '5' : '3'),
        'timeout': `${stepCount * 30}s`,
        'retry_policy': 'exponential_backoff'
      },
      created_at: { seconds: Math.floor(Date.now() / 1000) },
      status: 'WORKFLOW_STATUS_PENDING',
      estimated_duration_seconds: stepCount * 45
    };
  }

  static generateWorkflowSteps(count) {
    const steps = [];
    const actions = [
      'validate_input', 'fetch_data', 'transform_data', 'apply_policy',
      'send_notification', 'log_event', 'update_database', 'call_api',
      'generate_report', 'cleanup_resources', 'send_email', 'backup_data',
      'validate_results', 'archive_files', 'sync_external'
    ];

    for (let i = 0; i < count; i++) {
      const stepId = uuidv4();
      const dependencies = i > 0 && Math.random() > 0.3 ? 
        [steps[Math.floor(Math.random() * i)].id] : [];

      steps.push({
        id: stepId,
        name: `Step-${i + 1}`,
        action: actions[Math.floor(Math.random() * actions.length)],
        parameters: {
          'input_param': `value_${i}`,
          'timeout': '30s',
          'retries': '2'
        },
        dependencies,
        timeout_seconds: 30 + Math.floor(Math.random() * 60),
        parallel_execution: dependencies.length === 0 && Math.random() > 0.5,
        status: 'WORKFLOW_STEP_STATUS_PENDING',
        result: '',
        started_at: null,
        completed_at: null
      });
    }

    return steps;
  }

  static generateTRPOMetrics(trajectoryLength = 100) {
    // Simulate realistic TRPO metrics
    const advantageMean = (Math.random() - 0.5) * 0.4; // -0.2 to 0.2
    const advantageStd = 0.5 + Math.random() * 1.5; // 0.5 to 2.0
    const klDivergence = Math.random() * 0.1; // 0 to 0.1
    const policyEntropy = 1.0 + Math.random() * 2.0; // 1.0 to 3.0

    return {
      policy_loss: -Math.abs(advantageMean) + Math.random() * 0.1,
      value_loss: Math.random() * 0.5,
      entropy_loss: -policyEntropy * 0.01,
      kl_divergence: klDivergence,
      advantage_mean: advantageMean,
      advantage_std: advantageStd,
      explained_variance: Math.max(0, Math.min(1, 0.3 + Math.random() * 0.6)),
      gradient_norm: Math.random() * 5.0,
      trajectory_length: trajectoryLength,
      reward_distribution: Array.from({ length: 10 }, () => Math.random() * 2 - 1)
    };
  }

  static generateSigningKeys(keyType = 'RSA', keySize = 2048) {
    const keyPair = crypto.generateKeyPairSync(keyType.toLowerCase(), {
      modulusLength: keySize,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    return {
      id: uuidv4(),
      type: keyType,
      public_key: keyPair.publicKey,
      private_key: keyPair.privateKey,
      created_at: { seconds: Math.floor(now.getTime() / 1000) },
      expires_at: { seconds: Math.floor(expiresAt.getTime() / 1000) },
      is_test_key: true
    };
  }
}

// Policy Service Implementation
const policyService = {
  // Core Policy Methods
  CreatePolicy: (call, callback) => {
    try {
      storage.metrics.requests++;
      const request = call.request;
      
      if (!request.policy) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Policy is required'
        });
      }

      const policy = MockDataGenerator.generatePolicy(request.policy);
      storage.policies.set(policy.id, policy);
      storage.metrics.policies_created++;
      
      logger.info(`Created policy: ${policy.id}`);
      
      callback(null, {
        policy,
        validation_errors: []
      });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('CreatePolicy error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  GetPolicy: (call, callback) => {
    try {
      storage.metrics.requests++;
      const { id } = call.request;
      
      if (!id) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Policy ID is required'
        });
      }

      const policy = storage.policies.get(id);
      if (!policy) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: 'Policy not found'
        });
      }

      callback(null, { policy });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('GetPolicy error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  UpdatePolicy: (call, callback) => {
    try {
      storage.metrics.requests++;
      const request = call.request;
      
      if (!request.policy || !request.policy.id) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Policy with ID is required'
        });
      }

      const existingPolicy = storage.policies.get(request.policy.id);
      if (!existingPolicy) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: 'Policy not found'
        });
      }

      const updatedPolicy = { 
        ...existingPolicy, 
        ...request.policy,
        updated_at: { seconds: Math.floor(Date.now() / 1000) }
      };
      
      storage.policies.set(updatedPolicy.id, updatedPolicy);
      logger.info(`Updated policy: ${updatedPolicy.id}`);
      
      callback(null, {
        policy: updatedPolicy,
        validation_errors: []
      });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('UpdatePolicy error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  DeletePolicy: (call, callback) => {
    try {
      storage.metrics.requests++;
      const { id } = call.request;
      
      if (!id) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Policy ID is required'
        });
      }

      const deleted = storage.policies.delete(id);
      if (!deleted) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: 'Policy not found'
        });
      }

      logger.info(`Deleted policy: ${id}`);
      callback(null, {
        success: true,
        message: 'Policy deleted successfully'
      });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('DeletePolicy error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  ListPolicies: (call, callback) => {
    try {
      storage.metrics.requests++;
      const request = call.request;
      const pageSize = request.page_size || 50;
      const policies = Array.from(storage.policies.values());
      
      // Simple pagination
      const startIndex = 0; // Simplified for mock
      const endIndex = Math.min(startIndex + pageSize, policies.length);
      const paginatedPolicies = policies.slice(startIndex, endIndex);
      
      callback(null, {
        policies: paginatedPolicies,
        next_page_token: endIndex < policies.length ? 'next' : '',
        total_count: policies.length
      });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('ListPolicies error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  // Workflow Management
  GenerateWorkflowPlan: (call, callback) => {
    try {
      storage.metrics.requests++;
      const request = call.request;
      
      const plan = MockDataGenerator.generateWorkflowPlan(
        request.complexity || 'WORKFLOW_COMPLEXITY_MODERATE'
      );
      
      storage.workflows.set(plan.id, plan);
      
      callback(null, {
        plan,
        recommendations: [
          'Consider parallel execution for independent steps',
          'Add monitoring and alerting for critical steps',
          'Implement rollback mechanisms for data changes'
        ],
        confidence_score: 0.85 + Math.random() * 0.1
      });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('GenerateWorkflowPlan error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  ExecuteWorkflow: (call, callback) => {
    try {
      storage.metrics.requests++;
      const { workflow_id, parameters, async_execution } = call.request;
      
      if (!workflow_id) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Workflow ID is required'
        });
      }

      const workflow = storage.workflows.get(workflow_id);
      if (!workflow) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: 'Workflow not found'
        });
      }

      const executionId = uuidv4();
      const execution = {
        id: executionId,
        workflow_id,
        status: 'WORKFLOW_STATUS_RUNNING',
        parameters: parameters || {},
        started_at: { seconds: Math.floor(Date.now() / 1000) }
      };

      storage.executions.set(executionId, execution);
      storage.metrics.workflows_executed++;
      
      // Simulate async execution
      if (async_execution) {
        setTimeout(() => {
          execution.status = 'WORKFLOW_STATUS_COMPLETED';
          execution.completed_at = { seconds: Math.floor(Date.now() / 1000) };
          logger.info(`Workflow execution completed: ${executionId}`);
        }, Math.random() * 5000 + 1000);
      }

      callback(null, {
        execution_id: executionId,
        status: execution.status,
        message: 'Workflow execution started'
      });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('ExecuteWorkflow error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  GetWorkflowStatus: (call, callback) => {
    try {
      storage.metrics.requests++;
      const { execution_id } = call.request;
      
      if (!execution_id) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Execution ID is required'
        });
      }

      const execution = storage.executions.get(execution_id);
      if (!execution) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: 'Execution not found'
        });
      }

      const workflow = storage.workflows.get(execution.workflow_id);
      const progress = execution.status === 'WORKFLOW_STATUS_COMPLETED' ? 1.0 : 
                      execution.status === 'WORKFLOW_STATUS_RUNNING' ? Math.random() * 0.8 + 0.1 : 0.0;

      callback(null, {
        plan: workflow,
        steps: workflow ? workflow.steps : [],
        progress
      });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('GetWorkflowStatus error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  // TRPO Methods
  EvaluateSurrogate: (call, callback) => {
    try {
      storage.metrics.requests++;
      const request = call.request;
      
      if (!request.trajectory || request.trajectory.length === 0) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Trajectory data is required'
        });
      }

      const trajectoryLength = request.trajectory.length;
      const detailedMetrics = MockDataGenerator.generateTRPOMetrics(trajectoryLength);
      
      // Generate action probabilities
      const actionProbs = Array.from({ length: trajectoryLength }, 
        () => Math.random() * 0.8 + 0.1);

      const response = {
        surrogate_loss: detailedMetrics.policy_loss,
        kl_divergence: detailedMetrics.kl_divergence,
        policy_entropy: 1.0 + Math.random() * 2.0,
        advantage_variance: Math.pow(detailedMetrics.advantage_std, 2),
        action_probabilities: actionProbs
      };

      if (request.return_detailed_metrics) {
        response.detailed_metrics = detailedMetrics;
      }

      logger.info(`TRPO evaluation completed for ${trajectoryLength} trajectory points`);
      callback(null, response);
    } catch (error) {
      storage.metrics.errors++;
      logger.error('EvaluateSurrogate error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  UpdatePolicyGradient: (call, callback) => {
    try {
      storage.metrics.requests++;
      const request = call.request;
      
      if (!request.policy_id || !request.gradients || request.gradients.length === 0) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Policy ID and gradients are required'
        });
      }

      const policy = storage.policies.get(request.policy_id);
      if (!policy) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: 'Policy not found'
        });
      }

      // Simulate policy update
      const improvement = (Math.random() - 0.5) * 0.2; // -0.1 to 0.1
      const newVersion = `${policy.version}.${Math.floor(Date.now() / 1000)}`;
      
      policy.version = newVersion;
      policy.updated_at = { seconds: Math.floor(Date.now() / 1000) };
      
      const metrics = MockDataGenerator.generateTRPOMetrics();

      callback(null, {
        success: true,
        policy_improvement: improvement,
        updated_policy_version: newVersion,
        metrics
      });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('UpdatePolicyGradient error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  ComputeAdvantage: (call, callback) => {
    try {
      storage.metrics.requests++;
      const request = call.request;
      
      if (!request.trajectory || request.trajectory.length === 0) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Trajectory data is required'
        });
      }

      const gamma = request.gamma || 0.99;
      const lambda = request.lambda || 0.95;
      const trajectoryLength = request.trajectory.length;
      
      // Simulate GAE computation
      const advantages = Array.from({ length: trajectoryLength }, () => 
        (Math.random() - 0.5) * 2.0);
      const valueTargets = Array.from({ length: trajectoryLength }, () => 
        Math.random() * 10.0);
      
      const avgAdvantage = advantages.reduce((sum, adv) => sum + adv, 0) / advantages.length;
      const advVariance = advantages.reduce((sum, adv) => 
        sum + Math.pow(adv - avgAdvantage, 2), 0) / advantages.length;

      callback(null, {
        advantages,
        value_targets: valueTargets,
        average_advantage: avgAdvantage,
        advantage_variance: advVariance
      });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('ComputeAdvantage error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  // Batch Operations
  BatchCreatePolicies: (call, callback) => {
    try {
      storage.metrics.requests++;
      const requests = call.request.requests || [];
      
      if (requests.length === 0) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'At least one policy request is required'
        });
      }

      const responses = [];
      const errors = [];

      requests.forEach((request, index) => {
        try {
          const policy = MockDataGenerator.generatePolicy(request.policy);
          storage.policies.set(policy.id, policy);
          storage.metrics.policies_created++;
          
          responses.push({
            policy,
            validation_errors: []
          });
        } catch (error) {
          errors.push({
            index,
            error_code: 'CREATION_FAILED',
            error_message: error.message
          });
          
          if (call.request.fail_on_first_error) {
            break;
          }
        }
      });

      callback(null, { responses, errors });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('BatchCreatePolicies error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  BatchEvaluate: (call, callback) => {
    try {
      storage.metrics.requests++;
      const requests = call.request.requests || [];
      
      if (requests.length === 0) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'At least one evaluation request is required'
        });
      }

      const responses = [];
      const errors = [];
      const startTime = Date.now();

      requests.forEach((request, index) => {
        try {
          const trajectoryLength = request.trajectory ? request.trajectory.length : 100;
          const detailedMetrics = MockDataGenerator.generateTRPOMetrics(trajectoryLength);
          
          responses.push({
            surrogate_loss: detailedMetrics.policy_loss,
            kl_divergence: detailedMetrics.kl_divergence,
            policy_entropy: 1.0 + Math.random() * 2.0,
            advantage_variance: Math.pow(detailedMetrics.advantage_std, 2),
            detailed_metrics: request.return_detailed_metrics ? detailedMetrics : null,
            action_probabilities: Array.from({ length: trajectoryLength }, 
              () => Math.random() * 0.8 + 0.1)
          });
        } catch (error) {
          errors.push({
            index,
            error_code: 'EVALUATION_FAILED',
            error_message: error.message
          });
        }
      });

      const processingTime = Date.now() - startTime;

      callback(null, {
        responses,
        errors,
        average_processing_time_ms: processingTime / requests.length
      });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('BatchEvaluate error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  BatchUpdate: (call, callback) => {
    try {
      storage.metrics.requests++;
      const requests = call.request.requests || [];
      
      if (requests.length === 0) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'At least one update request is required'
        });
      }

      const responses = [];
      const errors = [];

      requests.forEach((request, index) => {
        try {
          if (!request.policy || !request.policy.id) {
            throw new Error('Policy with ID is required');
          }

          const existingPolicy = storage.policies.get(request.policy.id);
          if (!existingPolicy) {
            throw new Error('Policy not found');
          }

          const updatedPolicy = { 
            ...existingPolicy, 
            ...request.policy,
            updated_at: { seconds: Math.floor(Date.now() / 1000) }
          };
          
          storage.policies.set(updatedPolicy.id, updatedPolicy);
          
          responses.push({
            policy: updatedPolicy,
            validation_errors: []
          });
        } catch (error) {
          errors.push({
            index,
            error_code: 'UPDATE_FAILED',
            error_message: error.message
          });
        }
      });

      callback(null, { responses, errors });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('BatchUpdate error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  // Authentication and Keys
  GetSigningKeys: (call, callback) => {
    try {
      storage.metrics.requests++;
      const request = call.request;
      const keyType = request.key_type || 'RSA';
      const keySize = request.key_size || 2048;
      
      // Generate or retrieve test keys
      const keyId = `${keyType}-${keySize}-test`;
      let key = storage.signingKeys.get(keyId);
      
      if (!key) {
        key = MockDataGenerator.generateSigningKeys(keyType, keySize);
        storage.signingKeys.set(keyId, key);
      }

      callback(null, { keys: [key] });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('GetSigningKeys error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  ValidateSignature: (call, callback) => {
    try {
      storage.metrics.requests++;
      const { key_id, data, signature } = call.request;
      
      if (!key_id || !data || !signature) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Key ID, data, and signature are required'
        });
      }

      const key = storage.signingKeys.get(key_id);
      if (!key) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: 'Signing key not found'
        });
      }

      // Mock validation - always return true for test keys
      const valid = key.is_test_key ? true : Math.random() > 0.1;

      callback(null, {
        valid,
        message: valid ? 'Signature is valid' : 'Invalid signature'
      });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('ValidateSignature error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  RefreshToken: (call, callback) => {
    try {
      storage.metrics.requests++;
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      
      callback(null, {
        access_token: `mock-access-token-${Date.now()}`,
        refresh_token: `mock-refresh-token-${Date.now()}`,
        expires_at: { seconds: Math.floor(expiresAt.getTime() / 1000) }
      });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('RefreshToken error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  // Health and Monitoring
  HealthCheck: (call, callback) => {
    try {
      storage.metrics.requests++;
      const component = call.request.component || 'all';
      
      const health = {
        status: 'HEALTH_STATUS_HEALTHY',
        message: `${component} is healthy`,
        details: {
          'uptime': `${Math.floor(process.uptime())}s`,
          'memory_usage': `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          'policies_count': storage.policies.size.toString(),
          'workflows_count': storage.workflows.size.toString()
        },
        timestamp: { seconds: Math.floor(Date.now() / 1000) }
      };

      callback(null, health);
    } catch (error) {
      storage.metrics.errors++;
      logger.error('HealthCheck error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  GetMetrics: (call, callback) => {
    try {
      storage.metrics.requests++;
      const metrics = [
        {
          name: 'requests_total',
          type: 'METRIC_TYPE_COUNTER',
          data_points: [{
            timestamp: { seconds: Math.floor(Date.now() / 1000) },
            value: storage.metrics.requests
          }],
          labels: { 'service': 'policy' }
        },
        {
          name: 'policies_created_total',
          type: 'METRIC_TYPE_COUNTER',
          data_points: [{
            timestamp: { seconds: Math.floor(Date.now() / 1000) },
            value: storage.metrics.policies_created
          }],
          labels: { 'service': 'policy' }
        },
        {
          name: 'workflows_executed_total',
          type: 'METRIC_TYPE_COUNTER',
          data_points: [{
            timestamp: { seconds: Math.floor(Date.now() / 1000) },
            value: storage.metrics.workflows_executed
          }],
          labels: { 'service': 'policy' }
        },
        {
          name: 'error_rate',
          type: 'METRIC_TYPE_GAUGE',
          data_points: [{
            timestamp: { seconds: Math.floor(Date.now() / 1000) },
            value: storage.metrics.requests > 0 ? 
              (storage.metrics.errors / storage.metrics.requests) : 0
          }],
          labels: { 'service': 'policy' }
        }
      ];

      callback(null, { metrics });
    } catch (error) {
      storage.metrics.errors++;
      logger.error('GetMetrics error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }
};

function startServer() {
  const server = new grpc.Server();
  
  server.addService(policyProto.PolicyService.service, policyService);
  
  const serverAddress = '0.0.0.0:50051';
  server.bindAsync(serverAddress, grpc.ServerCredentials.createInsecure(), (error, port) => {
    if (error) {
      logger.error('Failed to bind server:', error);
      return;
    }
    
    logger.info(`Mock Policy Service v1.1 listening on ${serverAddress}`);
    logger.info(`Server started with ${Object.keys(policyService).length} implemented methods`);
    
    // Pre-populate some mock data
    for (let i = 0; i < 10; i++) {
      const policy = MockDataGenerator.generatePolicy();
      storage.policies.set(policy.id, policy);
    }
    
    logger.info(`Pre-populated with ${storage.policies.size} mock policies`);
    
    server.start();
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down server gracefully');
    server.tryShutdown(() => {
      logger.info('Server shut down');
      process.exit(0);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { policyService, MockDataGenerator, startServer };