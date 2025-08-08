// Tools validation and management system
import { validator, ValidationError } from '../schemas/index.js';
import { safetyManager, SecurityError } from '../safety/index.js';

export class ToolManager {
  constructor(config = {}) {
    this.config = {
      maxToolsPerAgent: config.maxToolsPerAgent || 20,
      toolTimeout: config.toolTimeout || 30000, // 30 seconds
      allowedTools: config.allowedTools || [
        'read', 'write', 'edit', 'multiedit', 'glob', 'grep', 'bash',
        'ls', 'webfetch', 'websearch', 'notebookedit', 'todowrite'
      ],
      restrictedTools: config.restrictedTools || ['bash', 'webfetch'],
      toolCategories: config.toolCategories || {
        file: ['read', 'write', 'edit', 'multiedit', 'ls', 'glob', 'grep'],
        system: ['bash'],
        web: ['webfetch', 'websearch'],
        notebook: ['notebookedit'],
        task: ['todowrite']
      },
      ...config
    };

    this.toolRegistry = new Map();
    this.toolUsage = new Map();
    this.toolMetrics = new Map();
    
    this.initializeTools();
  }

  /**
   * Initialize default tools
   */
  initializeTools() {
    const defaultTools = [
      {
        name: 'read',
        category: 'file',
        description: 'Read file contents',
        parameters: {
          file_path: { type: 'string', required: true },
          limit: { type: 'number', required: false },
          offset: { type: 'number', required: false }
        },
        restrictions: [],
        timeout: 10000
      },
      {
        name: 'write',
        category: 'file',
        description: 'Write file contents',
        parameters: {
          file_path: { type: 'string', required: true },
          content: { type: 'string', required: true }
        },
        restrictions: ['file_path_validation'],
        timeout: 15000
      },
      {
        name: 'edit',
        category: 'file',
        description: 'Edit file with find/replace',
        parameters: {
          file_path: { type: 'string', required: true },
          old_string: { type: 'string', required: true },
          new_string: { type: 'string', required: true },
          replace_all: { type: 'boolean', required: false }
        },
        restrictions: ['file_path_validation'],
        timeout: 10000
      },
      {
        name: 'bash',
        category: 'system',
        description: 'Execute bash commands',
        parameters: {
          command: { type: 'string', required: true },
          description: { type: 'string', required: false },
          timeout: { type: 'number', required: false }
        },
        restrictions: ['command_sanitization', 'elevated_permissions'],
        timeout: 30000
      },
      {
        name: 'grep',
        category: 'file',
        description: 'Search files with patterns',
        parameters: {
          pattern: { type: 'string', required: true },
          path: { type: 'string', required: false },
          type: { type: 'string', required: false },
          output_mode: { type: 'string', required: false }
        },
        restrictions: [],
        timeout: 20000
      },
      {
        name: 'webfetch',
        category: 'web',
        description: 'Fetch web content',
        parameters: {
          url: { type: 'string', required: true },
          prompt: { type: 'string', required: true }
        },
        restrictions: ['url_validation', 'domain_whitelist'],
        timeout: 30000
      },
      {
        name: 'todowrite',
        category: 'task',
        description: 'Manage todo lists',
        parameters: {
          todos: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', required: true },
                content: { type: 'string', required: true },
                status: { type: 'string', required: true },
                priority: { type: 'string', required: false }
              }
            }
          }
        },
        restrictions: [],
        timeout: 5000
      }
    ];

    defaultTools.forEach(tool => {
      this.registerTool(tool);
    });
  }

  /**
   * Register a new tool
   */
  registerTool(toolDefinition) {
    try {
      // Validate tool definition
      this.validateToolDefinition(toolDefinition);
      
      // Check if tool is allowed
      if (!this.config.allowedTools.includes(toolDefinition.name)) {
        throw new SecurityError(`Tool '${toolDefinition.name}' is not in allowed tools list`);
      }

      this.toolRegistry.set(toolDefinition.name, {
        ...toolDefinition,
        registeredAt: new Date().toISOString(),
        usageCount: 0
      });

      this.toolMetrics.set(toolDefinition.name, {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        averageExecutionTime: 0,
        totalExecutionTime: 0
      });

    } catch (error) {
      throw new ValidationError(`Failed to register tool: ${error.message}`, 'tool_registration');
    }
  }

  /**
   * Validate tool invocation
   */
  async validateToolCall(toolName, parameters, context = {}) {
    const startTime = Date.now();
    
    try {
      // Check if tool exists
      const tool = this.toolRegistry.get(toolName);
      if (!tool) {
        throw new ValidationError(`Tool '${toolName}' not found`, 'tool_call');
      }

      // Check agent tool limits
      this.checkAgentToolLimits(context.agentId);

      // Validate parameters
      this.validateToolParameters(tool, parameters);

      // Apply tool restrictions
      await this.applyToolRestrictions(tool, parameters, context);

      // Update metrics
      this.updateToolMetrics(toolName, 'attempt');

      return {
        tool,
        validatedParameters: parameters,
        metadata: {
          validatedAt: new Date().toISOString(),
          validationTime: Date.now() - startTime,
          agentId: context.agentId,
          taskId: context.taskId
        }
      };

    } catch (error) {
      this.updateToolMetrics(toolName, 'failure');
      throw error;
    }
  }

  /**
   * Execute tool with safety checks
   */
  async executeTool(toolName, parameters, context = {}) {
    const startTime = Date.now();
    let result = null;
    let error = null;

    try {
      // Validate the tool call first
      const validation = await this.validateToolCall(toolName, parameters, context);
      const tool = validation.tool;

      // Create execution context
      const execContext = {
        ...context,
        startTime,
        timeout: tool.timeout || this.config.toolTimeout,
        restrictions: tool.restrictions || []
      };

      // Execute the tool (this would interface with the actual tool implementation)
      result = await this.executeToolImpl(toolName, parameters, execContext);

      // Update success metrics
      this.updateToolMetrics(toolName, 'success', Date.now() - startTime);
      this.recordToolUsage(toolName, context.agentId, true);

      return {
        success: true,
        result,
        metadata: {
          toolName,
          executionTime: Date.now() - startTime,
          agentId: context.agentId,
          taskId: context.taskId,
          timestamp: new Date().toISOString()
        }
      };

    } catch (err) {
      error = err;
      this.updateToolMetrics(toolName, 'failure', Date.now() - startTime);
      this.recordToolUsage(toolName, context.agentId, false);

      return {
        success: false,
        error: err.message,
        metadata: {
          toolName,
          executionTime: Date.now() - startTime,
          agentId: context.agentId,
          taskId: context.taskId,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Validate tool definition
   */
  validateToolDefinition(toolDefinition) {
    const required = ['name', 'category', 'description', 'parameters'];
    
    for (const field of required) {
      if (!toolDefinition[field]) {
        throw new ValidationError(`Missing required field: ${field}`, 'tool_definition');
      }
    }

    // Validate name format
    if (!/^[a-z][a-z0-9_]*$/.test(toolDefinition.name)) {
      throw new ValidationError('Tool name must be lowercase with underscores only', 'tool_definition');
    }

    // Validate category
    const validCategories = Object.keys(this.config.toolCategories);
    if (!validCategories.includes(toolDefinition.category)) {
      throw new ValidationError(`Invalid category: ${toolDefinition.category}`, 'tool_definition');
    }

    // Validate parameters schema
    if (typeof toolDefinition.parameters !== 'object') {
      throw new ValidationError('Parameters must be an object', 'tool_definition');
    }
  }

  /**
   * Validate tool parameters
   */
  validateToolParameters(tool, parameters) {
    const toolParams = tool.parameters;
    const providedParams = Object.keys(parameters || {});
    const requiredParams = Object.keys(toolParams).filter(
      param => toolParams[param].required
    );

    // Check required parameters
    for (const param of requiredParams) {
      if (!providedParams.includes(param)) {
        throw new ValidationError(`Missing required parameter: ${param}`, 'tool_parameters');
      }
    }

    // Validate parameter types and values
    for (const [paramName, paramValue] of Object.entries(parameters || {})) {
      const paramDef = toolParams[paramName];
      if (!paramDef) {
        throw new ValidationError(`Unknown parameter: ${paramName}`, 'tool_parameters');
      }

      this.validateParameterValue(paramName, paramValue, paramDef);
    }
  }

  /**
   * Validate individual parameter value
   */
  validateParameterValue(paramName, value, definition) {
    const { type, minLength, maxLength, min, max, enum: enumValues } = definition;

    // Type validation
    if (type === 'string' && typeof value !== 'string') {
      throw new ValidationError(`Parameter ${paramName} must be a string`, 'parameter_type');
    }
    if (type === 'number' && typeof value !== 'number') {
      throw new ValidationError(`Parameter ${paramName} must be a number`, 'parameter_type');
    }
    if (type === 'boolean' && typeof value !== 'boolean') {
      throw new ValidationError(`Parameter ${paramName} must be a boolean`, 'parameter_type');
    }
    if (type === 'array' && !Array.isArray(value)) {
      throw new ValidationError(`Parameter ${paramName} must be an array`, 'parameter_type');
    }

    // String validation
    if (type === 'string') {
      if (minLength && value.length < minLength) {
        throw new ValidationError(`Parameter ${paramName} too short (min: ${minLength})`, 'parameter_validation');
      }
      if (maxLength && value.length > maxLength) {
        throw new ValidationError(`Parameter ${paramName} too long (max: ${maxLength})`, 'parameter_validation');
      }
    }

    // Number validation
    if (type === 'number') {
      if (min !== undefined && value < min) {
        throw new ValidationError(`Parameter ${paramName} too small (min: ${min})`, 'parameter_validation');
      }
      if (max !== undefined && value > max) {
        throw new ValidationError(`Parameter ${paramName} too large (max: ${max})`, 'parameter_validation');
      }
    }

    // Enum validation
    if (enumValues && !enumValues.includes(value)) {
      throw new ValidationError(`Parameter ${paramName} must be one of: ${enumValues.join(', ')}`, 'parameter_validation');
    }
  }

  /**
   * Apply tool-specific restrictions
   */
  async applyToolRestrictions(tool, parameters, context) {
    for (const restriction of tool.restrictions || []) {
      switch (restriction) {
        case 'file_path_validation':
          this.validateFilePath(parameters.file_path);
          break;
        case 'command_sanitization':
          parameters.command = safetyManager.sanitizeCommand(parameters.command);
          break;
        case 'url_validation':
          this.validateUrl(parameters.url);
          break;
        case 'domain_whitelist':
          this.checkDomainWhitelist(parameters.url);
          break;
        case 'elevated_permissions':
          this.checkElevatedPermissions(context);
          break;
      }
    }
  }

  /**
   * Validate file path
   */
  validateFilePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new ValidationError('File path must be a non-empty string', 'file_path');
    }

    // Check for directory traversal
    if (filePath.includes('..') || filePath.includes('~')) {
      throw new SecurityError('Directory traversal not allowed in file path');
    }

    // Must be absolute path
    if (!filePath.startsWith('/')) {
      throw new ValidationError('File path must be absolute', 'file_path');
    }

    // Check for sensitive system files
    const restrictedPaths = ['/etc/passwd', '/etc/shadow', '/root', '/proc', '/sys'];
    if (restrictedPaths.some(path => filePath.startsWith(path))) {
      throw new SecurityError(`Access to ${filePath} is restricted`);
    }
  }

  /**
   * Validate URL
   */
  validateUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Only allow HTTP/HTTPS
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new SecurityError('Only HTTP and HTTPS URLs are allowed');
      }

      // Block local/private IPs
      const hostname = urlObj.hostname;
      if (this.isPrivateIP(hostname)) {
        throw new SecurityError('Access to private/local IPs is not allowed');
      }

    } catch (error) {
      if (error instanceof SecurityError) throw error;
      throw new ValidationError(`Invalid URL: ${url}`, 'url_validation');
    }
  }

  /**
   * Check if IP is private/local
   */
  isPrivateIP(hostname) {
    const privateRanges = [
      /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./,
      /^127\./, /^169\.254\./, /^::1$/, /^fc00:/, /^fe80:/
    ];
    return privateRanges.some(range => range.test(hostname)) || hostname === 'localhost';
  }

  /**
   * Check domain whitelist
   */
  checkDomainWhitelist(url) {
    if (this.config.allowedDomains.length === 0) return; // No whitelist configured

    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    const allowed = this.config.allowedDomains.some(allowedDomain => {
      return domain === allowedDomain || domain.endsWith('.' + allowedDomain);
    });

    if (!allowed) {
      throw new SecurityError(`Domain ${domain} is not in the allowed domains list`);
    }
  }

  /**
   * Check elevated permissions
   */
  checkElevatedPermissions(context) {
    // In a real system, this would check if the agent has elevated permissions
    if (!context.elevated && this.config.restrictedTools.includes(context.toolName)) {
      throw new SecurityError('Elevated permissions required for this tool');
    }
  }

  /**
   * Check agent tool limits
   */
  checkAgentToolLimits(agentId) {
    if (!agentId) return;

    const agentUsage = this.toolUsage.get(agentId) || { count: 0, lastReset: Date.now() };
    
    // Reset if it's been more than an hour
    if (Date.now() - agentUsage.lastReset > 3600000) {
      agentUsage.count = 0;
      agentUsage.lastReset = Date.now();
    }

    if (agentUsage.count >= this.config.maxToolsPerAgent) {
      throw new SecurityError(`Agent ${agentId} has exceeded tool usage limit (${this.config.maxToolsPerAgent}/hour)`);
    }
  }

  /**
   * Update tool metrics
   */
  updateToolMetrics(toolName, type, executionTime = 0) {
    const metrics = this.toolMetrics.get(toolName) || {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0
    };

    if (type === 'attempt') {
      metrics.totalCalls++;
    } else if (type === 'success') {
      metrics.successfulCalls++;
      metrics.totalExecutionTime += executionTime;
      metrics.averageExecutionTime = metrics.totalExecutionTime / metrics.successfulCalls;
    } else if (type === 'failure') {
      metrics.failedCalls++;
    }

    this.toolMetrics.set(toolName, metrics);
  }

  /**
   * Record tool usage by agent
   */
  recordToolUsage(toolName, agentId, success) {
    if (!agentId) return;

    const usage = this.toolUsage.get(agentId) || {
      count: 0,
      tools: {},
      lastReset: Date.now()
    };

    usage.count++;
    usage.tools[toolName] = (usage.tools[toolName] || 0) + 1;
    
    this.toolUsage.set(agentId, usage);
  }

  /**
   * Mock tool execution (replace with actual tool implementations)
   */
  async executeToolImpl(toolName, parameters, context) {
    // This is a mock implementation - in reality, this would call the actual tools
    switch (toolName) {
      case 'read':
        return { content: `Mock content of ${parameters.file_path}`, size: 1024 };
      case 'write':
        return { success: true, bytesWritten: parameters.content.length };
      case 'bash':
        return { stdout: 'Mock command output', stderr: '', exitCode: 0 };
      case 'grep':
        return { matches: ['mock match 1', 'mock match 2'], count: 2 };
      default:
        return { result: `Mock result for ${toolName}` };
    }
  }

  /**
   * Get tool information
   */
  getToolInfo(toolName) {
    const tool = this.toolRegistry.get(toolName);
    const metrics = this.toolMetrics.get(toolName);
    
    if (!tool) {
      throw new ValidationError(`Tool '${toolName}' not found`, 'tool_info');
    }

    return {
      ...tool,
      metrics: metrics || {}
    };
  }

  /**
   * List all available tools
   */
  listTools(category = null) {
    const tools = Array.from(this.toolRegistry.values());
    return category ? tools.filter(tool => tool.category === category) : tools;
  }

  /**
   * Get tool usage statistics
   */
  getToolStatistics() {
    const stats = {
      totalTools: this.toolRegistry.size,
      categories: {},
      overallMetrics: {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0
      },
      topTools: []
    };

    // Calculate category stats
    for (const tool of this.toolRegistry.values()) {
      stats.categories[tool.category] = (stats.categories[tool.category] || 0) + 1;
    }

    // Calculate overall metrics and top tools
    const toolMetrics = [];
    for (const [toolName, metrics] of this.toolMetrics) {
      stats.overallMetrics.totalCalls += metrics.totalCalls;
      stats.overallMetrics.successfulCalls += metrics.successfulCalls;
      stats.overallMetrics.failedCalls += metrics.failedCalls;
      
      toolMetrics.push({ name: toolName, ...metrics });
    }

    stats.topTools = toolMetrics
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, 10);

    return stats;
  }
}

// Export singleton instance
export const toolManager = new ToolManager();