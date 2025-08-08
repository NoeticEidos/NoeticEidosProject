// Integration tests for gRPC communication
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { OrchestrationGrpcService } from '../../src/grpc/index.js';

describe('gRPC Integration Tests', () => {
  let server;
  let client;
  let port;

  // Mock proto file content for testing
  const mockProtoContent = `
    syntax = "proto3";
    package orchestration;

    service OrchestrationService {
      rpc CreateAgent(CreateAgentRequest) returns (CreateAgentResponse);
      rpc ValidateTask(ValidateTaskRequest) returns (ValidateTaskResponse);
      rpc ExecuteWorkflow(ExecuteWorkflowRequest) returns (ExecuteWorkflowResponse);
      rpc ExecuteTool(ExecuteToolRequest) returns (ExecuteToolResponse);
      rpc GetStatus(GetStatusRequest) returns (GetStatusResponse);
      rpc StreamEvents(StreamEventsRequest) returns (stream EventMessage);
      rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
    }

    message CreateAgentRequest {
      string id = 1;
      string type = 2;
      string name = 3;
      repeated string capabilities = 4;
    }

    message CreateAgentResponse {
      bool success = 1;
      Agent agent = 2;
      string message = 3;
      string error = 4;
      string requestId = 5;
    }

    message Agent {
      string id = 1;
      string type = 2;
      string name = 3;
      repeated string capabilities = 4;
      string status = 5;
      string createdAt = 6;
      string endpoint = 7;
    }

    message ValidateTaskRequest {
      string id = 1;
      string description = 2;
      string priority = 3;
      string status = 4;
      TaskBudget budget = 5;
    }

    message TaskBudget {
      int32 maxTokens = 1;
      int32 maxTime = 2;
      int32 maxAgents = 3;
    }

    message ValidateTaskResponse {
      bool success = 1;
      Task task = 2;
      ValidationDetails validationDetails = 3;
      string message = 4;
      string error = 5;
      string requestId = 6;
    }

    message Task {
      string id = 1;
      string description = 2;
      string priority = 3;
      string status = 4;
      TaskBudget budget = 5;
      string createdAt = 6;
    }

    message ValidationDetails {
      bool schemaValid = 1;
      bool securityPassed = 2;
      bool budgetApproved = 3;
      bool rateLimitOk = 4;
    }

    message ExecuteWorkflowRequest {
      string id = 1;
      string name = 2;
      string description = 3;
      repeated WorkflowStep steps = 4;
    }

    message WorkflowStep {
      string id = 1;
      string type = 2;
      string description = 3;
      repeated string dependencies = 4;
    }

    message ExecuteWorkflowResponse {
      bool success = 1;
      WorkflowExecution execution = 2;
      string message = 3;
      string error = 4;
      string requestId = 5;
    }

    message WorkflowExecution {
      string id = 1;
      string workflowId = 2;
      string status = 3;
      string startedAt = 4;
      repeated ExecutionStep steps = 5;
      float progress = 6;
      string estimatedCompletion = 7;
    }

    message ExecutionStep {
      string id = 1;
      string type = 2;
      string status = 3;
      string assignedAgent = 4;
      string startedAt = 5;
      string completedAt = 6;
    }

    message ExecuteToolRequest {
      string toolName = 1;
      map<string, string> parameters = 2;
      ToolContext context = 3;
    }

    message ToolContext {
      string agentId = 1;
      string taskId = 2;
    }

    message ExecuteToolResponse {
      bool success = 1;
      string result = 2;
      string error = 3;
      ToolMetadata metadata = 4;
    }

    message ToolMetadata {
      string toolName = 1;
      int32 executionTime = 2;
      string agentId = 3;
      string requestId = 4;
      string timestamp = 5;
    }

    message GetStatusRequest {
    }

    message GetStatusResponse {
      bool success = 1;
      ServerStatus status = 2;
      string requestId = 3;
    }

    message ServerStatus {
      string serverStatus = 1;
      string version = 2;
      float uptime = 3;
      int32 totalRequests = 4;
      int32 activeConnections = 5;
      string timestamp = 6;
    }

    message StreamEventsRequest {
      repeated string eventTypes = 1;
    }

    message EventMessage {
      string eventType = 1;
      string timestamp = 2;
      map<string, string> data = 3;
    }

    message HealthCheckRequest {
    }

    message HealthCheckResponse {
      string status = 1;
      string error = 2;
    }
  `;

  beforeAll(async () => {
    // Create a temporary proto file for testing
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grpc-test-'));
    const protoPath = path.join(tempDir, 'orchestration.proto');
    fs.writeFileSync(protoPath, mockProtoContent);

    // Start server
    server = new OrchestrationGrpcService({
      port: 0, // Use dynamic port
      protoPath: protoPath
    });

    port = await server.start();

    // Create client
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    const orchestrationProto = protoDescriptor.orchestration;

    client = new orchestrationProto.OrchestrationService(
      `localhost:${port}`,
      grpc.credentials.createInsecure(),
      {
        'grpc.keepalive_time_ms': 30000,
        'grpc.keepalive_timeout_ms': 10000,
        'grpc.max_receive_message_length': 4194304
      }
    );

    // Clean up temp file
    fs.unlinkSync(protoPath);
    fs.rmdirSync(tempDir);
  }, 30000);

  afterAll(async () => {
    if (client) {
      client.close();
    }
    if (server) {
      await server.stop();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('CreateAgent RPC', () => {
    it('should create agent successfully', (done) => {
      const request = {
        id: 'test-agent-123',
        type: 'coordinator',
        name: 'Test Agent',
        capabilities: ['analysis', 'coordination']
      };

      client.CreateAgent(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(true);
        expect(response.agent.id).toBe(request.id);
        expect(response.agent.type).toBe(request.type);
        expect(response.agent.status).toBe('created');
        expect(response.agent.createdAt).toBeDefined();
        expect(response.requestId).toBeDefined();
        expect(response.message).toContain('created successfully');
        done();
      });
    });

    it('should handle invalid agent configuration', (done) => {
      const request = {
        id: 'invalid agent id!', // Invalid characters
        type: 'invalid_type' // Not in allowed types
      };

      client.CreateAgent(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
        expect(response.errorType).toBeDefined();
        expect(response.requestId).toBeDefined();
        done();
      });
    });

    it('should handle missing required fields', (done) => {
      const request = {
        name: 'Agent without type'
        // Missing required 'type' field
      };

      client.CreateAgent(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(false);
        expect(response.error).toContain('required');
        done();
      });
    });

    it('should generate unique request IDs', (done) => {
      const requests = [
        { id: 'agent-1', type: 'coordinator' },
        { id: 'agent-2', type: 'analyst' }
      ];

      const requestIds = [];
      let completed = 0;

      requests.forEach(request => {
        client.CreateAgent(request, (error, response) => {
          expect(error).toBeNull();
          requestIds.push(response.requestId);
          completed++;

          if (completed === requests.length) {
            expect(new Set(requestIds).size).toBe(requests.length); // All unique
            done();
          }
        });
      });
    });
  });

  describe('ValidateTask RPC', () => {
    it('should validate task successfully', (done) => {
      const request = {
        id: 'test-task-123',
        description: 'Test task for validation',
        priority: 'high',
        status: 'pending',
        budget: {
          maxTokens: 1000,
          maxTime: 60000,
          maxAgents: 2
        }
      };

      client.ValidateTask(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(true);
        expect(response.task.id).toBe(request.id);
        expect(response.task.description).toBe(request.description);
        expect(response.validationDetails.schemaValid).toBe(true);
        expect(response.validationDetails.securityPassed).toBe(true);
        expect(response.validationDetails.budgetApproved).toBe(true);
        expect(response.validationDetails.rateLimitOk).toBe(true);
        expect(response.requestId).toBeDefined();
        done();
      });
    });

    it('should reject task with suspicious content', (done) => {
      const request = {
        id: 'suspicious-task',
        description: 'Execute this script: <script>alert("xss")</script>',
        priority: 'medium'
      };

      client.ValidateTask(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(false);
        expect(response.error).toContain('suspicious');
        expect(response.validationDetails.securityPassed).toBe(false);
        done();
      });
    });

    it('should reject task with excessive budget', (done) => {
      const request = {
        id: 'expensive-task',
        description: 'High budget task',
        budget: {
          maxTokens: 50000 // Exceeds default limit
        }
      };

      client.ValidateTask(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(false);
        expect(response.error).toContain('budget') || expect(response.error).toContain('token');
        expect(response.validationDetails.budgetApproved).toBe(false);
        done();
      });
    });

    it('should handle rate limiting', (done) => {
      const requests = [];
      for (let i = 0; i < 15; i++) { // Exceed rate limit
        requests.push({
          id: `rate-limit-task-${i}`,
          description: 'Rate limit test task',
          priority: 'low'
        });
      }

      let completed = 0;
      let rateLimited = false;

      requests.forEach(request => {
        client.ValidateTask(request, (error, response) => {
          expect(error).toBeNull();
          
          if (!response.success && response.error.includes('rate limit')) {
            rateLimited = true;
            expect(response.validationDetails.rateLimitOk).toBe(false);
          }

          completed++;
          if (completed === requests.length) {
            expect(rateLimited).toBe(true);
            done();
          }
        });
      });
    });
  });

  describe('ExecuteWorkflow RPC', () => {
    it('should execute workflow successfully', (done) => {
      const request = {
        id: 'test-workflow-123',
        name: 'Test Workflow',
        description: 'A test workflow for gRPC testing',
        steps: [
          {
            id: 'step-1',
            type: 'analysis',
            description: 'Analyze requirements',
            dependencies: []
          },
          {
            id: 'step-2',
            type: 'implementation',
            description: 'Implement solution',
            dependencies: ['step-1']
          }
        ]
      };

      client.ExecuteWorkflow(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(true);
        expect(response.execution.workflowId).toBe(request.id);
        expect(response.execution.status).toBe('running');
        expect(response.execution.steps).toHaveLength(2);
        expect(response.execution.progress).toBe(0.0);
        expect(response.execution.estimatedCompletion).toBeDefined();
        expect(response.requestId).toBeDefined();
        done();
      });
    });

    it('should reject workflow with circular dependencies', (done) => {
      const request = {
        id: 'circular-workflow',
        name: 'Circular Workflow',
        steps: [
          {
            id: 'step-1',
            type: 'analysis',
            dependencies: ['step-2']
          },
          {
            id: 'step-2',
            type: 'implementation',
            dependencies: ['step-1']
          }
        ]
      };

      client.ExecuteWorkflow(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(false);
        expect(response.error).toContain('circular');
        done();
      });
    });

    it('should reject workflow with invalid dependencies', (done) => {
      const request = {
        id: 'invalid-deps-workflow',
        name: 'Invalid Dependencies Workflow',
        steps: [
          {
            id: 'step-1',
            type: 'analysis',
            dependencies: ['nonexistent-step']
          }
        ]
      };

      client.ExecuteWorkflow(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(false);
        expect(response.error).toContain('dependency');
        done();
      });
    });
  });

  describe('ExecuteTool RPC', () => {
    it('should execute tool successfully', (done) => {
      const request = {
        toolName: 'read',
        parameters: {
          file_path: '/test/file.txt'
        },
        context: {
          agentId: 'test-agent',
          taskId: 'test-task'
        }
      };

      client.ExecuteTool(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(true);
        expect(response.result).toBeDefined();
        expect(response.metadata.toolName).toBe('read');
        expect(response.metadata.agentId).toBe('test-agent');
        expect(response.metadata.executionTime).toBeGreaterThan(0);
        expect(response.metadata.requestId).toBeDefined();
        done();
      });
    });

    it('should handle tool execution failure', (done) => {
      const request = {
        toolName: 'read',
        parameters: {
          // Missing required file_path parameter
        }
      };

      client.ExecuteTool(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
        expect(response.metadata.requestId).toBeDefined();
        done();
      });
    });

    it('should handle non-existent tool', (done) => {
      const request = {
        toolName: 'nonexistent_tool',
        parameters: {}
      };

      client.ExecuteTool(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(false);
        expect(response.error).toContain('not found');
        done();
      });
    });

    it('should validate tool parameters', (done) => {
      const request = {
        toolName: 'bash',
        parameters: {
          command: 'rm -rf /' // Should be blocked by security
        }
      };

      client.ExecuteTool(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(false);
        expect(response.error).toContain('Blacklisted') || 
               expect(response.error).toContain('security') ||
               expect(response.error).toContain('dangerous');
        done();
      });
    });
  });

  describe('GetStatus RPC', () => {
    it('should return server status', (done) => {
      const request = {};

      client.GetStatus(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.success).toBe(true);
        expect(response.status.serverStatus).toBe('healthy');
        expect(response.status.version).toBe('1.0.0');
        expect(response.status.uptime).toBeGreaterThan(0);
        expect(response.status.totalRequests).toBeGreaterThan(0);
        expect(response.status.timestamp).toBeDefined();
        expect(response.requestId).toBeDefined();
        done();
      });
    });

    it('should increment request counter', (done) => {
      client.GetStatus({}, (error, response1) => {
        expect(error).toBeNull();
        const firstRequestCount = response1.status.totalRequests;

        client.GetStatus({}, (error, response2) => {
          expect(error).toBeNull();
          expect(response2.status.totalRequests).toBe(firstRequestCount + 1);
          done();
        });
      });
    });
  });

  describe('StreamEvents RPC', () => {
    it('should establish event stream', (done) => {
      const request = {
        eventTypes: ['status', 'connection']
      };

      const stream = client.StreamEvents(request);
      const events = [];
      let connectionEventReceived = false;

      stream.on('data', (event) => {
        events.push(event);
        
        if (event.eventType === 'connection') {
          connectionEventReceived = true;
          expect(event.data.clientId).toBeDefined();
          expect(event.data.message).toContain('Connected');
          expect(event.timestamp).toBeDefined();
        }

        if (event.eventType === 'status') {
          expect(event.data.clientId).toBeDefined();
          expect(event.data.eventCount).toBeGreaterThan(0);
          expect(event.data.serverUptime).toBeGreaterThan(0);
        }

        // Close stream after receiving some events
        if (events.length >= 2) {
          stream.cancel();
        }
      });

      stream.on('end', () => {
        expect(connectionEventReceived).toBe(true);
        expect(events.length).toBeGreaterThanOrEqual(1);
        done();
      });

      stream.on('error', (error) => {
        if (error.code !== grpc.status.CANCELLED) {
          throw error;
        }
      });

      // Cancel stream after timeout to prevent hanging
      setTimeout(() => {
        stream.cancel();
      }, 5000);
    });

    it('should handle multiple concurrent streams', (done) => {
      const streamCount = 3;
      const streams = [];
      let completedStreams = 0;

      for (let i = 0; i < streamCount; i++) {
        const stream = client.StreamEvents({ eventTypes: ['connection'] });
        streams.push(stream);

        stream.on('data', (event) => {
          if (event.eventType === 'connection') {
            expect(event.data.clientId).toBeDefined();
            stream.cancel();
          }
        });

        stream.on('end', () => {
          completedStreams++;
          if (completedStreams === streamCount) {
            done();
          }
        });

        stream.on('error', (error) => {
          if (error.code !== grpc.status.CANCELLED) {
            throw error;
          }
        });
      }

      // Cleanup after timeout
      setTimeout(() => {
        streams.forEach(stream => stream.cancel());
      }, 5000);
    });
  });

  describe('HealthCheck RPC', () => {
    it('should return healthy status', (done) => {
      const request = {};

      client.HealthCheck(request, (error, response) => {
        expect(error).toBeNull();
        expect(response.status).toBe('SERVING');
        expect(response.error).toBeUndefined();
        done();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle large message sizes', (done) => {
      const largeDescription = 'a'.repeat(1000000); // 1MB description
      
      const request = {
        id: 'large-task',
        description: largeDescription,
        priority: 'low'
      };

      client.ValidateTask(request, (error, response) => {
        // Should either succeed or fail gracefully
        expect(error).toBeNull();
        expect(response).toBeDefined();
        done();
      });
    });

    it('should handle concurrent requests', (done) => {
      const concurrentRequests = 10;
      let completed = 0;
      const results = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const request = {
          id: `concurrent-agent-${i}`,
          type: 'coordinator',
          name: `Agent ${i}`
        };

        client.CreateAgent(request, (error, response) => {
          expect(error).toBeNull();
          results.push(response);
          completed++;

          if (completed === concurrentRequests) {
            // Check all requests were processed
            expect(results).toHaveLength(concurrentRequests);
            
            // Check request IDs are unique
            const requestIds = results.map(r => r.requestId);
            expect(new Set(requestIds).size).toBe(concurrentRequests);
            
            done();
          }
        });
      }
    });

    it('should handle server shutdown gracefully', async () => {
      // This test ensures the server can be stopped and restarted
      const originalStats = server.getServerStats();
      expect(originalStats.isRunning).toBe(true);

      await server.stop();
      expect(server.getServerStats().isRunning).toBe(false);

      // Restart server
      const newPort = await server.start();
      expect(server.getServerStats().isRunning).toBe(true);
      expect(newPort).toBeGreaterThan(0);

      port = newPort; // Update port for client
    });
  });

  describe('Performance Tests', () => {
    it('should handle rapid sequential requests', (done) => {
      const requestCount = 50;
      const startTime = Date.now();
      let completed = 0;

      for (let i = 0; i < requestCount; i++) {
        client.GetStatus({}, (error, response) => {
          expect(error).toBeNull();
          expect(response.success).toBe(true);
          
          completed++;
          if (completed === requestCount) {
            const duration = Date.now() - startTime;
            const avgResponseTime = duration / requestCount;
            
            // Should handle 50 requests reasonably fast
            expect(avgResponseTime).toBeLessThan(100); // Less than 100ms per request
            done();
          }
        });
      }
    }, 10000);

    it('should track request metrics accurately', (done) => {
      client.GetStatus({}, (error, response1) => {
        expect(error).toBeNull();
        const requestCount1 = response1.status.totalRequests;

        // Make several more requests
        const additionalRequests = 5;
        let completed = 0;

        for (let i = 0; i < additionalRequests; i++) {
          client.CreateAgent({ id: `metric-agent-${i}`, type: 'coordinator' }, (error) => {
            expect(error).toBeNull();
            completed++;

            if (completed === additionalRequests) {
              client.GetStatus({}, (error, response2) => {
                expect(error).toBeNull();
                expect(response2.status.totalRequests)
                  .toBeGreaterThanOrEqual(requestCount1 + additionalRequests);
                done();
              });
            }
          });
        }
      });
    });
  });
});