/**
 * Comprehensive test suite for PolicyServiceClient
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PolicyServiceClient } from '../../src/client/policy-service-client';
import { 
  GRPCClientConfig, 
  DEFAULT_CONFIG 
} from '../../src/types/config-types';
import {
  OrchestrationClientError,
  OrchestrationErrorCode,
  CircuitBreakerOpenError
} from '../../src/types/error-types';
import { CircuitBreakerState } from '../../src/utils/circuit-breaker';

describe('PolicyServiceClient', () => {
  let client: PolicyServiceClient;
  let config: GRPCClientConfig;

  beforeEach(() => {
    config = {
      ...DEFAULT_CONFIG,
      endpoint: 'localhost:50051',
      circuitBreaker: {
        ...DEFAULT_CONFIG.circuitBreaker,
        enabled: true,
        failureThreshold: 2,
        timeout: 1000,
      },
      retryPolicy: {
        ...DEFAULT_CONFIG.retryPolicy,
        enabled: true,
        maxAttempts: 2,
        initialDelay: 100,
      }
    };
    
    client = new PolicyServiceClient(config);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const defaultClient = new PolicyServiceClient();
      expect(defaultClient).toBeInstanceOf(PolicyServiceClient);
      expect(defaultClient.isConnected()).toBe(false);
    });

    it('should initialize with custom config', () => {
      expect(client).toBeInstanceOf(PolicyServiceClient);
      expect(client.isConnected()).toBe(false);
    });

    it('should throw error for invalid config', () => {
      expect(() => {
        new PolicyServiceClient({
          ...config,
          endpoint: '',
        });
      }).toThrow('Endpoint is required');
    });
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      // Mock the gRPC client
      const mockGrpcClient = {
        getHealthCheck: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, { status: 'healthy' });
        }),
        close: jest.fn(),
      };

      // Mock the import
      jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
        PolicyServiceClient: jest.fn(() => mockGrpcClient),
      }));

      await client.connect();
      expect(client.isConnected()).toBe(true);
    });

    it('should handle connection failure', async () => {
      const mockGrpcClient = {
        getHealthCheck: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(new Error('Connection failed'));
        }),
        close: jest.fn(),
      };

      jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
        PolicyServiceClient: jest.fn(() => mockGrpcClient),
      }));

      await expect(client.connect()).rejects.toThrow(OrchestrationClientError);
      expect(client.isConnected()).toBe(false);
    });

    it('should disconnect successfully', async () => {
      // First connect
      const mockGrpcClient = {
        getHealthCheck: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, { status: 'healthy' });
        }),
        close: jest.fn(),
      };

      jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
        PolicyServiceClient: jest.fn(() => mockGrpcClient),
      }));

      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
      expect(mockGrpcClient.close).toHaveBeenCalled();
    });
  });

  describe('Policy Management', () => {
    beforeEach(async () => {
      // Mock successful connection
      const mockGrpcClient = {
        getHealthCheck: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, { status: 'healthy' });
        }),
        createPolicy: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, { 
            policy: { id: 'test-policy', name: 'Test Policy' },
            validationErrors: []
          });
        }),
        getPolicy: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, { 
            policy: { id: req.id, name: 'Test Policy' }
          });
        }),
        updatePolicy: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, { 
            policy: req.policy,
            validationErrors: []
          });
        }),
        deletePolicy: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, { 
            success: true,
            message: 'Policy deleted successfully'
          });
        }),
        listPolicies: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, { 
            policies: [{ id: 'policy1' }, { id: 'policy2' }],
            nextPageToken: '',
            totalCount: 2
          });
        }),
        validatePolicy: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, { 
            valid: true,
            errors: [],
            warnings: []
          });
        }),
        close: jest.fn(),
      };

      jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
        PolicyServiceClient: jest.fn(() => mockGrpcClient),
      }));

      await client.connect();
    });

    it('should create policy successfully', async () => {
      const request = {
        policy: {
          id: '',
          name: 'Test Policy',
          description: 'A test policy',
          spec: { rules: [], config: {}, dependencies: [], variables: {} },
          status: { state: 'ACTIVE' },
          createdAt: new Date(),
          updatedAt: new Date(),
          labels: {},
          annotations: {},
          version: '1.0'
        },
        validateOnly: false
      };

      const response = await client.createPolicy(request);
      expect(response.policy.name).toBe('Test Policy');
      expect(response.validationErrors).toEqual([]);
    });

    it('should get policy successfully', async () => {
      const request = { id: 'test-policy-id' };
      const response = await client.getPolicy(request);
      expect(response.policy.id).toBe('test-policy-id');
    });

    it('should update policy successfully', async () => {
      const request = {
        policy: {
          id: 'test-policy',
          name: 'Updated Policy',
          description: 'Updated description',
          spec: { rules: [], config: {}, dependencies: [], variables: {} },
          status: { state: 'ACTIVE' },
          createdAt: new Date(),
          updatedAt: new Date(),
          labels: {},
          annotations: {},
          version: '1.1'
        },
        validateOnly: false
      };

      const response = await client.updatePolicy(request);
      expect(response.policy.name).toBe('Updated Policy');
    });

    it('should delete policy successfully', async () => {
      const request = { id: 'test-policy', force: false };
      const response = await client.deletePolicy(request);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Policy deleted successfully');
    });

    it('should list policies successfully', async () => {
      const request = { pageSize: 10 };
      const response = await client.listPolicies(request);
      expect(response.policies).toHaveLength(2);
      expect(response.totalCount).toBe(2);
    });

    it('should validate policy successfully', async () => {
      const request = {
        policy: {
          id: 'test-policy',
          name: 'Valid Policy',
          description: 'A valid policy',
          spec: { rules: [], config: {}, dependencies: [], variables: {} },
          status: { state: 'ACTIVE' },
          createdAt: new Date(),
          updatedAt: new Date(),
          labels: {},
          annotations: {},
          version: '1.0'
        },
        strictMode: true
      };

      const response = await client.validatePolicy(request);
      expect(response.valid).toBe(true);
      expect(response.errors).toEqual([]);
    });
  });

  describe('Policy Evaluation', () => {
    beforeEach(async () => {
      // Mock successful connection and evaluation methods
      const mockGrpcClient = {
        getHealthCheck: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, { status: 'healthy' });
        }),
        evaluatePolicy: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, {
            result: true,
            actions: [{ actionType: 'ALLOW', success: true, message: 'Access granted' }],
            metrics: { duration: 100, rulesEvaluated: 5, actionsExecuted: 1 },
            traceId: 'trace-123',
            ruleEvaluations: []
          });
        }),
        batchEvaluatePolicy: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, {
            responses: req.requests.map(() => ({
              result: true,
              actions: [],
              metrics: { duration: 50 },
              traceId: 'batch-trace'
            })),
            metrics: { totalRequests: req.requests.length }
          });
        }),
        close: jest.fn(),
      };

      jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
        PolicyServiceClient: jest.fn(() => mockGrpcClient),
      }));

      await client.connect();
    });

    it('should evaluate policy successfully', async () => {
      const request = {
        policyId: 'test-policy',
        context: { user: 'test-user' },
        inputs: { action: 'read' }
      };

      const response = await client.evaluatePolicy(request);
      expect(response.result).toBe(true);
      expect(response.actions).toHaveLength(1);
      expect(response.traceId).toBe('trace-123');
    });

    it('should batch evaluate policies successfully', async () => {
      const request = {
        requests: [
          { policyId: 'policy1', context: {}, inputs: {} },
          { policyId: 'policy2', context: {}, inputs: {} }
        ]
      };

      const response = await client.batchEvaluatePolicy(request);
      expect(response.responses).toHaveLength(2);
      expect(response.metrics.totalRequests).toBe(2);
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should open circuit breaker after consecutive failures', async () => {
      const failingClient = new PolicyServiceClient({
        ...config,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 2,
          timeout: 1000,
          recoveryThreshold: 1,
          recoveryTimeout: 500,
          monitoringWindow: 10000,
          minimumThroughput: 1
        }
      });

      // Mock failing gRPC client
      const mockGrpcClient = {
        getHealthCheck: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(new Error('Service unavailable'));
        }),
        close: jest.fn(),
      };

      jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
        PolicyServiceClient: jest.fn(() => mockGrpcClient),
      }));

      // First failure
      await expect(failingClient.connect()).rejects.toThrow();
      
      // Second failure should open circuit
      await expect(failingClient.connect()).rejects.toThrow();
      
      // Third attempt should immediately fail with circuit breaker error
      await expect(failingClient.connect()).rejects.toThrow(CircuitBreakerOpenError);
      
      await failingClient.disconnect();
    });

    it('should emit circuit breaker state change events', async () => {
      let stateChangeEvents: Array<[CircuitBreakerState, CircuitBreakerState]> = [];
      
      client.on('circuitBreakerStateChange', (from, to) => {
        stateChangeEvents.push([from, to]);
      });

      // Mock failing then succeeding gRPC client
      const mockGrpcClient = {
        getHealthCheck: jest.fn()
          .mockImplementationOnce((req, metadata, options, callback) => {
            callback(new Error('First failure'));
          })
          .mockImplementationOnce((req, metadata, options, callback) => {
            callback(new Error('Second failure'));
          })
          .mockImplementationOnce((req, metadata, options, callback) => {
            callback(null, { status: 'healthy' });
          }),
        close: jest.fn(),
      };

      jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
        PolicyServiceClient: jest.fn(() => mockGrpcClient),
      }));

      // Trigger failures to open circuit
      await expect(client.connect()).rejects.toThrow();
      await expect(client.connect()).rejects.toThrow();

      // Wait for circuit to potentially close and succeed
      await new Promise(resolve => setTimeout(resolve, 1100));
      await client.connect();

      expect(stateChangeEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed requests', async () => {
      const retryClient = new PolicyServiceClient({
        ...config,
        retryPolicy: {
          enabled: true,
          maxAttempts: 3,
          initialDelay: 50,
          maxDelay: 200,
          backoffMultiplier: 2,
          maxDuration: 5000,
          jitter: 0.1
        }
      });

      let attemptCount = 0;
      const mockGrpcClient = {
        getHealthCheck: jest.fn().mockImplementation((req, metadata, options, callback) => {
          attemptCount++;
          if (attemptCount < 3) {
            callback({ code: 14, message: 'Service unavailable' }); // UNAVAILABLE
          } else {
            callback(null, { status: 'healthy' });
          }
        }),
        close: jest.fn(),
      };

      jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
        PolicyServiceClient: jest.fn(() => mockGrpcClient),
      }));

      await retryClient.connect();
      expect(attemptCount).toBe(3);
      expect(retryClient.isConnected()).toBe(true);
      
      await retryClient.disconnect();
    });

    it('should not retry permanent errors', async () => {
      const retryClient = new PolicyServiceClient(config);

      let attemptCount = 0;
      const mockGrpcClient = {
        getHealthCheck: jest.fn().mockImplementation((req, metadata, options, callback) => {
          attemptCount++;
          callback({ code: 3, message: 'Invalid argument' }); // INVALID_ARGUMENT
        }),
        close: jest.fn(),
      };

      jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
        PolicyServiceClient: jest.fn(() => mockGrpcClient),
      }));

      await expect(retryClient.connect()).rejects.toThrow();
      expect(attemptCount).toBe(1); // Should not retry permanent errors
      
      await retryClient.disconnect();
    });
  });

  describe('Error Handling', () => {
    it('should handle and classify different error types', async () => {
      const errors = [
        { code: 3, message: 'Invalid argument', expectedRetryable: false },
        { code: 5, message: 'Not found', expectedRetryable: false },
        { code: 14, message: 'Service unavailable', expectedRetryable: true },
        { code: 4, message: 'Deadline exceeded', expectedRetryable: true }
      ];

      for (const errorCase of errors) {
        const mockGrpcClient = {
          getHealthCheck: jest.fn().mockImplementation((req, metadata, options, callback) => {
            callback(errorCase);
          }),
          close: jest.fn(),
        };

        jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
          PolicyServiceClient: jest.fn(() => mockGrpcClient),
        }));

        const testClient = new PolicyServiceClient(config);
        
        try {
          await testClient.connect();
        } catch (error) {
          expect(error).toBeInstanceOf(OrchestrationClientError);
          const orchError = error as OrchestrationClientError;
          expect(orchError.retryable).toBe(errorCase.expectedRetryable);
        }
        
        await testClient.disconnect();
      }
    });

    it('should call error callbacks', async () => {
      const errorCallback = jest.fn();
      client.onError(errorCallback);

      const mockGrpcClient = {
        getHealthCheck: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(new Error('Test error'));
        }),
        close: jest.fn(),
      };

      jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
        PolicyServiceClient: jest.fn(() => mockGrpcClient),
      }));

      await expect(client.connect()).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalled();
      
      client.offError(errorCallback);
    });
  });

  describe('Metrics Collection', () => {
    it('should collect and update metrics', async () => {
      const metricsCallback = jest.fn();
      client.on('metricsUpdated', metricsCallback);

      const mockGrpcClient = {
        getHealthCheck: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, { status: 'healthy' });
        }),
        getPolicy: jest.fn().mockImplementation((req, metadata, options, callback) => {
          callback(null, { policy: { id: req.id } });
        }),
        close: jest.fn(),
      };

      jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
        PolicyServiceClient: jest.fn(() => mockGrpcClient),
      }));

      await client.connect();
      
      // Make some requests to generate metrics
      await client.getPolicy({ id: 'test' });
      
      const metrics = await client.getMetrics();
      expect(metrics.totalRequests).toBeGreaterThan(0);
      expect(metrics.successfulRequests).toBeGreaterThan(0);
      
      await client.disconnect();
    });
  });

  describe('Authentication', () => {
    it('should handle basic authentication', async () => {
      const authConfig = {
        ...config,
        auth: {
          type: 'basic' as const,
          basic: {
            username: 'testuser',
            password: 'testpass'
          }
        }
      };

      const authClient = new PolicyServiceClient(authConfig);
      
      const mockGrpcClient = {
        getHealthCheck: jest.fn().mockImplementation((req, metadata, options, callback) => {
          // Verify authorization header
          const authHeader = metadata.get('authorization')[0];
          expect(authHeader).toMatch(/^Basic /);
          callback(null, { status: 'healthy' });
        }),
        close: jest.fn(),
      };

      jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
        PolicyServiceClient: jest.fn(() => mockGrpcClient),
      }));

      await authClient.connect();
      expect(authClient.isConnected()).toBe(true);
      
      await authClient.disconnect();
    });

    it('should handle bearer token authentication', async () => {
      const authConfig = {
        ...config,
        auth: {
          type: 'bearer' as const,
          bearer: {
            token: 'test-bearer-token'
          }
        }
      };

      const authClient = new PolicyServiceClient(authConfig);
      
      const mockGrpcClient = {
        getHealthCheck: jest.fn().mockImplementation((req, metadata, options, callback) => {
          const authHeader = metadata.get('authorization')[0];
          expect(authHeader).toBe('Bearer test-bearer-token');
          callback(null, { status: 'healthy' });
        }),
        close: jest.fn(),
      };

      jest.doMock('../../src/proto/orchestration_grpc_pb', () => ({
        PolicyServiceClient: jest.fn(() => mockGrpcClient),
      }));

      await authClient.connect();
      expect(authClient.isConnected()).toBe(true);
      
      await authClient.disconnect();
    });
  });
});