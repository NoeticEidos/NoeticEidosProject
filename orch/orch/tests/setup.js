// Jest test setup for Mock gRPC Policy Service
const winston = require('winston');

// Suppress winston logs during testing
winston.configure({
  level: 'error',
  transports: [
    new winston.transports.Console({ silent: true })
  ]
});

// Global test timeout
jest.setTimeout(30000);

// Global test setup
beforeAll(() => {
  console.log('🧪 Starting Mock gRPC Policy Service v1.1 Test Suite');
});

afterAll(() => {
  console.log('✅ Test Suite Complete');
});

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';