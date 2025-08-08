// Schema validation system
import Joi from 'joi';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

// Base schemas
export const schemas = {
  // Agent schema
  agent: Joi.object({
    id: Joi.string().required().pattern(/^[a-zA-Z0-9-_]+$/),
    type: Joi.string().required().valid('coordinator', 'analyst', 'optimizer', 'documenter', 'monitor', 'specialist', 'architect', 'task-orchestrator', 'code-analyzer', 'perf-analyzer', 'api-docs', 'performance-benchmarker', 'system-architect', 'researcher', 'coder', 'tester', 'reviewer'),
    name: Joi.string().optional(),
    capabilities: Joi.array().items(Joi.string()).default([]),
    status: Joi.string().valid('idle', 'busy', 'error', 'offline').default('idle'),
    metadata: Joi.object().default({}),
    createdAt: Joi.date().iso().default(() => new Date()),
    lastActive: Joi.date().iso().optional(),
    performance: Joi.object({
      tasksCompleted: Joi.number().integer().min(0).default(0),
      averageResponseTime: Joi.number().min(0).default(0),
      successRate: Joi.number().min(0).max(1).default(1),
      memoryUsage: Joi.number().min(0).default(0)
    }).default({})
  }),

  // Task schema
  task: Joi.object({
    id: Joi.string().required().pattern(/^[a-zA-Z0-9-_]+$/),
    description: Joi.string().required().min(1).max(5000),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
    status: Joi.string().valid('pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled').default('pending'),
    agentId: Joi.string().optional().allow(null),
    dependencies: Joi.array().items(Joi.string()).default([]),
    strategy: Joi.string().valid('parallel', 'sequential', 'adaptive', 'balanced').default('adaptive'),
    budget: Joi.object({
      maxTokens: Joi.number().integer().min(1).max(1000000).default(10000),
      maxTime: Joi.number().integer().min(1).max(3600000).default(300000), // 5 minutes
      maxAgents: Joi.number().integer().min(1).max(10).default(3)
    }).default({}),
    result: Joi.any().optional(),
    error: Joi.string().optional(),
    createdAt: Joi.date().iso().default(() => new Date()),
    startedAt: Joi.date().iso().optional(),
    completedAt: Joi.date().iso().optional(),
    metadata: Joi.object().default({})
  }),

  // Workflow schema
  workflow: Joi.object({
    id: Joi.string().required().pattern(/^[a-zA-Z0-9-_]+$/),
    name: Joi.string().required().min(1).max(200),
    description: Joi.string().optional().max(1000),
    steps: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      type: Joi.string().required(),
      description: Joi.string().optional(),
      dependencies: Joi.array().items(Joi.string()).default([]),
      agentType: Joi.string().optional(),
      parameters: Joi.object().default({}),
      timeout: Joi.number().integer().min(1000).max(3600000).default(300000)
    })).required().min(1),
    status: Joi.string().valid('created', 'running', 'completed', 'failed', 'paused').default('created'),
    budget: Joi.object({
      maxTokens: Joi.number().integer().min(1).max(10000000).default(100000),
      maxTime: Joi.number().integer().min(1).max(86400000).default(3600000), // 1 hour
      maxAgents: Joi.number().integer().min(1).max(20).default(5)
    }).default({}),
    createdAt: Joi.date().iso().default(() => new Date()),
    startedAt: Joi.date().iso().optional(),
    completedAt: Joi.date().iso().optional(),
    metadata: Joi.object().default({})
  }),

  // Swarm configuration schema
  swarmConfig: Joi.object({
    topology: Joi.string().valid('hierarchical', 'mesh', 'ring', 'star').required(),
    maxAgents: Joi.number().integer().min(1).max(100).default(8),
    strategy: Joi.string().valid('auto', 'balanced', 'specialized', 'adaptive').default('auto'),
    features: Joi.object({
      autoTopologySelection: Joi.boolean().default(true),
      parallelExecution: Joi.boolean().default(true),
      neuralTraining: Joi.boolean().default(true),
      bottleneckAnalysis: Joi.boolean().default(true),
      smartAutoSpawning: Joi.boolean().default(true),
      selfHealingWorkflows: Joi.boolean().default(true),
      crossSessionMemory: Joi.boolean().default(true),
      githubIntegration: Joi.boolean().default(false)
    }).default({})
  }),

  // Memory entry schema
  memoryEntry: Joi.object({
    key: Joi.string().required().min(1).max(500),
    value: Joi.any().required(),
    namespace: Joi.string().default('default'),
    ttl: Joi.number().integer().min(0).optional(),
    metadata: Joi.object().default({}),
    createdAt: Joi.date().iso().default(() => new Date()),
    expiresAt: Joi.date().iso().optional()
  }),

  // Trajectory entry schema (for Round 2 deliverables)
  trajectoryEntry: Joi.object({
    step: Joi.number().integer().min(0).required(),
    timestamp: Joi.date().iso().required(),
    action: Joi.object({
      type: Joi.string().required(),
      tool: Joi.string().required(),
      parameters: Joi.object().required(),
      reasoning: Joi.string().optional()
    }).required(),
    observation: Joi.object({
      success: Joi.boolean().required(),
      result: Joi.any().optional(),
      error: Joi.string().optional(),
      metrics: Joi.object({
        executionTime: Joi.number().min(0).optional(),
        memoryUsage: Joi.number().min(0).optional(),
        tokensUsed: Joi.number().integer().min(0).optional()
      }).optional()
    }).required(),
    state: Joi.object({
      agentStatus: Joi.string().required(),
      taskProgress: Joi.number().min(0).max(1).required(),
      resourceUsage: Joi.object().optional()
    }).required()
  })
};

// JSON Schema definitions for AJV
export const jsonSchemas = {
  agent: {
    type: 'object',
    required: ['id', 'type'],
    properties: {
      id: { type: 'string', pattern: '^[a-zA-Z0-9-_]+$' },
      type: { type: 'string', enum: Object.keys(schemas.agent.describe().keys.type.flags.only) },
      name: { type: 'string' },
      capabilities: { type: 'array', items: { type: 'string' } },
      status: { type: 'string', enum: ['idle', 'busy', 'error', 'offline'] },
      metadata: { type: 'object' }
    }
  }
};

// Validation functions
export class SchemaValidator {
  constructor() {
    this.joi = Joi;
    this.ajv = ajv;
    
    // Compile JSON schemas
    Object.entries(jsonSchemas).forEach(([name, schema]) => {
      this.ajv.addSchema(schema, name);
    });
  }

  /**
   * Validate data against a Joi schema
   */
  validate(data, schemaName, options = {}) {
    const schema = schemas[schemaName];
    if (!schema) {
      throw new Error(`Schema '${schemaName}' not found`);
    }

    const result = schema.validate(data, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true,
      ...options
    });

    if (result.error) {
      throw new ValidationError(result.error.details, schemaName);
    }

    return result.value;
  }

  /**
   * Validate data against a JSON schema using AJV
   */
  validateJson(data, schemaName) {
    const validate = this.ajv.getSchema(schemaName);
    if (!validate) {
      throw new Error(`JSON Schema '${schemaName}' not found`);
    }

    const valid = validate(data);
    if (!valid) {
      throw new ValidationError(validate.errors, schemaName);
    }

    return data;
  }

  /**
   * Validate multiple items
   */
  validateBatch(items, schemaName, options = {}) {
    const results = [];
    const errors = [];

    items.forEach((item, index) => {
      try {
        const validated = this.validate(item, schemaName, options);
        results.push(validated);
      } catch (error) {
        errors.push({ index, error });
      }
    });

    if (errors.length > 0) {
      throw new BatchValidationError(errors);
    }

    return results;
  }

  /**
   * Check if data is valid without throwing
   */
  isValid(data, schemaName, options = {}) {
    try {
      this.validate(data, schemaName, options);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get schema description
   */
  getSchemaDescription(schemaName) {
    const schema = schemas[schemaName];
    if (!schema) {
      throw new Error(`Schema '${schemaName}' not found`);
    }
    return schema.describe();
  }
}

// Custom error classes
export class ValidationError extends Error {
  constructor(details, schemaName) {
    const messages = Array.isArray(details) 
      ? details.map(d => d.message || d.toString()).join(', ')
      : details.toString();
    
    super(`Validation failed for schema '${schemaName}': ${messages}`);
    this.name = 'ValidationError';
    this.details = details;
    this.schemaName = schemaName;
  }
}

export class BatchValidationError extends Error {
  constructor(errors) {
    const errorCount = errors.length;
    super(`Batch validation failed: ${errorCount} items had errors`);
    this.name = 'BatchValidationError';
    this.errors = errors;
  }
}

// Export singleton instance
export const validator = new SchemaValidator();