const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { policyService, MockDataGenerator } = require('../src/server');

// Load the proto file for testing
const PROTO_PATH = path.join(__dirname, '../proto/policy_service.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const policyProto = grpc.loadPackageDefinition(packageDefinition).policy.v1;

describe('Mock gRPC Policy Service v1.1', () => {
  let server;
  let client;

  beforeAll((done) => {
    // Start test server
    server = new grpc.Server();
    server.addService(policyProto.PolicyService.service, policyService);
    
    const testPort = '127.0.0.1:50052';
    server.bindAsync(testPort, grpc.ServerCredentials.createInsecure(), (error, port) => {
      if (error) {
        console.error('Failed to bind test server:', error);
        return done(error);
      }
      
      server.start();
      
      // Create client
      client = new policyProto.PolicyService(
        testPort,
        grpc.credentials.createInsecure()
      );
      
      done();
    });
  });

  afterAll((done) => {
    server.tryShutdown(() => {
      done();
    });
  });

  describe('Core Policy Operations', () => {
    test('CreatePolicy should create a new policy', (done) => {
      const request = {
        policy: {
          name: 'Test Policy',
          description: 'A test policy',
          type: 'POLICY_TYPE_ACCESS'
        }
      };

      client.CreatePolicy(request, (error, response) => {
        expect(error).toBeNull();
        expect(response).toBeDefined();
        expect(response.policy).toBeDefined();
        expect(response.policy.name).toBe('Test Policy');
        expect(response.policy.id).toBeDefined();
        expect(response.validation_errors).toHaveLength(0);
        done();
      });
    });

    test('GetPolicy should retrieve an existing policy', (done) => {
      // First create a policy
      const createRequest = {
        policy: {
          name: 'Get Test Policy',
          type: 'POLICY_TYPE_SECURITY'
        }
      };

      client.CreatePolicy(createRequest, (createError, createResponse) => {
        expect(createError).toBeNull();
        
        const policyId = createResponse.policy.id;
        const getRequest = { id: policyId };

        client.GetPolicy(getRequest, (error, response) => {
          expect(error).toBeNull();
          expect(response.policy).toBeDefined();
          expect(response.policy.id).toBe(policyId);
          expect(response.policy.name).toBe('Get Test Policy');
          done();
        });
      });
    });

    test('ListPolicies should return paginated results', (done) => {
      const request = {
        page_size: 5,
        filter: '',
        type: 'POLICY_TYPE_UNSPECIFIED'
      };

      client.ListPolicies(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.policies).toBeDefined();
        expect(Array.isArray(response.policies)).toBe(true);
        expect(response.total_count).toBeGreaterThanOrEqual(0);
        done();
      });
    });

    test('UpdatePolicy should modify existing policy', (done) => {
      // First create a policy
      const createRequest = {
        policy: {
          name: 'Update Test Policy',
          type: 'POLICY_TYPE_WORKFLOW'
        }
      };

      client.CreatePolicy(createRequest, (createError, createResponse) => {
        expect(createError).toBeNull();
        
        const policy = createResponse.policy;
        policy.description = 'Updated description';
        
        const updateRequest = {
          policy,
          update_mask: ['description']
        };

        client.UpdatePolicy(updateRequest, (error, response) => {
          expect(error).toBeNull();
          expect(response.policy.description).toBe('Updated description');
          done();
        });
      });
    });

    test('DeletePolicy should remove policy', (done) => {
      // First create a policy
      const createRequest = {
        policy: {
          name: 'Delete Test Policy',
          type: 'POLICY_TYPE_COMPLIANCE'
        }
      };

      client.CreatePolicy(createRequest, (createError, createResponse) => {
        expect(createError).toBeNull();
        
        const deleteRequest = { id: createResponse.policy.id };

        client.DeletePolicy(deleteRequest, (error, response) => {
          expect(error).toBeNull();
          expect(response.success).toBe(true);
          done();
        });
      });
    });
  });

  describe('Workflow Management', () => {
    test('GenerateWorkflowPlan should create realistic workflow', (done) => {
      const request = {
        policy_id: 'test-policy-id',
        complexity: 'WORKFLOW_COMPLEXITY_MODERATE',
        requirements: ['validation', 'processing', 'notification']
      };

      client.GenerateWorkflowPlan(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.plan).toBeDefined();
        expect(response.plan.steps).toBeDefined();
        expect(response.plan.steps.length).toBeGreaterThan(0);
        expect(response.confidence_score).toBeGreaterThan(0.8);
        expect(Array.isArray(response.recommendations)).toBe(true);
        done();
      });
    });

    test('ExecuteWorkflow should start workflow execution', (done) => {
      // First generate a workflow
      const planRequest = {
        policy_id: 'test-policy-id',
        complexity: 'WORKFLOW_COMPLEXITY_SIMPLE'
      };

      client.GenerateWorkflowPlan(planRequest, (planError, planResponse) => {
        expect(planError).toBeNull();
        
        const executeRequest = {
          workflow_id: planResponse.plan.id,
          async_execution: true,
          parameters: { 'test_param': 'test_value' }
        };

        client.ExecuteWorkflow(executeRequest, (error, response) => {
          expect(error).toBeNull();
          expect(response.execution_id).toBeDefined();
          expect(response.status).toBe('WORKFLOW_STATUS_RUNNING');
          done();
        });
      });
    });
  });

  describe('TRPO Operations', () => {
    test('EvaluateSurrogate should return TRPO metrics', (done) => {
      const trajectoryData = Array.from({ length: 10 }, (_, i) => ({
        state: [Math.random(), Math.random()],
        action: [Math.random()],
        reward: (Math.random() - 0.5) * 2,
        value_estimate: Math.random(),
        log_probability: Math.log(Math.random())
      }));

      const request = {
        policy_id: 'test-policy',
        trajectory: trajectoryData,
        return_detailed_metrics: true,
        trpo_params: {
          delta: 0.01,
          gamma: 0.99,
          lambda: 0.95,
          max_kl_samples: 1000,
          cg_damping: 0.1,
          cg_iterations: 10
        }
      };

      client.EvaluateSurrogate(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.surrogate_loss).toBeDefined();
        expect(response.kl_divergence).toBeDefined();
        expect(response.policy_entropy).toBeDefined();
        expect(response.advantage_variance).toBeDefined();
        expect(response.detailed_metrics).toBeDefined();
        expect(response.detailed_metrics.trajectory_length).toBe(10);
        expect(Array.isArray(response.action_probabilities)).toBe(true);
        expect(response.action_probabilities.length).toBe(10);
        done();
      });
    });

    test('UpdatePolicyGradient should update policy', (done) => {
      const request = {
        policy_id: 'test-policy',
        gradients: Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.01),
        learning_rate: 0.001,
        trpo_params: {
          delta: 0.01,
          gamma: 0.99,
          lambda: 0.95
        }
      };

      client.UpdatePolicyGradient(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(true);
        expect(response.policy_improvement).toBeDefined();
        expect(response.updated_policy_version).toBeDefined();
        expect(response.metrics).toBeDefined();
        done();
      });
    });

    test('ComputeAdvantage should calculate GAE', (done) => {
      const trajectoryData = Array.from({ length: 20 }, (_, i) => ({
        state: [Math.random(), Math.random()],
        action: [Math.random()],
        reward: (Math.random() - 0.5) * 2,
        value_estimate: Math.random(),
        log_probability: Math.log(Math.random())
      }));

      const request = {
        trajectory: trajectoryData,
        gamma: 0.99,
        lambda: 0.95
      };

      client.ComputeAdvantage(request, (error, response) => {
        expect(error).toBeNull();
        expect(Array.isArray(response.advantages)).toBe(true);
        expect(response.advantages.length).toBe(20);
        expect(Array.isArray(response.value_targets)).toBe(true);
        expect(response.value_targets.length).toBe(20);
        expect(response.average_advantage).toBeDefined();
        expect(response.advantage_variance).toBeDefined();
        done();
      });
    });
  });

  describe('Batch Operations', () => {
    test('BatchCreatePolicies should create multiple policies', (done) => {
      const requests = Array.from({ length: 3 }, (_, i) => ({
        policy: {
          name: `Batch Policy ${i}`,
          type: 'POLICY_TYPE_ACCESS'
        }
      }));

      const batchRequest = {
        requests,
        fail_on_first_error: false
      };

      client.BatchCreatePolicies(batchRequest, (error, response) => {
        expect(error).toBeNull();
        expect(Array.isArray(response.responses)).toBe(true);
        expect(response.responses.length).toBe(3);
        expect(Array.isArray(response.errors)).toBe(true);
        done();
      });
    });

    test('BatchEvaluate should process multiple evaluations', (done) => {
      const trajectory1 = Array.from({ length: 5 }, () => ({
        state: [Math.random()],
        action: [Math.random()],
        reward: Math.random(),
        value_estimate: Math.random(),
        log_probability: Math.log(Math.random())
      }));

      const trajectory2 = Array.from({ length: 8 }, () => ({
        state: [Math.random()],
        action: [Math.random()],
        reward: Math.random(),
        value_estimate: Math.random(),
        log_probability: Math.log(Math.random())
      }));

      const batchRequest = {
        requests: [
          {
            policy_id: 'policy-1',
            trajectory: trajectory1,
            return_detailed_metrics: false
          },
          {
            policy_id: 'policy-2',
            trajectory: trajectory2,
            return_detailed_metrics: true
          }
        ],
        parallel_processing: true
      };

      client.BatchEvaluate(batchRequest, (error, response) => {
        expect(error).toBeNull();
        expect(Array.isArray(response.responses)).toBe(true);
        expect(response.responses.length).toBe(2);
        expect(response.average_processing_time_ms).toBeDefined();
        done();
      });
    });
  });

  describe('Authentication & Keys', () => {
    test('GetSigningKeys should return test keys', (done) => {
      const request = {
        key_type: 'RSA',
        key_size: 2048
      };

      client.GetSigningKeys(request, (error, response) => {
        expect(error).toBeNull();
        expect(Array.isArray(response.keys)).toBe(true);
        expect(response.keys.length).toBeGreaterThan(0);
        
        const key = response.keys[0];
        expect(key.id).toBeDefined();
        expect(key.type).toBe('RSA');
        expect(key.public_key).toBeDefined();
        expect(key.private_key).toBeDefined();
        expect(key.is_test_key).toBe(true);
        done();
      });
    });

    test('ValidateSignature should validate test signatures', (done) => {
      const request = {
        key_id: 'test-key-id',
        data: Buffer.from('test data'),
        signature: Buffer.from('test signature')
      };

      client.ValidateSignature(request, (error, response) => {
        expect(error).toBeNull();
        expect(typeof response.valid).toBe('boolean');
        expect(response.message).toBeDefined();
        done();
      });
    });

    test('RefreshToken should return new tokens', (done) => {
      const request = {
        refresh_token: 'test-refresh-token'
      };

      client.RefreshToken(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.access_token).toBeDefined();
        expect(response.refresh_token).toBeDefined();
        expect(response.expires_at).toBeDefined();
        done();
      });
    });
  });

  describe('Health & Monitoring', () => {
    test('HealthCheck should return service status', (done) => {
      const request = {
        component: 'policy-service'
      };

      client.HealthCheck(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.status).toBe('HEALTH_STATUS_HEALTHY');
        expect(response.message).toBeDefined();
        expect(response.details).toBeDefined();
        expect(response.timestamp).toBeDefined();
        done();
      });
    });

    test('GetMetrics should return service metrics', (done) => {
      const request = {
        metric_names: ['requests_total', 'policies_created_total']
      };

      client.GetMetrics(request, (error, response) => {
        expect(error).toBeNull();
        expect(Array.isArray(response.metrics)).toBe(true);
        expect(response.metrics.length).toBeGreaterThan(0);
        
        const metric = response.metrics[0];
        expect(metric.name).toBeDefined();
        expect(metric.type).toBeDefined();
        expect(Array.isArray(metric.data_points)).toBe(true);
        done();
      });
    });
  });

  describe('MockDataGenerator', () => {
    test('should generate realistic policy data', () => {
      const policy = MockDataGenerator.generatePolicy();
      
      expect(policy.id).toBeDefined();
      expect(policy.name).toBeDefined();
      expect(policy.type).toBeDefined();
      expect(Array.isArray(policy.rules)).toBe(true);
      expect(policy.metadata).toBeDefined();
    });

    test('should generate complex workflow plans', () => {
      const plan = MockDataGenerator.generateWorkflowPlan('WORKFLOW_COMPLEXITY_COMPLEX');
      
      expect(plan.id).toBeDefined();
      expect(plan.steps.length).toBeGreaterThan(10);
      expect(plan.estimated_duration_seconds).toBeGreaterThan(0);
    });

    test('should generate realistic TRPO metrics', () => {
      const metrics = MockDataGenerator.generateTRPOMetrics(50);
      
      expect(metrics.trajectory_length).toBe(50);
      expect(typeof metrics.policy_loss).toBe('number');
      expect(typeof metrics.kl_divergence).toBe('number');
      expect(Array.isArray(metrics.reward_distribution)).toBe(true);
      expect(metrics.reward_distribution.length).toBe(10);
    });

    test('should generate test signing keys', () => {
      const key = MockDataGenerator.generateSigningKeys('RSA', 2048);
      
      expect(key.id).toBeDefined();
      expect(key.type).toBe('RSA');
      expect(key.public_key).toContain('BEGIN PUBLIC KEY');
      expect(key.private_key).toContain('BEGIN PRIVATE KEY');
      expect(key.is_test_key).toBe(true);
    });
  });
});