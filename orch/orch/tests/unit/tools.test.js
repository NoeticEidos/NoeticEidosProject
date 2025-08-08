// Unit tests for tools validation and management
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  ToolManager, 
  toolManager 
} from '../../src/tools/index.js';
import { ValidationError, SecurityError } from '../../src/schemas/index.js';

describe('ToolManager', () => {
  let tools;

  beforeEach(() => {
    tools = new ToolManager({
      maxToolsPerAgent: 10,
      toolTimeout: 5000,
      allowedTools: ['read', 'write', 'edit', 'bash', 'grep'],
      restrictedTools: ['bash'],
      toolCategories: {
        file: ['read', 'write', 'edit', 'grep'],
        system: ['bash'],
        web: ['webfetch']
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Tool Registration', () => {
    const validToolDefinition = {
      name: 'test_tool',
      category: 'file',
      description: 'Test tool for validation',
      parameters: {
        input: { type: 'string', required: true },
        options: { type: 'object', required: false }
      },
      restrictions: [],
      timeout: 10000
    };

    it('should register a valid tool', () => {
      expect(() => tools.registerTool(validToolDefinition))
        .not.toThrow();
      
      const registeredTool = tools.toolRegistry.get('test_tool');
      expect(registeredTool).toBeDefined();
      expect(registeredTool.name).toBe('test_tool');
      expect(registeredTool.registeredAt).toBeDefined();
    });

    it('should reject tools with invalid names', () => {
      const invalidTool = {
        ...validToolDefinition,
        name: 'Invalid-Tool-Name!' // Contains invalid characters
      };

      expect(() => tools.registerTool(invalidTool))
        .toThrow(ValidationError);
    });

    it('should reject tools with missing required fields', () => {
      const requiredFields = ['name', 'category', 'description', 'parameters'];
      
      requiredFields.forEach(field => {
        const invalidTool = { ...validToolDefinition };
        delete invalidTool[field];
        
        expect(() => tools.registerTool(invalidTool))
          .toThrow(ValidationError);
      });
    });

    it('should reject tools with invalid categories', () => {
      const invalidTool = {
        ...validToolDefinition,
        category: 'nonexistent'
      };

      expect(() => tools.registerTool(invalidTool))
        .toThrow(ValidationError);
    });

    it('should reject tools not in allowed list', () => {
      const disallowedTool = {
        ...validToolDefinition,
        name: 'disallowed_tool'
      };

      expect(() => tools.registerTool(disallowedTool))
        .toThrow(SecurityError);
    });

    it('should initialize metrics for registered tools', () => {
      tools.registerTool(validToolDefinition);
      
      const metrics = tools.toolMetrics.get('test_tool');
      expect(metrics).toBeDefined();
      expect(metrics.totalCalls).toBe(0);
      expect(metrics.successfulCalls).toBe(0);
      expect(metrics.failedCalls).toBe(0);
    });
  });

  describe('Tool Call Validation', () => {
    beforeEach(() => {
      // Register test tool
      tools.registerTool({
        name: 'test_validation',
        category: 'file',
        description: 'Test validation tool',
        parameters: {
          required_param: { type: 'string', required: true, minLength: 1, maxLength: 100 },
          optional_param: { type: 'number', required: false, min: 0, max: 1000 },
          enum_param: { type: 'string', required: false, enum: ['option1', 'option2', 'option3'] }
        },
        restrictions: ['file_path_validation'],
        timeout: 15000
      });
    });

    it('should validate a valid tool call', async () => {
      const parameters = {
        required_param: 'test value',
        optional_param: 50,
        enum_param: 'option1'
      };

      const result = await tools.validateToolCall('test_validation', parameters);
      
      expect(result.tool).toBeDefined();
      expect(result.validatedParameters).toEqual(parameters);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.validatedAt).toBeDefined();
    });

    it('should reject calls to non-existent tools', async () => {
      await expect(tools.validateToolCall('nonexistent_tool', {}))
        .rejects.toThrow(ValidationError);
    });

    it('should reject calls missing required parameters', async () => {
      const parameters = {
        optional_param: 50
        // Missing required_param
      };

      await expect(tools.validateToolCall('test_validation', parameters))
        .rejects.toThrow(ValidationError);
    });

    it('should reject calls with invalid parameter types', async () => {
      const parameters = {
        required_param: 123, // Should be string
        optional_param: 'invalid' // Should be number
      };

      await expect(tools.validateToolCall('test_validation', parameters))
        .rejects.toThrow(ValidationError);
    });

    it('should validate string length constraints', async () => {
      // Too short
      await expect(tools.validateToolCall('test_validation', { required_param: '' }))
        .rejects.toThrow(ValidationError);

      // Too long
      await expect(tools.validateToolCall('test_validation', { 
        required_param: 'a'.repeat(101) 
      })).rejects.toThrow(ValidationError);

      // Just right
      await expect(tools.validateToolCall('test_validation', { 
        required_param: 'valid length' 
      })).resolves.toBeDefined();
    });

    it('should validate number range constraints', async () => {
      const baseParams = { required_param: 'test' };

      // Too small
      await expect(tools.validateToolCall('test_validation', { 
        ...baseParams, 
        optional_param: -1 
      })).rejects.toThrow(ValidationError);

      // Too large
      await expect(tools.validateToolCall('test_validation', { 
        ...baseParams, 
        optional_param: 1001 
      })).rejects.toThrow(ValidationError);

      // Valid range
      await expect(tools.validateToolCall('test_validation', { 
        ...baseParams, 
        optional_param: 500 
      })).resolves.toBeDefined();
    });

    it('should validate enum constraints', async () => {
      const baseParams = { required_param: 'test' };

      // Invalid enum value
      await expect(tools.validateToolCall('test_validation', { 
        ...baseParams, 
        enum_param: 'invalid_option' 
      })).rejects.toThrow(ValidationError);

      // Valid enum value
      await expect(tools.validateToolCall('test_validation', { 
        ...baseParams, 
        enum_param: 'option2' 
      })).resolves.toBeDefined();
    });

    it('should reject unknown parameters', async () => {
      const parameters = {
        required_param: 'test',
        unknown_param: 'should not be allowed'
      };

      await expect(tools.validateToolCall('test_validation', parameters))
        .rejects.toThrow(ValidationError);
    });

    it('should update attempt metrics', async () => {
      const initialMetrics = tools.toolMetrics.get('test_validation');
      const initialCalls = initialMetrics.totalCalls;

      try {
        await tools.validateToolCall('test_validation', { required_param: 'test' });
      } catch (e) {
        // Might fail due to restrictions, but metrics should still update
      }

      const updatedMetrics = tools.toolMetrics.get('test_validation');
      expect(updatedMetrics.totalCalls).toBe(initialCalls + 1);
    });
  });

  describe('Tool Execution', () => {
    beforeEach(() => {
      tools.registerTool({
        name: 'mock_tool',
        category: 'file',
        description: 'Mock tool for testing',
        parameters: {
          input: { type: 'string', required: true }
        },
        restrictions: [],
        timeout: 5000
      });
    });

    it('should execute a valid tool call successfully', async () => {
      const parameters = { input: 'test input' };
      const context = { agentId: 'test-agent', taskId: 'test-task' };

      const result = await tools.executeTool('mock_tool', parameters, context);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.toolName).toBe('mock_tool');
      expect(result.metadata.agentId).toBe('test-agent');
      expect(result.metadata.executionTime).toBeGreaterThan(0);
    });

    it('should handle tool execution failures', async () => {
      // Mock a tool that will fail validation
      const parameters = {}; // Missing required input

      const result = await tools.executeTool('mock_tool', parameters);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should update success metrics on successful execution', async () => {
      const initialMetrics = tools.toolMetrics.get('mock_tool');
      const initialSuccessful = initialMetrics.successfulCalls;

      await tools.executeTool('mock_tool', { input: 'test' });

      const updatedMetrics = tools.toolMetrics.get('mock_tool');
      expect(updatedMetrics.successfulCalls).toBe(initialSuccessful + 1);
      expect(updatedMetrics.averageExecutionTime).toBeGreaterThan(0);
    });

    it('should update failure metrics on failed execution', async () => {
      const initialMetrics = tools.toolMetrics.get('mock_tool');
      const initialFailed = initialMetrics.failedCalls;

      await tools.executeTool('mock_tool', {}); // Invalid parameters

      const updatedMetrics = tools.toolMetrics.get('mock_tool');
      expect(updatedMetrics.failedCalls).toBe(initialFailed + 1);
    });

    it('should record tool usage by agent', async () => {
      const agentId = 'test-agent-usage';
      const context = { agentId };

      await tools.executeTool('mock_tool', { input: 'test' }, context);

      const usage = tools.toolUsage.get(agentId);
      expect(usage).toBeDefined();
      expect(usage.count).toBe(1);
      expect(usage.tools.mock_tool).toBe(1);
    });
  });

  describe('Tool Restrictions', () => {
    describe('File Path Validation', () => {
      beforeEach(() => {
        tools.registerTool({
          name: 'file_tool',
          category: 'file',
          description: 'File tool with path validation',
          parameters: {
            file_path: { type: 'string', required: true }
          },
          restrictions: ['file_path_validation']
        });
      });

      it('should accept valid absolute file paths', async () => {
        const validPaths = [
          '/home/user/document.txt',
          '/var/log/application.log',
          '/tmp/tempfile.dat'
        ];

        for (const path of validPaths) {
          await expect(tools.validateToolCall('file_tool', { file_path: path }))
            .resolves.toBeDefined();
        }
      });

      it('should reject relative paths', async () => {
        const relativePaths = [
          'relative/path.txt',
          './current/dir/file.txt',
          'file.txt'
        ];

        for (const path of relativePaths) {
          await expect(tools.validateToolCall('file_tool', { file_path: path }))
            .rejects.toThrow(ValidationError);
        }
      });

      it('should reject directory traversal attempts', async () => {
        const traversalPaths = [
          '/home/user/../../../etc/passwd',
          '/var/www/html/../../../../../root/.ssh/id_rsa',
          '~/sensitive/file.txt'
        ];

        for (const path of traversalPaths) {
          await expect(tools.validateToolCall('file_tool', { file_path: path }))
            .rejects.toThrow(SecurityError);
        }
      });

      it('should reject access to sensitive system files', async () => {
        const sensitivePaths = [
          '/etc/passwd',
          '/etc/shadow',
          '/root/secret.key',
          '/proc/version',
          '/sys/kernel/debug'
        ];

        for (const path of sensitivePaths) {
          await expect(tools.validateToolCall('file_tool', { file_path: path }))
            .rejects.toThrow(SecurityError);
        }
      });
    });

    describe('Command Sanitization', () => {
      beforeEach(() => {
        tools.registerTool({
          name: 'bash_tool',
          category: 'system',
          description: 'Bash tool with command sanitization',
          parameters: {
            command: { type: 'string', required: true }
          },
          restrictions: ['command_sanitization']
        });
      });

      it('should sanitize valid commands', async () => {
        const validCommands = [
          'ls -la',
          'grep pattern file.txt',
          'find /home -name "*.txt"'
        ];

        for (const command of validCommands) {
          await expect(tools.validateToolCall('bash_tool', { command }))
            .resolves.toBeDefined();
        }
      });

      it('should block dangerous commands through safety manager', async () => {
        const dangerousCommands = [
          'rm -rf /',
          'sudo rm important.txt',
          'eval "malicious_code()"'
        ];

        for (const command of dangerousCommands) {
          await expect(tools.validateToolCall('bash_tool', { command }))
            .rejects.toThrow(SecurityError);
        }
      });
    });

    describe('URL Validation', () => {
      beforeEach(() => {
        tools.registerTool({
          name: 'web_tool',
          category: 'web',
          description: 'Web tool with URL validation',
          parameters: {
            url: { type: 'string', required: true }
          },
          restrictions: ['url_validation']
        });
      });

      it('should accept valid HTTP/HTTPS URLs', async () => {
        const validUrls = [
          'https://www.example.com',
          'http://api.service.org/endpoint',
          'https://subdomain.example.com/path?query=value'
        ];

        for (const url of validUrls) {
          await expect(tools.validateToolCall('web_tool', { url }))
            .resolves.toBeDefined();
        }
      });

      it('should reject non-HTTP protocols', async () => {
        const invalidUrls = [
          'file:///etc/passwd',
          'ftp://ftp.example.com/file.txt',
          'javascript:alert("xss")'
        ];

        for (const url of invalidUrls) {
          await expect(tools.validateToolCall('web_tool', { url }))
            .rejects.toThrow(SecurityError);
        }
      });

      it('should reject private/local IP addresses', async () => {
        const privateUrls = [
          'http://127.0.0.1:8080',
          'https://192.168.1.1',
          'http://10.0.0.1/admin',
          'https://172.16.0.1',
          'http://localhost:3000'
        ];

        for (const url of privateUrls) {
          await expect(tools.validateToolCall('web_tool', { url }))
            .rejects.toThrow(SecurityError);
        }
      });

      it('should reject malformed URLs', async () => {
        const malformedUrls = [
          'not-a-url',
          'http://',
          'https://[invalid]',
          'http://.'
        ];

        for (const url of malformedUrls) {
          await expect(tools.validateToolCall('web_tool', { url }))
            .rejects.toThrow(ValidationError);
        }
      });
    });

    describe('Domain Whitelist', () => {
      beforeEach(() => {
        tools = new ToolManager({
          allowedDomains: ['example.com', 'trusted.org', 'api.service.net']
        });

        tools.registerTool({
          name: 'whitelist_tool',
          category: 'web',
          description: 'Web tool with domain whitelist',
          parameters: {
            url: { type: 'string', required: true }
          },
          restrictions: ['url_validation', 'domain_whitelist']
        });
      });

      it('should allow whitelisted domains', async () => {
        const allowedUrls = [
          'https://example.com/page',
          'https://www.example.com/api',
          'https://subdomain.trusted.org/endpoint',
          'https://api.service.net/v1/data'
        ];

        for (const url of allowedUrls) {
          await expect(tools.validateToolCall('whitelist_tool', { url }))
            .resolves.toBeDefined();
        }
      });

      it('should reject non-whitelisted domains', async () => {
        const blockedUrls = [
          'https://malicious.com/page',
          'https://untrusted.net/api',
          'https://example.evil.com/fake' // Subdomain of different domain
        ];

        for (const url of blockedUrls) {
          await expect(tools.validateToolCall('whitelist_tool', { url }))
            .rejects.toThrow(SecurityError);
        }
      });
    });
  });

  describe('Agent Tool Limits', () => {
    it('should enforce per-agent tool usage limits', async () => {
      const agentId = 'limited-agent';
      const context = { agentId };

      // Register a test tool
      tools.registerTool({
        name: 'limit_test',
        category: 'file',
        description: 'Tool for testing limits',
        parameters: { input: { type: 'string', required: true } }
      });

      // Use tool up to the limit (10 times)
      for (let i = 0; i < 10; i++) {
        await tools.executeTool('limit_test', { input: `test-${i}` }, context);
      }

      // Next call should be blocked
      await expect(tools.executeTool('limit_test', { input: 'excess' }, context))
        .rejects.toThrow(SecurityError);
    });

    it('should reset agent limits after time window', () => {
      const originalNow = Date.now;
      let currentTime = 1000000000;
      Date.now = jest.fn(() => currentTime);

      const agentId = 'time-reset-agent';
      
      // Set usage count and timestamp
      tools.toolUsage.set(agentId, {
        count: 10,
        tools: { test_tool: 5 },
        lastReset: currentTime - 3700000 // More than 1 hour ago
      });

      // This should not trigger limit because time window has passed
      expect(() => tools.checkAgentToolLimits(agentId)).not.toThrow();

      Date.now = originalNow;
    });
  });

  describe('Tool Information and Statistics', () => {
    beforeEach(() => {
      tools.registerTool({
        name: 'info_test',
        category: 'file',
        description: 'Tool for testing info retrieval',
        parameters: { input: { type: 'string', required: true } }
      });
    });

    it('should provide tool information', () => {
      const info = tools.getToolInfo('info_test');
      
      expect(info.name).toBe('info_test');
      expect(info.category).toBe('file');
      expect(info.description).toBeDefined();
      expect(info.parameters).toBeDefined();
      expect(info.metrics).toBeDefined();
    });

    it('should throw error for non-existent tool info', () => {
      expect(() => tools.getToolInfo('nonexistent'))
        .toThrow(ValidationError);
    });

    it('should list all tools', () => {
      const allTools = tools.listTools();
      expect(allTools.length).toBeGreaterThan(0);
      expect(allTools.some(t => t.name === 'info_test')).toBe(true);
    });

    it('should filter tools by category', () => {
      const fileTools = tools.listTools('file');
      expect(fileTools.every(t => t.category === 'file')).toBe(true);
    });

    it('should generate tool statistics', async () => {
      // Execute some tools to generate stats
      await tools.executeTool('info_test', { input: 'test1' });
      await tools.executeTool('info_test', { input: 'test2' });

      const stats = tools.getToolStatistics();

      expect(stats.totalTools).toBeGreaterThan(0);
      expect(stats.categories).toBeDefined();
      expect(stats.overallMetrics).toBeDefined();
      expect(stats.overallMetrics.totalCalls).toBeGreaterThanOrEqual(2);
      expect(stats.topTools).toBeDefined();
    });

    it('should rank top tools by usage', async () => {
      // Create multiple tools and use them
      for (let i = 0; i < 3; i++) {
        tools.registerTool({
          name: `ranked_tool_${i}`,
          category: 'file',
          description: `Ranked tool ${i}`,
          parameters: { input: { type: 'string', required: true } }
        });
      }

      // Use tools different amounts
      for (let i = 0; i < 5; i++) {
        await tools.executeTool('ranked_tool_0', { input: 'test' });
      }
      for (let i = 0; i < 3; i++) {
        await tools.executeTool('ranked_tool_1', { input: 'test' });
      }
      await tools.executeTool('ranked_tool_2', { input: 'test' });

      const stats = tools.getToolStatistics();
      
      // Check if tools are ranked by usage
      expect(stats.topTools[0].name).toBe('ranked_tool_0');
      expect(stats.topTools[0].totalCalls).toBe(5);
    });
  });

  describe('Default Tool Initialization', () => {
    it('should initialize with default tools', () => {
      const defaultTools = ['read', 'write', 'edit', 'bash', 'grep', 'webfetch', 'todowrite'];
      
      defaultTools.forEach(toolName => {
        expect(tools.toolRegistry.has(toolName)).toBe(true);
      });
    });

    it('should categorize default tools correctly', () => {
      const fileTools = tools.listTools('file');
      const systemTools = tools.listTools('system');
      const webTools = tools.listTools('web');

      expect(fileTools.some(t => t.name === 'read')).toBe(true);
      expect(systemTools.some(t => t.name === 'bash')).toBe(true);
      expect(webTools.some(t => t.name === 'webfetch')).toBe(true);
    });

    it('should set appropriate timeouts for different tools', () => {
      const readTool = tools.toolRegistry.get('read');
      const bashTool = tools.toolRegistry.get('bash');
      const webTool = tools.toolRegistry.get('webfetch');

      expect(readTool.timeout).toBe(10000);
      expect(bashTool.timeout).toBe(30000);
      expect(webTool.timeout).toBe(30000);
    });
  });

  describe('Mock Tool Implementation', () => {
    it('should provide mock results for different tools', async () => {
      const toolResults = [
        { name: 'read', params: { file_path: '/test/file.txt' } },
        { name: 'write', params: { file_path: '/test/file.txt', content: 'test' } },
        { name: 'bash', params: { command: 'ls -la' } },
        { name: 'grep', params: { pattern: 'test' } }
      ];

      for (const { name, params } of toolResults) {
        const result = await tools.executeTool(name, params);
        expect(result.success).toBe(true);
        expect(result.result).toBeDefined();
      }
    });
  });

  describe('Error Edge Cases', () => {
    it('should handle null/undefined parameters gracefully', async () => {
      await expect(tools.validateToolCall('read', null))
        .rejects.toThrow();

      await expect(tools.validateToolCall('read', undefined))
        .rejects.toThrow();
    });

    it('should handle empty string tool names', async () => {
      await expect(tools.validateToolCall('', { input: 'test' }))
        .rejects.toThrow(ValidationError);
    });

    it('should handle context without agent ID', async () => {
      const result = await tools.executeTool('read', { file_path: '/test.txt' }, {});
      expect(result).toBeDefined();
      // Should not track usage without agent ID, but should still work
    });
  });

  describe('Singleton Instance', () => {
    it('should export a singleton tool manager instance', () => {
      expect(toolManager).toBeInstanceOf(ToolManager);
      expect(toolManager.validateToolCall).toBeDefined();
      expect(toolManager.executeTool).toBeDefined();
    });

    it('should have default tools registered in singleton', () => {
      expect(toolManager.toolRegistry.size).toBeGreaterThan(0);
      expect(toolManager.toolRegistry.has('read')).toBe(true);
    });
  });
});