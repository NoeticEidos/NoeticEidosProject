/**
 * Jest Global Setup
 * Runs once before all test suites
 */

export default async function globalSetup(): Promise<void> {
  console.log('🚀 Starting global test setup...');

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3001';
  process.env.GRPC_PORT = '50052';
  process.env.LOG_LEVEL = 'error';
  process.env.MONGODB_URL = 'mongodb://admin:admin123@localhost:27017/orchestrator_test?authSource=admin';
  process.env.REDIS_URL = 'redis://localhost:6379/15';
  process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
  
  // Additional test setup can be added here
  // For example: starting test databases, mock servers, etc.
  
  console.log('✅ Global test setup completed');
}