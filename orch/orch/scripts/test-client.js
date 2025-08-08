#!/usr/bin/env node

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load the proto file
const PROTO_PATH = path.join(__dirname, '../proto/policy_service.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const policyProto = grpc.loadPackageDefinition(packageDefinition).policy.v1;

async function testPolicyService() {
  const client = new policyProto.PolicyService(
    'localhost:50051',
    grpc.credentials.createInsecure()
  );

  console.log('🚀 Testing Mock Policy Service v1.1\n');

  try {
    // Test 1: Health Check
    console.log('1️⃣  Testing Health Check...');
    const healthResponse = await new Promise((resolve, reject) => {
      client.HealthCheck({}, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
    console.log(`✅ Health Status: ${healthResponse.status}`);
    console.log(`📊 Details:`, healthResponse.details);
    console.log('');

    // Test 2: Create Policy
    console.log('2️⃣  Testing Policy Creation...');
    const createResponse = await new Promise((resolve, reject) => {
      client.CreatePolicy({
        policy: {
          name: 'Test RBAC Policy',
          description: 'Role-based access control for API endpoints',
          type: 'POLICY_TYPE_ACCESS',
          parameters: {
            'default_action': 'deny',
            'log_violations': 'true'
          }
        }
      }, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
    console.log(`✅ Created Policy ID: ${createResponse.policy.id}`);
    console.log(`📝 Policy Name: ${createResponse.policy.name}`);
    console.log('');

    // Test 3: Generate Workflow Plan
    console.log('3️⃣  Testing Workflow Plan Generation...');
    const workflowResponse = await new Promise((resolve, reject) => {
      client.GenerateWorkflowPlan({
        policy_id: createResponse.policy.id,
        complexity: 'WORKFLOW_COMPLEXITY_MODERATE',
        requirements: ['authenticate', 'authorize', 'audit', 'notify']
      }, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
    console.log(`✅ Generated Workflow: ${workflowResponse.plan.name}`);
    console.log(`🔧 Steps: ${workflowResponse.plan.steps.length}`);
    console.log(`⏱️  Estimated Duration: ${workflowResponse.plan.estimated_duration_seconds}s`);
    console.log(`🎯 Confidence: ${(workflowResponse.confidence_score * 100).toFixed(1)}%`);
    console.log('');

    // Test 4: TRPO Evaluation
    console.log('4️⃣  Testing TRPO Surrogate Evaluation...');
    const trajectory = Array.from({ length: 50 }, (_, i) => ({
      state: [Math.sin(i * 0.1), Math.cos(i * 0.1), Math.random()],
      action: [Math.tanh(Math.random() - 0.5)],
      reward: Math.random() > 0.6 ? 1.0 : -0.1,
      value_estimate: Math.random() * 10,
      log_probability: Math.log(Math.random() * 0.8 + 0.1)
    }));

    const trpoResponse = await new Promise((resolve, reject) => {
      client.EvaluateSurrogate({
        policy_id: createResponse.policy.id,
        trajectory,
        return_detailed_metrics: true,
        trpo_params: {
          delta: 0.01,
          gamma: 0.99,
          lambda: 0.95,
          max_kl_samples: 1000,
          cg_damping: 0.1,
          cg_iterations: 10
        }
      }, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    console.log(`✅ TRPO Evaluation Complete`);
    console.log(`📈 Surrogate Loss: ${trpoResponse.surrogate_loss.toFixed(6)}`);
    console.log(`🔄 KL Divergence: ${trpoResponse.kl_divergence.toFixed(6)}`);
    console.log(`🎲 Policy Entropy: ${trpoResponse.policy_entropy.toFixed(4)}`);
    console.log(`📊 Advantage Variance: ${trpoResponse.advantage_variance.toFixed(4)}`);
    
    if (trpoResponse.detailed_metrics) {
      const metrics = trpoResponse.detailed_metrics;
      console.log(`🎯 Advantage Mean: ${metrics.advantage_mean.toFixed(4)}`);
      console.log(`📏 Advantage Std: ${metrics.advantage_std.toFixed(4)}`);
      console.log(`🔍 Explained Variance: ${metrics.explained_variance.toFixed(4)}`);
      console.log(`📐 Gradient Norm: ${metrics.gradient_norm.toFixed(4)}`);
    }
    console.log('');

    // Test 5: Batch Operations
    console.log('5️⃣  Testing Batch Policy Creation...');
    const batchPolicies = [
      { name: 'Security Policy A', type: 'POLICY_TYPE_SECURITY' },
      { name: 'Compliance Policy B', type: 'POLICY_TYPE_COMPLIANCE' },
      { name: 'Workflow Policy C', type: 'POLICY_TYPE_WORKFLOW' }
    ].map(policy => ({ policy }));

    const batchResponse = await new Promise((resolve, reject) => {
      client.BatchCreatePolicies({
        requests: batchPolicies,
        fail_on_first_error: false
      }, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    console.log(`✅ Batch Created: ${batchResponse.responses.length} policies`);
    console.log(`❌ Errors: ${batchResponse.errors.length}`);
    batchResponse.responses.forEach((resp, i) => {
      console.log(`   📋 ${i + 1}. ${resp.policy.name} (${resp.policy.id})`);
    });
    console.log('');

    // Test 6: Signing Keys
    console.log('6️⃣  Testing Signing Keys...');
    const keysResponse = await new Promise((resolve, reject) => {
      client.GetSigningKeys({
        key_type: 'RSA',
        key_size: 2048
      }, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    console.log(`✅ Retrieved ${keysResponse.keys.length} signing key(s)`);
    keysResponse.keys.forEach(key => {
      console.log(`   🔐 Key ID: ${key.id}`);
      console.log(`   🏷️  Type: ${key.type}`);
      console.log(`   ✅ Test Key: ${key.is_test_key}`);
      console.log(`   📅 Created: ${new Date(key.created_at.seconds * 1000).toISOString()}`);
    });
    console.log('');

    // Test 7: Metrics
    console.log('7️⃣  Testing Service Metrics...');
    const metricsResponse = await new Promise((resolve, reject) => {
      client.GetMetrics({
        metric_names: ['requests_total', 'policies_created_total', 'workflows_executed_total']
      }, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    console.log(`✅ Retrieved ${metricsResponse.metrics.length} metrics:`);
    metricsResponse.metrics.forEach(metric => {
      const value = metric.data_points[0]?.value || 0;
      console.log(`   📊 ${metric.name}: ${value} (${metric.type})`);
    });

    console.log('\n🎉 All tests completed successfully!');
    console.log('🔗 Service is ready for integration testing.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.code) {
      console.error(`📋 gRPC Code: ${error.code}`);
    }
    if (error.details) {
      console.error(`📝 Details: ${error.details}`);
    }
  }

  // Close the client connection
  client.close();
}

// CLI interface
function showUsage() {
  console.log(`
Mock gRPC Policy Service v1.1 Test Client

Usage:
  node test-client.js [options]

Options:
  --server <address>  Server address (default: localhost:50051)
  --help             Show this help message

Examples:
  node test-client.js
  node test-client.js --server localhost:50052
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    server: 'localhost:50051'
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--server':
        options.server = args[++i];
        break;
      case '--help':
        showUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        showUsage();
        process.exit(1);
    }
  }

  return options;
}

if (require.main === module) {
  const options = parseArgs();
  
  // Update the client address if specified
  if (options.server !== 'localhost:50051') {
    const client = new policyProto.PolicyService(
      options.server,
      grpc.credentials.createInsecure()
    );
  }
  
  testPolicyService().catch(console.error);
}