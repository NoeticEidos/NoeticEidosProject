// gRPC service implementation for orchestration
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { validator } from '../schemas/index.js';
import { safetyManager } from '../safety/index.js';
import { toolManager } from '../tools/index.js';

export class OrchestrationGrpcService {
  constructor(config = {}) {
    this.config = {
      port: config.port || 50051,
      host: config.host || '0.0.0.0',
      protoPath: config.protoPath || './protos/orchestration.proto',
      maxReceiveMessageLength: config.maxReceiveMessageLength || 4194304, // 4MB
      maxSendMessageLength: config.maxSendMessageLength || 4194304,
      keepAlive: config.keepAlive || {
        keepAliveTimeMs: 30000,
        keepAliveTimeoutMs: 10000,
        keepAlivePermitWithoutCalls: true,
        maxConnectionIdleMs: 300000,
        maxConnectionAgeMs: 600000
      },
      ...config
    };

    this.server = new grpc.Server({
      'grpc.max_receive_message_length': this.config.maxReceiveMessageLength,
      'grpc.max_send_message_length': this.config.maxSendMessageLength,
      'grpc.keepalive_time_ms': this.config.keepAlive.keepAliveTimeMs,
      'grpc.keepalive_timeout_ms': this.config.keepAlive.keepAliveTimeoutMs,
      'grpc.keepalive_permit_without_calls': this.config.keepAlive.keepAlivePermitWithoutCalls,
      'grpc.max_connection_idle_ms': this.config.keepAlive.maxConnectionIdleMs,
      'grpc.max_connection_age_ms': this.config.keepAlive.maxConnectionAgeMs
    });

    this.clients = new Map(); // Store active client connections
    this.requestCount = 0;
    this.isRunning = false;
    
    this.initializeService();
  }

  /**
   * Initialize gRPC service with proto definitions
   */
  async initializeService() {
    try {
      // Load proto definition
      const packageDefinition = protoLoader.loadSync(this.config.protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      });

      this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
      this.orchestrationProto = this.protoDescriptor.orchestration;

      // Add service implementations
      this.server.addService(this.orchestrationProto.OrchestrationService.service, {
        CreateAgent: this.createAgent.bind(this),
        ValidateTask: this.validateTask.bind(this),
        ExecuteWorkflow: this.executeWorkflow.bind(this),
        ExecuteTool: this.executeTool.bind(this),
        GetStatus: this.getStatus.bind(this),
        StreamEvents: this.streamEvents.bind(this),
        HealthCheck: this.healthCheck.bind(this)
      });

    } catch (error) {
      console.error('Failed to initialize gRPC service:', error);
      throw error;
    }
  }

  /**
   * Start the gRPC server
   */
  async start() {
    return new Promise((resolve, reject) => {
      const bindAddress = `${this.config.host}:${this.config.port}`;
      
      this.server.bindAsync(bindAddress, grpc.ServerCredentials.createInsecure(), (error, port) => {
        if (error) {
          console.error('Failed to start gRPC server:', error);
          reject(error);
          return;
        }

        this.server.start();
        this.isRunning = true;
        console.log(`gRPC server started on ${bindAddress} (port: ${port})`);
        resolve(port);
      });
    });
  }

  /**
   * Stop the gRPC server
   */
  async stop() {
    return new Promise((resolve) => {
      if (!this.isRunning) {
        resolve();
        return;
      }

      this.server.tryShutdown((error) => {
        this.isRunning = false;
        if (error) {
          console.error('Error stopping gRPC server:', error);
          // Force shutdown
          this.server.forceShutdown();
        } else {
          console.log('gRPC server stopped gracefully');
        }
        resolve();
      });
    });
  }

  /**
   * Create Agent RPC handler
   */
  async createAgent(call, callback) {
    try {
      this.requestCount++;
      const requestId = this.generateRequestId();
      
      console.log(`[${requestId}] CreateAgent request:`, call.request);

      // Validate request
      const agentConfig = call.request;
      const validatedAgent = await safetyManager.validateAgentSpawn(agentConfig);

      // Simulate agent creation
      const agent = {
        ...validatedAgent,
        id: validatedAgent.id || this.generateAgentId(),
        status: 'created',
        createdAt: new Date().toISOString(),
        endpoint: `agent://${validatedAgent.id}`
      };

      console.log(`[${requestId}] Agent created:`, agent.id);

      callback(null, {
        success: true,
        agent: agent,
        message: `Agent ${agent.id} created successfully`,
        requestId: requestId
      });

    } catch (error) {
      console.error('CreateAgent error:', error);
      callback(null, {
        success: false,
        error: error.message,
        errorType: error.constructor.name,
        requestId: this.generateRequestId()
      });
    }
  }

  /**
   * Validate Task RPC handler
   */
  async validateTask(call, callback) {
    try {
      this.requestCount++;
      const requestId = this.generateRequestId();
      
      console.log(`[${requestId}] ValidateTask request:`, call.request);

      // Validate request
      const taskConfig = call.request;
      const validatedTask = await safetyManager.validateTask(taskConfig);

      console.log(`[${requestId}] Task validated:`, validatedTask.id);

      callback(null, {
        success: true,
        task: validatedTask,
        validationDetails: {
          schemaValid: true,
          securityPassed: true,
          budgetApproved: true,
          rateLimitOk: true
        },
        message: `Task ${validatedTask.id} validated successfully`,
        requestId: requestId
      });

    } catch (error) {
      console.error('ValidateTask error:', error);
      
      // Determine validation failure details
      const validationDetails = {
        schemaValid: !error.message.includes('validation failed'),
        securityPassed: !error.message.includes('security') && !error.message.includes('suspicious'),
        budgetApproved: !error.message.includes('budget') && !error.message.includes('token'),
        rateLimitOk: !error.message.includes('rate limit')
      };

      callback(null, {
        success: false,
        error: error.message,
        errorType: error.constructor.name,
        validationDetails: validationDetails,
        requestId: requestId
      });
    }
  }

  /**
   * Execute Workflow RPC handler
   */
  async executeWorkflow(call, callback) {
    try {
      this.requestCount++;
      const requestId = this.generateRequestId();
      
      console.log(`[${requestId}] ExecuteWorkflow request:`, call.request);

      const workflowConfig = call.request;
      const validatedWorkflow = await safetyManager.validateWorkflow(workflowConfig);

      // Simulate workflow execution
      const execution = {
        id: this.generateExecutionId(),
        workflowId: validatedWorkflow.id,
        status: 'running',
        startedAt: new Date().toISOString(),
        steps: validatedWorkflow.steps.map(step => ({
          ...step,
          status: 'pending',
          assignedAgent: null,
          startedAt: null,
          completedAt: null
        })),
        progress: 0.0,
        estimatedCompletion: new Date(Date.now() + 300000).toISOString() // 5 minutes from now
      };

      console.log(`[${requestId}] Workflow execution started:`, execution.id);

      callback(null, {
        success: true,
        execution: execution,
        message: `Workflow execution ${execution.id} started`,
        requestId: requestId
      });

    } catch (error) {
      console.error('ExecuteWorkflow error:', error);
      callback(null, {
        success: false,
        error: error.message,
        errorType: error.constructor.name,
        requestId: this.generateRequestId()
      });
    }
  }

  /**
   * Execute Tool RPC handler
   */
  async executeTool(call, callback) {
    try {
      this.requestCount++;
      const requestId = this.generateRequestId();
      
      console.log(`[${requestId}] ExecuteTool request:`, call.request.toolName);

      const { toolName, parameters, context } = call.request;
      const result = await toolManager.executeTool(toolName, parameters, context || {});

      console.log(`[${requestId}] Tool executed:`, toolName, result.success);

      callback(null, {
        success: result.success,
        result: result.result || null,
        error: result.error || null,
        metadata: {
          ...result.metadata,
          requestId: requestId
        }
      });

    } catch (error) {
      console.error('ExecuteTool error:', error);
      callback(null, {
        success: false,
        error: error.message,
        errorType: error.constructor.name,
        metadata: {
          requestId: this.generateRequestId()
        }
      });
    }
  }

  /**
   * Get Status RPC handler
   */
  async getStatus(call, callback) {
    try {
      this.requestCount++;
      const requestId = this.generateRequestId();

      const status = {
        serverStatus: 'healthy',
        version: '1.0.0',
        uptime: process.uptime(),
        totalRequests: this.requestCount,
        activeConnections: this.clients.size,
        timestamp: new Date().toISOString(),
        services: {
          safetyManager: 'operational',
          toolManager: 'operational',
          validator: 'operational'
        },
        metrics: {
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        }
      };

      callback(null, {
        success: true,
        status: status,
        requestId: requestId
      });

    } catch (error) {
      console.error('GetStatus error:', error);
      callback(null, {
        success: false,
        error: error.message,
        requestId: this.generateRequestId()
      });
    }
  }

  /**
   * Stream Events RPC handler (server streaming)
   */
  streamEvents(call) {
    const requestId = this.generateRequestId();
    const clientId = this.generateClientId();
    
    console.log(`[${requestId}] StreamEvents started for client:`, clientId);
    
    // Store client connection
    this.clients.set(clientId, {
      call: call,
      requestId: requestId,
      startedAt: new Date().toISOString(),
      eventCount: 0
    });

    // Send initial connection event
    call.write({
      eventType: 'connection',
      timestamp: new Date().toISOString(),
      data: {
        clientId: clientId,
        message: 'Connected to event stream'
      }
    });

    // Send periodic status updates
    const statusInterval = setInterval(() => {
      if (call.destroyed || call.cancelled) {
        clearInterval(statusInterval);
        this.clients.delete(clientId);
        return;
      }

      const client = this.clients.get(clientId);
      if (client) {
        client.eventCount++;
        call.write({
          eventType: 'status',
          timestamp: new Date().toISOString(),
          data: {
            clientId: clientId,
            eventCount: client.eventCount,
            serverUptime: process.uptime()
          }
        });
      }
    }, 10000); // Every 10 seconds

    // Handle client disconnect
    call.on('cancelled', () => {
      console.log(`[${requestId}] Client ${clientId} disconnected`);
      clearInterval(statusInterval);
      this.clients.delete(clientId);
    });

    call.on('error', (error) => {
      console.error(`[${requestId}] Stream error for client ${clientId}:`, error);
      clearInterval(statusInterval);
      this.clients.delete(clientId);
    });
  }

  /**
   * Health Check RPC handler
   */
  async healthCheck(call, callback) {
    try {
      const health = {
        status: 'SERVING',
        timestamp: new Date().toISOString(),
        checks: {
          memory: this.checkMemoryHealth(),
          services: this.checkServicesHealth(),
          connections: this.checkConnectionHealth()
        }
      };

      const isHealthy = Object.values(health.checks).every(check => check.status === 'healthy');
      
      callback(null, {
        status: isHealthy ? 'SERVING' : 'NOT_SERVING',
        details: health
      });

    } catch (error) {
      console.error('HealthCheck error:', error);
      callback(null, {
        status: 'NOT_SERVING',
        error: error.message
      });
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcastEvent(eventType, data) {
    const event = {
      eventType: eventType,
      timestamp: new Date().toISOString(),
      data: data
    };

    this.clients.forEach((client, clientId) => {
      try {
        if (!client.call.destroyed && !client.call.cancelled) {
          client.call.write(event);
          client.eventCount++;
        } else {
          this.clients.delete(clientId);
        }
      } catch (error) {
        console.error(`Error broadcasting to client ${clientId}:`, error);
        this.clients.delete(clientId);
      }
    });
  }

  /**
   * Health check helpers
   */
  checkMemoryHealth() {
    const memUsage = process.memoryUsage();
    const maxHeapUsed = memUsage.heapTotal * 0.9; // 90% of allocated heap
    
    return {
      status: memUsage.heapUsed < maxHeapUsed ? 'healthy' : 'warning',
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      heapUtilization: (memUsage.heapUsed / memUsage.heapTotal) * 100
    };
  }

  checkServicesHealth() {
    try {
      // Test key services
      validator.isValid({ id: 'test', type: 'coordinator' }, 'agent');
      safetyManager.containsSuspiciousContent('test content');
      toolManager.listTools().length;

      return { status: 'healthy', message: 'All services operational' };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  checkConnectionHealth() {
    const maxConnections = 1000;
    const connectionCount = this.clients.size;

    return {
      status: connectionCount < maxConnections ? 'healthy' : 'warning',
      activeConnections: connectionCount,
      maxConnections: maxConnections,
      connectionUtilization: (connectionCount / maxConnections) * 100
    };
  }

  /**
   * Utility methods
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateAgentId() {
    return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get server statistics
   */
  getServerStats() {
    return {
      isRunning: this.isRunning,
      totalRequests: this.requestCount,
      activeConnections: this.clients.size,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      config: {
        host: this.config.host,
        port: this.config.port,
        maxReceiveMessageLength: this.config.maxReceiveMessageLength,
        maxSendMessageLength: this.config.maxSendMessageLength
      }
    };
  }
}

// Export singleton instance
export const grpcService = new OrchestrationGrpcService();