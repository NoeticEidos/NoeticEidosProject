/**
 * Test setup and global mocks
 */

import { jest } from '@jest/globals';

// Global test setup
beforeAll(() => {
  // Mock console methods to reduce test noise
  jest.spyOn(console, 'debug').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  // Restore console methods
  jest.restoreAllMocks();
});

// Mock gRPC modules
jest.mock('@grpc/grpc-js', () => ({
  ChannelCredentials: {
    createInsecure: jest.fn(() => ({})),
    createSsl: jest.fn(() => ({})),
  },
  Metadata: jest.fn(() => ({
    add: jest.fn(),
    get: jest.fn(() => []),
  })),
  status: {
    OK: 0,
    CANCELLED: 1,
    UNKNOWN: 2,
    INVALID_ARGUMENT: 3,
    DEADLINE_EXCEEDED: 4,
    NOT_FOUND: 5,
    ALREADY_EXISTS: 6,
    PERMISSION_DENIED: 7,
    RESOURCE_EXHAUSTED: 8,
    FAILED_PRECONDITION: 9,
    ABORTED: 10,
    OUT_OF_RANGE: 11,
    UNIMPLEMENTED: 12,
    INTERNAL: 13,
    UNAVAILABLE: 14,
    DATA_LOSS: 15,
    UNAUTHENTICATED: 16,
  },
}));

// Mock proto generated files
jest.mock('../src/proto/orchestration_grpc_pb', () => ({
  PolicyServiceClient: jest.fn(() => ({
    close: jest.fn(),
  })),
}));

// Global test utilities
global.createMockPolicy = () => ({
  id: 'test-policy-id',
  name: 'Test Policy',
  description: 'A test policy for unit tests',
  spec: {
    rules: [],
    config: {
      timeout: 30000,
      maxRetries: 3,
      retryPolicy: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        retryableErrors: [],
        nonRetryableErrors: [],
      },
      circuitBreaker: {
        failureThreshold: 5,
        timeout: 60000,
        recoveryThreshold: 3,
        recoveryTimeout: 30000,
        enabled: true,
      },
      settings: {},
    },
    dependencies: [],
    variables: {},
  },
  status: {
    state: 'ACTIVE',
    message: 'Policy is active',
    lastEvaluated: new Date(),
    evaluationCount: 0,
    successCount: 0,
    failureCount: 0,
    conditions: [],
  },
  createdAt: new Date(),
  updatedAt: new Date(),
  labels: {},
  annotations: {},
  version: '1.0.0',
});

global.createMockOrchestration = () => ({
  id: 'test-orchestration-id',
  name: 'Test Orchestration',
  description: 'A test orchestration',
  spec: {
    steps: [],
    config: {
      executionMode: 'SEQUENTIAL',
      timeout: 300000,
      maxParallelExecutions: 1,
      resourceLimits: {
        memoryLimit: 1024,
        cpuLimit: 1,
        diskLimit: 1024,
        networkLimit: 100,
      },
      settings: {},
    },
    variables: {},
    dependencies: [],
    triggers: { triggers: [] },
  },
  status: {
    state: 'ACTIVE',
    message: 'Orchestration is active',
    lastExecuted: new Date(),
    executionCount: 0,
    successCount: 0,
    failureCount: 0,
    conditions: [],
    currentExecution: {
      executionId: '',
      state: 'PENDING',
      startedAt: new Date(),
      completedAt: new Date(),
      completedSteps: 0,
      totalSteps: 0,
      currentStep: '',
    },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
  labels: {},
  annotations: {},
  version: '1.0.0',
});

// Type declarations for global test utilities
declare global {
  function createMockPolicy(): any;
  function createMockOrchestration(): any;
}