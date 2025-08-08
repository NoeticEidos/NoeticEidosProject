/**
 * Jest Global Teardown
 * Runs once after all test suites
 */

export default async function globalTeardown(): Promise<void> {
  console.log('🧹 Starting global test teardown...');

  // Cleanup test resources
  // For example: stopping test databases, cleaning up files, etc.
  
  console.log('✅ Global test teardown completed');
}