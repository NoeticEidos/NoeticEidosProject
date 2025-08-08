# Node.js Orchestration Engine v1.1

A production-ready Node.js gRPC client that interfaces with a Python policy service using the v1.1 protocol for recursive AI orchestration with TRPO-based policy learning.

## Features

- **Complete gRPC v1.1 Protocol Support** - Full implementation of the orchestration service specification
- **Circuit Breaker Pattern** - Prevent cascading failures with configurable thresholds and recovery
- **Intelligent Retry Logic** - Exponential backoff with jitter and error-specific retry strategies
- **Comprehensive Error Handling** - Detailed error classification with retry vs fallback decision logic
- **Connection Management** - Automatic connection pooling, health checks, and recovery
- **Structured Logging** - Configurable logging with request tracing and performance metrics
- **TypeScript First** - Full type safety with comprehensive interfaces and error types
- **Observable Streams** - RxJS-based streaming support for real-time operations
- **Metrics Collection** - Built-in performance monitoring and circuit breaker metrics

## Quick Start

### Installation

```bash
npm install @orchestration/grpc-client
```

### Basic Usage

```typescript
import { PolicyServiceClient, DEFAULT_CONFIG } from '@orchestration/grpc-client';

// Create client with default configuration
const client = new PolicyServiceClient();

// Or with custom configuration
const client = new PolicyServiceClient({
  ...DEFAULT_CONFIG,
  endpoint: 'your-service.example.com:443',
  secure: true,
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    timeout: 60000,
  },
  retryPolicy: {
    enabled: true,
    maxAttempts: 3,
    initialDelay: 1000,
  }
});

// Connect and use
await client.connect();

const policy = await client.createPolicy({
  policy: {
    id: 'my-policy',
    name: 'My Policy',
    description: 'Example policy',
    spec: { /* policy specification */ },
    // ... other fields
  }
});

await client.disconnect();
```

## Configuration

The client supports comprehensive configuration:

```typescript
interface GRPCClientConfig {
  // Connection settings
  endpoint: string;
  connectionTimeout: number;
  requestTimeout: number;
  secure: boolean;
  
  // Authentication
  auth?: {
    type: 'basic' | 'bearer' | 'api-key' | 'jwt';
    // ... auth specific config
  };
  
  // Circuit breaker
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    timeout: number;
    recoveryThreshold: number;
    // ... more options
  };
  
  // Retry policy
  retryPolicy: {
    enabled: boolean;
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    jitter: number;
    // ... more options
  };
  
  // Health checks, logging, metrics, etc.
}
```

## Policy Management

### Create Policy

```typescript
const response = await client.createPolicy({
  policy: {
    id: 'access-policy',
    name: 'Access Control Policy',
    description: 'Controls access to resources',
    spec: {
      rules: [
        {
          id: 'allow-admin',
          name: 'Allow Admin Access',
          condition: 'user.role == "admin"',
          actions: [
            {
              type: 'ALLOW',
              parameters: {},
              target: 'resource',
              retryPolicy: { /* retry settings */ }
            }
          ],
          priority: 1,
          enabled: true,
          metadata: {}
        }
      ],
      config: {
        timeout: 30000,
        maxRetries: 3,
        // ... other config
      },
      dependencies: [],
      variables: {}
    },
    // ... other fields
  },
  validateOnly: false
});
```

### Policy Evaluation

```typescript
// Single evaluation
const result = await client.evaluatePolicy({
  policyId: 'access-policy',
  context: {
    user: { id: 'user123', role: 'admin' },
    resource: { type: 'document', id: 'doc456' }
  },
  inputs: {
    action: 'read',
    timestamp: new Date().toISOString()
  }
});

console.log('Access granted:', result.result);
console.log('Actions taken:', result.actions);

// Batch evaluation
const batchResult = await client.batchEvaluatePolicy({
  requests: [
    { policyId: 'policy1', context: {}, inputs: {} },
    { policyId: 'policy2', context: {}, inputs: {} }
  ],
  options: { maxParallel: 10, timeout: 30000 }
});
```

### Streaming Evaluation

```typescript
const stream = client.streamEvaluatePolicy();

stream.subscribe({
  next: (response) => {
    if (response.result) {
      console.log('Evaluation result:', response.result);
    } else if (response.status) {
      console.log('Stream status:', response.status);
    }
  },
  error: (error) => console.error('Stream error:', error),
  complete: () => console.log('Stream completed')
});

// Send evaluation requests
stream.write({
  evaluate: {
    policyId: 'streaming-policy',
    context: { /* context */ },
    inputs: { /* inputs */ }
  }
});
```

## Error Handling

The client provides sophisticated error handling with automatic classification:

```typescript
import { 
  OrchestrationClientError, 
  ErrorUtils,
  RETRYABLE_ERROR_CODES,
  FALLBACK_ERROR_CODES 
} from '@orchestration/grpc-client';

try {
  await client.getPolicy({ id: 'nonexistent' });
} catch (error) {
  if (error instanceof OrchestrationClientError) {
    console.log('Error code:', error.code);
    console.log('Retryable:', error.retryable);
    console.log('Fallback eligible:', error.fallbackEligible);
    console.log('Permanent:', error.permanent);
    
    if (error.retryable) {
      // Will be automatically retried
    } else if (error.fallbackEligible) {
      // Should use fallback mechanism
    } else {
      // Permanent error, don't retry
    }
  }
}
```

### Error Codes

The library distinguishes between different types of errors:

- **Retryable Errors**: Temporary failures that should be retried (5xx server errors, timeouts, rate limits)
- **Fallback Eligible**: Circuit breaker open, retry exhausted - use alternative approach
- **Permanent Errors**: Client errors (4xx) that won't succeed on retry

## Circuit Breaker

The circuit breaker prevents cascading failures:

```typescript
// Monitor circuit breaker state
client.on('circuitBreakerStateChange', (from, to) => {
  console.log(`Circuit breaker: ${from} -> ${to}`);
});

// Get circuit breaker metrics
const metrics = await client.getMetrics();
console.log('Circuit breaker state:', metrics.circuitBreakerState);
console.log('Failure rate:', metrics.errorStats);
```

## Retry Strategies

Configure intelligent retry behavior:

```typescript
const client = new PolicyServiceClient({
  retryPolicy: {
    enabled: true,
    maxAttempts: 5,
    initialDelay: 1000,      // 1 second
    maxDelay: 30000,         // 30 seconds
    backoffMultiplier: 2.0,  // Exponential backoff
    jitter: 0.1,             // 10% jitter
    maxDuration: 300000,     // 5 minute total limit
    retryConditions: [
      'circuit_breaker_compatible',
      'rate_limit_aware'
    ]
  }
});
```

## Health Checks and Monitoring

```typescript
// Check service health
const health = await client.getHealthCheck();
console.log('Service status:', health.status);

// Monitor metrics
client.on('metricsUpdated', (metrics) => {
  console.log('Total requests:', metrics.totalRequests);
  console.log('Success rate:', metrics.successfulRequests / metrics.totalRequests);
  console.log('Average response time:', metrics.averageResponseTime);
});

// Get current metrics
const currentMetrics = await client.getMetrics();
```

## Authentication

### Basic Authentication

```typescript
const client = new PolicyServiceClient({
  endpoint: 'secure-service.example.com:443',
  secure: true,
  auth: {
    type: 'basic',
    basic: {
      username: 'your-username',
      password: 'your-password'
    }
  }
});
```

### Bearer Token

```typescript
const client = new PolicyServiceClient({
  endpoint: 'secure-service.example.com:443',
  secure: true,
  auth: {
    type: 'bearer',
    bearer: {
      token: 'your-jwt-token',
      refreshToken: 'refresh-token',  // optional
      refreshUrl: '/auth/refresh'      // optional
    }
  }
});
```

### API Key

```typescript
const client = new PolicyServiceClient({
  endpoint: 'secure-service.example.com:443',
  secure: true,
  auth: {
    type: 'api-key',
    apiKey: {
      key: 'your-api-key',
      header: 'X-API-Key'  // default: 'x-api-key'
    }
  }
});
```

## TLS Configuration

```typescript
const client = new PolicyServiceClient({
  endpoint: 'secure-service.example.com:443',
  secure: true,
  tls: {
    ca: fs.readFileSync('ca-cert.pem'),      // CA certificate
    cert: fs.readFileSync('client-cert.pem'), // Client certificate
    key: fs.readFileSync('client-key.pem'),   // Client private key
    serverName: 'service.example.com',        // Server name for verification
    insecure: false                           // Skip certificate verification
  }
});
```

## Logging

Configure structured logging:

```typescript
const client = new PolicyServiceClient({
  logging: {
    level: 'info',
    logRequests: true,
    logErrors: true,
    logPerformance: true,
    format: 'json',
    maxLogSize: 1000000
  }
});
```

## Development

### Building

```bash
# Install dependencies
npm install

# Generate proto stubs (if proto files change)
npm run build:proto

# Build TypeScript
npm run build

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Lint code
npm run lint
```

### Proto Generation

The library uses generated TypeScript stubs from protobuf definitions:

```bash
# Install protoc and grpc tools
npm run proto:install

# Generate TypeScript stubs
npm run build:proto
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage report
npm run test:coverage
```

## Architecture

The library is structured in layers:

```
src/
├── client/              # Main client implementation
│   └── policy-service-client.ts
├── types/               # TypeScript interfaces and types
│   ├── client-types.ts  # Service method types
│   ├── config-types.ts  # Configuration interfaces
│   ├── error-types.ts   # Error handling types
│   └── grpc-types.ts    # Generated proto types
├── utils/               # Core utilities
│   ├── circuit-breaker.ts # Circuit breaker implementation
│   ├── retry-handler.ts   # Retry logic
│   └── logger.ts          # Structured logging
└── proto/               # Generated gRPC stubs
    └── orchestration_grpc_pb.ts
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Changelog

### v1.1.0

- Complete gRPC v1.1 protocol implementation
- Circuit breaker pattern with exponential backoff
- Intelligent retry strategies with error classification
- Comprehensive error handling and logging
- Observable-based streaming support
- Full TypeScript type safety
- Health checks and metrics collection
- Authentication support (Basic, Bearer, API Key, JWT)
- TLS/SSL configuration
- Connection pooling and management

### v1.0.0

- Initial release with basic gRPC client functionality