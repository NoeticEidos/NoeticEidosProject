/**
 * Jest Configuration for Validation Testing Framework
 * Optimized for TypeScript, ES modules, and comprehensive testing
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '<rootDir>/test/**/*.test.ts',
    '<rootDir>/test/**/*.test.js',
    '<rootDir>/deliverables/**/*.test.ts',
    '<rootDir>/scripts/**/*.test.ts'
  ],
  
  // Test file ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/.next/',
    '/coverage/'
  ],
  
  // File extensions
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json'
  ],
  
  // Module name mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^~/(.*)$': '<rootDir>/$1'
  },
  
  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ES2022',
          target: 'ES2022',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          moduleResolution: 'node',
          resolveJsonModule: true,
          declaration: false,
          sourceMap: true
        }
      }
    ]
  },
  
  // Module resolution
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  
  // Setup files
  setupFiles: [
    '<rootDir>/test/setup.ts'
  ],
  
  setupFilesAfterEnv: [
    '<rootDir>/test/setup-after-env.ts'
  ],
  
  // Global setup and teardown
  globalSetup: '<rootDir>/test/global-setup.ts',
  globalTeardown: '<rootDir>/test/global-teardown.ts',
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json',
    'json-summary'
  ],
  
  // Coverage collection patterns
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx,js,jsx}',
    '!src/**/*.spec.{ts,tsx,js,jsx}',
    '!src/node_modules/**',
    '!src/dist/**',
    '!src/build/**',
    '!src/coverage/**'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Specific thresholds for critical components
    'src/safety/**/*.ts': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    },
    'src/core/**/*.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  
  // Test timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Watch mode configuration
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/.git/'
  ],
  
  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/test-results',
        outputName: 'junit.xml',
        suiteName: 'Validation Framework Tests',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}'
      }
    ],
    [
      'jest-html-reporters',
      {
        publicDir: '<rootDir>/test-results',
        filename: 'test-report.html',
        expand: true,
        hideIcon: false,
        pageTitle: 'Validation Framework Test Report'
      }
    ]
  ],
  
  // Mock configuration
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Detect leaks
  detectLeaks: false,
  
  // Force exit
  forceExit: false,
  
  // Max workers
  maxWorkers: '50%',
  
  // Test sequencer
  testSequencer: '@jest/test-sequencer',
  
  // Module directories
  moduleDirectories: [
    'node_modules',
    '<rootDir>/src',
    '<rootDir>/test'
  ],
  
  // Notify mode
  notify: false,
  
  // Preset
  preset: 'ts-jest/presets/default-esm',
  
  // Projects (for multi-project setup)
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/test/unit/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/unit-setup.ts']
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/test/integration/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/integration-setup.ts'],
      testTimeout: 60000
    },
    {
      displayName: 'safety',
      testMatch: ['<rootDir>/deliverables/safety-demos/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/safety-setup.ts']
    }
  ],
  
  // Snapshot configuration
  snapshotSerializers: [],
  updateSnapshot: false,
  
  // Test result processor
  testResultsProcessor: '<rootDir>/test/results-processor.js',
  
  // Custom matchers
  customMatchers: {
    toBeWithinBudget: expect.extend({
      toBeWithinBudget(received, budgetLimit) {
        const pass = received <= budgetLimit;
        return {
          message: () => 
            `expected ${received} ${pass ? 'not ' : ''}to be within budget limit ${budgetLimit}`,
          pass
        };
      }
    })
  }
};
