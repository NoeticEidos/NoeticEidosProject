/**
 * Test Setup Configuration
 * Global test environment setup and utilities
 */

import { jest } from '@jest/globals';
import 'dotenv/config';

// Global test configuration
global.console = {
  ...console,
  // Suppress console.log in tests unless DEBUG is set
  log: process.env.DEBUG ? console.log : jest.fn(),
  debug: process.env.DEBUG ? console.debug : jest.fn(),
  info: process.env.DEBUG ? console.info : jest.fn(),
  warn: console.warn,
  error: console.error
};

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

// Test timeouts
jest.setTimeout(30000);

// Global test utilities
global.createMockStep = (type: string, data: any) => ({
  id: `mock-${type}-${Date.now()}`,
  type: type as any,
  args_json: JSON.stringify(data),
  metadata: {
    timestamp: Date.now(),
    userId: 'test-user',
    sessionId: 'test-session'
  }
});

global.createMockBudgetInfo = (overrides: any = {}) => ({
  tokens: 0,
  computeTime: 0,
  memory: 0,
  apiCalls: 0,
  monetaryCost: 0,
  customMetrics: {},
  ...overrides
});

global.createMockWorkflow = (steps: any[], budgetLimit: any = {}) => ({
  id: `mock-workflow-${Date.now()}`,
  name: 'Mock Test Workflow',
  version: '1.0.0',
  steps,
  budgetLimit: {
    tokens: 10000,
    computeTime: 120000,
    memory: 1024 * 1024 * 100,
    apiCalls: 50,
    monetaryCost: 10.0,
    ...budgetLimit
  },
  replayable: false
});

// Mock gRPC client factory
global.createMockGrpcClient = () => ({
  processOCR: jest.fn().mockResolvedValue({
    text: 'Mock OCR result',
    confidence: 0.95,
    boundingBoxes: []
  }),
  processNER: jest.fn().mockResolvedValue({
    entities: [],
    originalText: 'Mock NER input'
  }),
  executeRoute: jest.fn().mockResolvedValue({
    status: 200,
    statusText: 'OK',
    data: { mock: true }
  }),
  close: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(false),
  getConnectionState: jest.fn().mockReturnValue('IDLE')
});

// Custom Jest matchers
expect.extend({
  toBeWithinBudget(received, budgetLimit) {
    const pass = received <= budgetLimit;
    return {
      message: () => 
        `expected ${received} ${pass ? 'not ' : ''}to be within budget limit ${budgetLimit}`,
      pass
    };
  },
  
  toHaveValidSchema(received) {
    const hasRequiredFields = received && 
      typeof received.isValid === 'boolean';
    const hasErrorsWhenInvalid = !received.isValid ? 
      Array.isArray(received.errors) : true;
    
    const pass = hasRequiredFields && hasErrorsWhenInvalid;
    return {
      message: () => 
        `expected ${JSON.stringify(received)} ${pass ? 'not ' : ''}to have valid validation result schema`,
      pass
    };
  },
  
  toHaveSafetyViolations(received) {
    const pass = received && 
      Array.isArray(received.safetyViolations) &&
      received.safetyViolations.length > 0;
    return {
      message: () => 
        `expected execution outcome ${pass ? 'not ' : ''}to have safety violations`,
      pass
    };
  },
  
  toBeCompletedWithinTime(received, timeLimit) {
    const pass = received && 
      received.status === 'completed' &&
      received.duration <= timeLimit;
    return {
      message: () => 
        `expected execution ${pass ? 'not ' : ''}to complete within ${timeLimit}ms (actual: ${received?.duration}ms)`,
      pass
    };
  }
});

// Error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in test environment
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit in test environment
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
});

// Clean up resources after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

// Global test teardown
afterAll(async () => {
  // Clean up any global resources
  await new Promise(resolve => setTimeout(resolve, 100));
});

export {};
