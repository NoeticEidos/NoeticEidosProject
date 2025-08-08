import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  environment: process.env.NODE_ENV || 'development',
  
  // gRPC Policy Service Configuration
  policyService: {
    host: process.env.POLICY_SERVICE_HOST || 'localhost',
    port: parseInt(process.env.POLICY_SERVICE_PORT || '50051'),
    timeout: parseInt(process.env.POLICY_SERVICE_TIMEOUT || '30000'),
    maxRetries: parseInt(process.env.POLICY_SERVICE_MAX_RETRIES || '3'),
    circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5'),
  },
  
  // Budget and Safety Configuration
  budget: {
    defaultTokenBudget: parseFloat(process.env.DEFAULT_TOKEN_BUDGET || '1000'),
    defaultCostBudget: parseFloat(process.env.DEFAULT_COST_BUDGET || '5.0'),
    defaultLatencySloMs: parseInt(process.env.DEFAULT_LATENCY_SLO_MS || '10000'),
    maxDepthCap: parseInt(process.env.MAX_DEPTH_CAP || '20'),
  },
  
  // Reward function weights
  rewards: {
    lambdaCost: parseFloat(process.env.LAMBDA_COST || '0.1'),
    lambdaLatency: parseFloat(process.env.LAMBDA_LATENCY || '0.05'),
    lambdaRisk: parseFloat(process.env.LAMBDA_RISK || '0.2'),
  },
  
  // Tool Configuration
  tools: {
    ocr: {
      engine: process.env.OCR_ENGINE || 'tesseract',
      defaultDPI: parseInt(process.env.OCR_DEFAULT_DPI || '300'),
      timeout: parseInt(process.env.OCR_TIMEOUT || '30000'),
    },
    ner: {
      engine: process.env.NER_ENGINE || 'compromise',
      defaultThreshold: parseFloat(process.env.NER_DEFAULT_THRESHOLD || '0.7'),
    },
    route: {
      engine: process.env.ROUTE_ENGINE || 'rules',
      defaultRiskTolerance: process.env.ROUTE_DEFAULT_RISK || 'medium',
    },
  },
  
  // Monitoring and Observability
  monitoring: {
    tracingEnabled: process.env.TRACING_ENABLED === 'true',
    jaegerEndpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    prometheusPort: parseInt(process.env.PROMETHEUS_PORT || '9464'),
  },
  
  // Storage
  database: {
    url: process.env.MONGODB_URL || 'mongodb://localhost:27017/orchestrator',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  
  // Security
  crypto: {
    defaultSigningAlgorithm: process.env.SIGNING_ALGORITHM || 'HMAC-SHA256',
    hmacSecret: process.env.HMAC_SECRET || 'test-secret-key',
  },
  
  // Development
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
  },
};