# Getting Started - Mock gRPC Policy Service v1.1

## Quick Start

The fastest way to get the Mock gRPC Policy Service v1.1 running for testing and development.

## Prerequisites

- **Node.js** v18 or higher
- **npm** v8 or higher
- **Docker** (optional, for containerized deployment)
- **grpcurl** (optional, for command-line testing)

## Installation & Setup

### 1. Install Dependencies

```bash
cd src
npm install
```

### 2. Start the Service

#### Option A: Direct Node.js
```bash
# Development mode with auto-reload
npm run dev

# Or standard mode
npm start

# Or using the startup script
../scripts/start.sh start dev
```

#### Option B: Docker
```bash
# Build and run with Docker
docker build -t mock-policy-service .
docker run -p 50051:50051 mock-policy-service

# Or use docker-compose
docker-compose up

# Or use the build script
./scripts/docker-build.sh all
```

### 3. Verify Service is Running

```bash
# Health check using grpcurl
grpcurl -plaintext localhost:50051 policy.v1.PolicyService/HealthCheck

# Or use the test client
node scripts/test-client.js
```

## Basic Usage Examples

### 1. Create a Policy

```bash
grpcurl -plaintext -d '{
  "policy": {
    "name": "API Access Policy",
    "description": "Controls API endpoint access",
    "type": "POLICY_TYPE_ACCESS",
    "parameters": {
      "default_action": "deny",
      "rate_limit": "1000/hour"
    }
  }
}' localhost:50051 policy.v1.PolicyService/CreatePolicy
```

### 2. Generate a Workflow Plan

```bash
grpcurl -plaintext -d '{
  "policy_id": "your-policy-id",
  "complexity": "WORKFLOW_COMPLEXITY_MODERATE",
  "requirements": ["validate", "process", "notify"]
}' localhost:50051 policy.v1.PolicyService/GenerateWorkflowPlan
```

### 3. Run TRPO Evaluation

```bash
# Use the test client for complex TRPO operations
node scripts/test-client.js
```

## Development Setup

### Project Structure

```
mock-grpc-policy-service/
├── proto/                  # Protocol buffer definitions
│   └── policy_service.proto
├── src/                    # Source code
│   ├── server.js          # Main service implementation
│   └── package.json       # Dependencies
├── tests/                  # Test suite
│   ├── policy_service.test.js
│   └── setup.js
├── scripts/               # Utility scripts
│   ├── start.sh          # Service startup
│   ├── docker-build.sh   # Docker operations
│   └── test-client.js    # Test client
├── config/                # Configuration files
├── docs/                  # Documentation
├── Dockerfile            # Docker configuration
└── docker-compose.yml    # Multi-container setup
```

### Running Tests

```bash
# Install test dependencies
cd src && npm install

# Run the full test suite
npm test

# Or use Jest directly
npx jest

# Run specific test file
npx jest tests/policy_service.test.js

# Run with coverage
npm run test:coverage
```

### Development Commands

```bash
# Start in development mode
npm run dev

# Lint code
npm run lint

# Generate proto files (if needed)
npm run proto:build

# Docker development
docker-compose --profile dev up
```

## Docker Usage

### Build Options

```bash
# Production build
docker build --target production -t mock-policy-service:prod .

# Development build
docker build --target development -t mock-policy-service:dev .

# Multi-stage build
./scripts/docker-build.sh build production
```

### Docker Compose Profiles

```bash
# Production deployment
docker-compose up

# Development with auto-reload
docker-compose --profile dev up

# With monitoring (Prometheus + Grafana)
docker-compose --profile monitoring up
```

### Environment Variables

```bash
# Service configuration
NODE_ENV=production
LOG_LEVEL=info
SERVICE_NAME=mock-policy-service

# Docker configuration
VERSION=v1.1.0
REGISTRY=your-registry.com
```

## Testing the Service

### Health Check

```bash
curl -X POST http://localhost:50051/health
# or
grpcurl -plaintext localhost:50051 policy.v1.PolicyService/HealthCheck
```

### Comprehensive Testing

```bash
# Run the interactive test client
node scripts/test-client.js

# Expected output:
# 🚀 Testing Mock Policy Service v1.1
# 1️⃣ Testing Health Check... ✅
# 2️⃣ Testing Policy Creation... ✅
# 3️⃣ Testing Workflow Plan Generation... ✅
# 4️⃣ Testing TRPO Surrogate Evaluation... ✅
# 5️⃣ Testing Batch Policy Creation... ✅
# 6️⃣ Testing Signing Keys... ✅
# 7️⃣ Testing Service Metrics... ✅
# 🎉 All tests completed successfully!
```

### Load Testing

```bash
# Using grpcurl in a loop
for i in {1..100}; do
  grpcurl -plaintext localhost:50051 policy.v1.PolicyService/HealthCheck
done
```

## Integration Examples

### Node.js Client

```javascript
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// Load proto
const packageDefinition = protoLoader.loadSync('proto/policy_service.proto');
const policyProto = grpc.loadPackageDefinition(packageDefinition).policy.v1;

// Create client
const client = new policyProto.PolicyService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// Create policy
client.CreatePolicy({
  policy: {
    name: 'My Policy',
    type: 'POLICY_TYPE_ACCESS'
  }
}, (error, response) => {
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Created policy:', response.policy.id);
  }
});
```

### Python Client

```python
import grpc
from proto import policy_service_pb2
from proto import policy_service_pb2_grpc

# Create channel and stub
channel = grpc.insecure_channel('localhost:50051')
stub = policy_service_pb2_grpc.PolicyServiceStub(channel)

# Create policy request
request = policy_service_pb2.CreatePolicyRequest(
    policy=policy_service_pb2.Policy(
        name="Python Policy",
        type=policy_service_pb2.POLICY_TYPE_SECURITY
    )
)

# Make request
response = stub.CreatePolicy(request)
print(f"Created policy: {response.policy.id}")
```

## Monitoring & Observability

### Prometheus Metrics

The service exposes metrics at `/metrics`:

```bash
# View metrics
curl http://localhost:50051/metrics

# Key metrics:
# - requests_total: Total requests
# - policies_created_total: Policies created
# - workflows_executed_total: Workflows executed
# - error_rate: Error rate percentage
```

### Log Files

```bash
# View service logs
docker logs mock-policy-service

# Or if running locally
tail -f logs/combined.log
tail -f logs/error.log
```

### Health Monitoring

```bash
# Automated health checks
while true; do
  grpcurl -plaintext localhost:50051 policy.v1.PolicyService/HealthCheck
  sleep 30
done
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Find process using port 50051
   lsof -i :50051
   
   # Kill the process
   kill $(lsof -t -i:50051)
   ```

2. **Proto File Issues**
   ```bash
   # Validate proto file
   protoc --proto_path=proto --descriptor_set_out=/dev/null proto/policy_service.proto
   ```

3. **Docker Build Issues**
   ```bash
   # Clean Docker build cache
   docker builder prune -f
   
   # Rebuild without cache
   docker build --no-cache -t mock-policy-service .
   ```

4. **gRPC Connection Issues**
   ```bash
   # Test connection
   grpcurl -plaintext localhost:50051 list
   
   # Check if service is listening
   netstat -tlnp | grep 50051
   ```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug node src/server.js

# Or with Docker
docker run -e LOG_LEVEL=debug -p 50051:50051 mock-policy-service
```

## Next Steps

- Review the [API Reference](API_REFERENCE.md) for detailed method documentation
- Explore the [Examples](../examples/) directory for integration samples
- Check the [Contributing Guide](CONTRIBUTING.md) if you want to extend the service
- Monitor service health with the built-in metrics and health checks

## Support

- **Issues**: Report bugs and feature requests on the project repository
- **Documentation**: Check the `docs/` directory for additional information
- **Examples**: See `examples/` for integration patterns
- **Tests**: Run the test suite to understand expected behavior

---

**Happy Testing! 🚀**

The Mock gRPC Policy Service v1.1 is designed to provide a complete testing environment for policy management, workflow orchestration, and TRPO reinforcement learning capabilities.