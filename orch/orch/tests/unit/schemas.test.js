// Unit tests for schema validation
import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  SchemaValidator, 
  ValidationError, 
  BatchValidationError,
  validator,
  schemas 
} from '../../src/schemas/index.js';

describe('SchemaValidator', () => {
  let schemaValidator;

  beforeEach(() => {
    schemaValidator = new SchemaValidator();
  });

  describe('Agent Schema Validation', () => {
    const validAgent = {
      id: 'test-agent-123',
      type: 'coordinator',
      name: 'Test Agent',
      capabilities: ['analysis', 'coordination'],
      status: 'idle'
    };

    it('should validate a valid agent', () => {
      const result = schemaValidator.validate(validAgent, 'agent');
      expect(result).toMatchObject(validAgent);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.performance).toBeDefined();
    });

    it('should require agent ID', () => {
      const invalidAgent = { ...validAgent };
      delete invalidAgent.id;
      
      expect(() => {
        schemaValidator.validate(invalidAgent, 'agent');
      }).toThrow(ValidationError);
    });

    it('should require valid agent type', () => {
      const invalidAgent = { ...validAgent, type: 'invalid-type' };
      
      expect(() => {
        schemaValidator.validate(invalidAgent, 'agent');
      }).toThrow(ValidationError);
    });

    it('should validate agent ID pattern', () => {
      const invalidAgent = { ...validAgent, id: 'invalid id with spaces' };
      
      expect(() => {
        schemaValidator.validate(invalidAgent, 'agent');
      }).toThrow(ValidationError);
    });

    it('should set default values', () => {
      const minimalAgent = { id: 'test-123', type: 'coordinator' };
      const result = schemaValidator.validate(minimalAgent, 'agent');
      
      expect(result.capabilities).toEqual([]);
      expect(result.status).toBe('idle');
      expect(result.metadata).toEqual({});
      expect(result.performance).toBeDefined();
    });

    it('should validate performance metrics', () => {
      const agentWithPerformance = {
        ...validAgent,
        performance: {
          tasksCompleted: 10,
          averageResponseTime: 150.5,
          successRate: 0.95,
          memoryUsage: 1024
        }
      };
      
      const result = schemaValidator.validate(agentWithPerformance, 'agent');
      expect(result.performance).toEqual(agentWithPerformance.performance);
    });

    it('should reject negative performance values', () => {
      const agentWithInvalidPerformance = {
        ...validAgent,
        performance: {
          tasksCompleted: -1
        }
      };
      
      expect(() => {
        schemaValidator.validate(agentWithInvalidPerformance, 'agent');
      }).toThrow(ValidationError);
    });
  });

  describe('Task Schema Validation', () => {
    const validTask = {
      id: 'task-123',
      description: 'Test task description',
      priority: 'high',
      status: 'pending'
    };

    it('should validate a valid task', () => {
      const result = schemaValidator.validate(validTask, 'task');
      expect(result).toMatchObject(validTask);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.budget).toBeDefined();
    });

    it('should require task ID and description', () => {
      const invalidTask = { priority: 'high' };
      
      expect(() => {
        schemaValidator.validate(invalidTask, 'task');
      }).toThrow(ValidationError);
    });

    it('should validate task priorities', () => {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      
      validPriorities.forEach(priority => {
        const task = { ...validTask, priority };
        expect(() => {
          schemaValidator.validate(task, 'task');
        }).not.toThrow();
      });
      
      const invalidTask = { ...validTask, priority: 'urgent' };
      expect(() => {
        schemaValidator.validate(invalidTask, 'task');
      }).toThrow(ValidationError);
    });

    it('should validate task statuses', () => {
      const validStatuses = ['pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled'];
      
      validStatuses.forEach(status => {
        const task = { ...validTask, status };
        expect(() => {
          schemaValidator.validate(task, 'task');
        }).not.toThrow();
      });
    });

    it('should validate budget constraints', () => {
      const taskWithBudget = {
        ...validTask,
        budget: {
          maxTokens: 5000,
          maxTime: 300000,
          maxAgents: 2
        }
      };
      
      const result = schemaValidator.validate(taskWithBudget, 'task');
      expect(result.budget).toEqual(taskWithBudget.budget);
    });

    it('should reject invalid budget values', () => {
      const taskWithInvalidBudget = {
        ...validTask,
        budget: {
          maxTokens: -100
        }
      };
      
      expect(() => {
        schemaValidator.validate(taskWithInvalidBudget, 'task');
      }).toThrow(ValidationError);
    });

    it('should validate task dependencies', () => {
      const taskWithDependencies = {
        ...validTask,
        dependencies: ['task-1', 'task-2']
      };
      
      const result = schemaValidator.validate(taskWithDependencies, 'task');
      expect(result.dependencies).toEqual(['task-1', 'task-2']);
    });

    it('should limit description length', () => {
      const taskWithLongDescription = {
        ...validTask,
        description: 'a'.repeat(6000) // Exceeds 5000 character limit
      };
      
      expect(() => {
        schemaValidator.validate(taskWithLongDescription, 'task');
      }).toThrow(ValidationError);
    });
  });

  describe('Workflow Schema Validation', () => {
    const validWorkflow = {
      id: 'workflow-123',
      name: 'Test Workflow',
      description: 'A test workflow',
      steps: [
        {
          id: 'step-1',
          type: 'analysis',
          description: 'Analyze requirements',
          dependencies: [],
          agentType: 'analyst'
        },
        {
          id: 'step-2',
          type: 'implementation',
          description: 'Implement solution',
          dependencies: ['step-1'],
          agentType: 'coder'
        }
      ]
    };

    it('should validate a valid workflow', () => {
      const result = schemaValidator.validate(validWorkflow, 'workflow');
      expect(result).toMatchObject(validWorkflow);
      expect(result.status).toBe('created');
      expect(result.budget).toBeDefined();
    });

    it('should require workflow ID, name, and steps', () => {
      const invalidWorkflow = { description: 'Missing required fields' };
      
      expect(() => {
        schemaValidator.validate(invalidWorkflow, 'workflow');
      }).toThrow(ValidationError);
    });

    it('should require at least one step', () => {
      const workflowWithoutSteps = {
        ...validWorkflow,
        steps: []
      };
      
      expect(() => {
        schemaValidator.validate(workflowWithoutSteps, 'workflow');
      }).toThrow(ValidationError);
    });

    it('should validate step structure', () => {
      const workflowWithInvalidStep = {
        ...validWorkflow,
        steps: [
          {
            id: 'step-1',
            // Missing required 'type' field
            description: 'Invalid step'
          }
        ]
      };
      
      expect(() => {
        schemaValidator.validate(workflowWithInvalidStep, 'workflow');
      }).toThrow(ValidationError);
    });

    it('should set default values for steps', () => {
      const workflowWithMinimalStep = {
        ...validWorkflow,
        steps: [
          {
            id: 'step-1',
            type: 'analysis'
          }
        ]
      };
      
      const result = schemaValidator.validate(workflowWithMinimalStep, 'workflow');
      expect(result.steps[0].dependencies).toEqual([]);
      expect(result.steps[0].parameters).toEqual({});
      expect(result.steps[0].timeout).toBe(300000);
    });
  });

  describe('Swarm Configuration Validation', () => {
    const validSwarmConfig = {
      topology: 'hierarchical',
      maxAgents: 5,
      strategy: 'balanced'
    };

    it('should validate a valid swarm configuration', () => {
      const result = schemaValidator.validate(validSwarmConfig, 'swarmConfig');
      expect(result).toMatchObject(validSwarmConfig);
      expect(result.features).toBeDefined();
    });

    it('should require topology', () => {
      const invalidConfig = { maxAgents: 5 };
      
      expect(() => {
        schemaValidator.validate(invalidConfig, 'swarmConfig');
      }).toThrow(ValidationError);
    });

    it('should validate topology values', () => {
      const validTopologies = ['hierarchical', 'mesh', 'ring', 'star'];
      
      validTopologies.forEach(topology => {
        const config = { ...validSwarmConfig, topology };
        expect(() => {
          schemaValidator.validate(config, 'swarmConfig');
        }).not.toThrow();
      });
      
      const invalidConfig = { ...validSwarmConfig, topology: 'invalid' };
      expect(() => {
        schemaValidator.validate(invalidConfig, 'swarmConfig');
      }).toThrow(ValidationError);
    });

    it('should validate agent limits', () => {
      const configWithTooManyAgents = {
        ...validSwarmConfig,
        maxAgents: 150 // Exceeds limit of 100
      };
      
      expect(() => {
        schemaValidator.validate(configWithTooManyAgents, 'swarmConfig');
      }).toThrow(ValidationError);
    });

    it('should set default feature flags', () => {
      const result = schemaValidator.validate(validSwarmConfig, 'swarmConfig');
      
      expect(result.features.autoTopologySelection).toBe(true);
      expect(result.features.parallelExecution).toBe(true);
      expect(result.features.githubIntegration).toBe(false);
    });
  });

  describe('Memory Entry Validation', () => {
    const validMemoryEntry = {
      key: 'test-key',
      value: { data: 'test data' },
      namespace: 'test'
    };

    it('should validate a valid memory entry', () => {
      const result = schemaValidator.validate(validMemoryEntry, 'memoryEntry');
      expect(result).toMatchObject(validMemoryEntry);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should require key and value', () => {
      const invalidEntry = { namespace: 'test' };
      
      expect(() => {
        schemaValidator.validate(invalidEntry, 'memoryEntry');
      }).toThrow(ValidationError);
    });

    it('should set default namespace', () => {
      const entryWithoutNamespace = {
        key: 'test-key',
        value: 'test value'
      };
      
      const result = schemaValidator.validate(entryWithoutNamespace, 'memoryEntry');
      expect(result.namespace).toBe('default');
    });

    it('should validate TTL', () => {
      const entryWithTTL = {
        ...validMemoryEntry,
        ttl: 3600000 // 1 hour
      };
      
      const result = schemaValidator.validate(entryWithTTL, 'memoryEntry');
      expect(result.ttl).toBe(3600000);
    });

    it('should reject negative TTL', () => {
      const entryWithInvalidTTL = {
        ...validMemoryEntry,
        ttl: -100
      };
      
      expect(() => {
        schemaValidator.validate(entryWithInvalidTTL, 'memoryEntry');
      }).toThrow(ValidationError);
    });
  });

  describe('Trajectory Entry Validation', () => {
    const validTrajectoryEntry = {
      step: 0,
      timestamp: new Date().toISOString(),
      action: {
        type: 'tool_call',
        tool: 'read',
        parameters: { file_path: '/test/file.txt' },
        reasoning: 'Need to read the file contents'
      },
      observation: {
        success: true,
        result: { content: 'file content' },
        metrics: {
          executionTime: 150,
          tokensUsed: 50
        }
      },
      state: {
        agentStatus: 'busy',
        taskProgress: 0.5
      }
    };

    it('should validate a valid trajectory entry', () => {
      const result = schemaValidator.validate(validTrajectoryEntry, 'trajectoryEntry');
      expect(result).toMatchObject(validTrajectoryEntry);
    });

    it('should require all main fields', () => {
      const requiredFields = ['step', 'timestamp', 'action', 'observation', 'state'];
      
      requiredFields.forEach(field => {
        const invalidEntry = { ...validTrajectoryEntry };
        delete invalidEntry[field];
        
        expect(() => {
          schemaValidator.validate(invalidEntry, 'trajectoryEntry');
        }).toThrow(ValidationError);
      });
    });

    it('should validate action structure', () => {
      const entryWithInvalidAction = {
        ...validTrajectoryEntry,
        action: {
          type: 'tool_call'
          // Missing required 'tool' and 'parameters'
        }
      };
      
      expect(() => {
        schemaValidator.validate(entryWithInvalidAction, 'trajectoryEntry');
      }).toThrow(ValidationError);
    });

    it('should validate observation success flag', () => {
      const entryWithoutSuccess = {
        ...validTrajectoryEntry,
        observation: {
          result: { content: 'test' }
          // Missing required 'success' field
        }
      };
      
      expect(() => {
        schemaValidator.validate(entryWithoutSuccess, 'trajectoryEntry');
      }).toThrow(ValidationError);
    });

    it('should validate state structure', () => {
      const entryWithInvalidState = {
        ...validTrajectoryEntry,
        state: {
          // Missing required fields
        }
      };
      
      expect(() => {
        schemaValidator.validate(entryWithInvalidState, 'trajectoryEntry');
      }).toThrow(ValidationError);
    });

    it('should validate step number', () => {
      const entryWithNegativeStep = {
        ...validTrajectoryEntry,
        step: -1
      };
      
      expect(() => {
        schemaValidator.validate(entryWithNegativeStep, 'trajectoryEntry');
      }).toThrow(ValidationError);
    });

    it('should validate task progress range', () => {
      const entryWithInvalidProgress = {
        ...validTrajectoryEntry,
        state: {
          agentStatus: 'busy',
          taskProgress: 1.5 // Exceeds 1.0
        }
      };
      
      expect(() => {
        schemaValidator.validate(entryWithInvalidProgress, 'trajectoryEntry');
      }).toThrow(ValidationError);
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple valid items', () => {
      const agents = [
        { id: 'agent-1', type: 'coordinator' },
        { id: 'agent-2', type: 'analyst' },
        { id: 'agent-3', type: 'optimizer' }
      ];
      
      const results = schemaValidator.validateBatch(agents, 'agent');
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('agent-1');
    });

    it('should throw BatchValidationError for invalid items', () => {
      const agents = [
        { id: 'agent-1', type: 'coordinator' },
        { id: 'agent-2' }, // Missing type
        { id: 'agent-3', type: 'invalid-type' }
      ];
      
      expect(() => {
        schemaValidator.validateBatch(agents, 'agent');
      }).toThrow(BatchValidationError);
    });

    it('should provide error details for failed validations', () => {
      const agents = [
        { id: 'agent-1', type: 'coordinator' },
        { id: 'agent-2' } // Missing type
      ];
      
      try {
        schemaValidator.validateBatch(agents, 'agent');
      } catch (error) {
        expect(error).toBeInstanceOf(BatchValidationError);
        expect(error.errors).toHaveLength(1);
        expect(error.errors[0].index).toBe(1);
      }
    });
  });

  describe('Schema Information', () => {
    it('should provide schema description', () => {
      const description = schemaValidator.getSchemaDescription('agent');
      expect(description).toBeDefined();
      expect(description.keys).toBeDefined();
    });

    it('should throw for unknown schema', () => {
      expect(() => {
        schemaValidator.getSchemaDescription('unknown');
      }).toThrow('Schema \'unknown\' not found');
    });
  });

  describe('Validation Helper Methods', () => {
    it('should check validity without throwing', () => {
      const validAgent = { id: 'test', type: 'coordinator' };
      const invalidAgent = { id: 'test' }; // Missing type
      
      expect(schemaValidator.isValid(validAgent, 'agent')).toBe(true);
      expect(schemaValidator.isValid(invalidAgent, 'agent')).toBe(false);
    });
  });

  describe('JSON Schema Validation', () => {
    it('should validate using AJV JSON schema', () => {
      const validAgent = { id: 'test', type: 'coordinator' };
      
      expect(() => {
        schemaValidator.validateJson(validAgent, 'agent');
      }).not.toThrow();
    });

    it('should throw for JSON schema validation failure', () => {
      const invalidAgent = { id: 123, type: 'coordinator' }; // ID should be string
      
      expect(() => {
        schemaValidator.validateJson(invalidAgent, 'agent');
      }).toThrow(ValidationError);
    });
  });

  describe('Singleton Instance', () => {
    it('should export a singleton validator instance', () => {
      expect(validator).toBeInstanceOf(SchemaValidator);
      expect(validator.validate).toBeDefined();
    });
  });
});