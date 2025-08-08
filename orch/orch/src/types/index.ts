/**
 * Core Type Definitions for Node Orchestrator
 * 
 * This file contains the foundational type definitions used throughout
 * the orchestration platform.
 */

// Environment Configuration
export interface EnvironmentConfig {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  GRPC_PORT: number;
  HOST: string;
  API_VERSION: string;
  DEBUG?: boolean;
}

// Database Configuration
export interface DatabaseConfig {
  mongodb: {
    url: string;
    host: string;
    port: number;
    database: string;
    username?: string;
    password?: string;
    connectionPoolSize: number;
    connectionTimeout: number;
  };
}

// Redis Configuration
export interface RedisConfig {
  url: string;
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  connectionTimeout: number;
  commandTimeout: number;
}

// JWT Configuration
export interface JWTConfig {
  secret: string;
  expiresIn: string;
  refreshExpiresIn: string;
  algorithm: string;
}

// Logging Configuration
export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'text';
  filePath?: string;
  maxFiles?: number;
  maxSize?: string;
}

// Application Configuration Interface
export interface AppConfig {
  environment: EnvironmentConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  jwt: JWTConfig;
  logging: LoggingConfig;
  features: {
    grpc: boolean;
    websockets: boolean;
    fileProcessing: boolean;
    aiServices: boolean;
    backgroundJobs: boolean;
    rateLimiting: boolean;
    requestValidation: boolean;
    cors: boolean;
    helmet: boolean;
  };
}

// User Types
export interface User {
  id: string;
  email: string;
  username: string;
  password?: string;
  role: 'admin' | 'user' | 'operator';
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Task Types
export type TaskType = 'ocr' | 'nlp' | 'workflow' | 'custom';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface Task {
  id: string;
  name: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  payload?: Record<string, any>;
  result?: Record<string, any>;
  error?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Workflow Types
export interface WorkflowStep {
  type: string;
  config: Record<string, any>;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  active: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// File Types
export interface FileMetadata {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  metadata?: Record<string, any>;
  processed: boolean;
  uploadedBy: string;
  createdAt: Date;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Health Check Types
export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: 'connected' | 'disconnected' | 'error';
    redis: 'connected' | 'disconnected' | 'error';
    grpc: 'running' | 'stopped' | 'error';
    queue: 'running' | 'stopped' | 'error';
  };
}

// Metrics Types
export interface SystemMetrics {
  cpu: {
    usage: number;
    load: number[];
  };
  memory: {
    used: number;
    free: number;
    total: number;
  };
  uptime: number;
  timestamp: string;
}

export interface ApplicationMetrics {
  requests: {
    total: number;
    rate: number;
    errors: number;
    avgResponseTime: number;
  };
  tasks: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  connections: {
    active: number;
    websockets: number;
    grpc: number;
  };
}

// Error Types
export interface ApplicationError {
  name: string;
  message: string;
  code?: string;
  statusCode?: number;
  stack?: string;
  context?: Record<string, any>;
}

// Queue Types
export interface QueueJob<T = any> {
  id: string;
  type: string;
  data: T;
  priority: number;
  delay?: number;
  attempts?: number;
  backoff?: 'fixed' | 'exponential';
}

export interface QueueOptions {
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  delay?: number;
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
}

// gRPC Types
export interface GrpcServiceDefinition {
  name: string;
  methods: Record<string, any>;
}

// WebSocket Types
export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: string;
}

export interface WebSocketClient {
  id: string;
  userId?: string;
  connected: boolean;
  lastSeen: Date;
}

// Authentication Types
export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface JWTPayload {
  sub: string; // Subject (user ID)
  email: string;
  role: string;
  iat: number; // Issued at
  exp: number; // Expires at
}

// Enhanced Validation Types
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
  code?: string;
  severity?: 'error' | 'warning' | 'info';
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
  data?: any;
}

// Tool-specific Types for v1.1 Protocol
export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    processingTime: number;
    costEstimate: CostEstimate;
    confidence?: number;
  };
}

export interface CostEstimate {
  tokens: number;
  computeUnits: number;
  estimatedDurationMs: number;
  complexity: 'low' | 'medium' | 'high';
}

// OCR Types
export interface OCRResult {
  text: string;
  confidence: number;
  boxes: Array<{
    text: string;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
    confidence: number;
  }>;
  pageRef?: string; // CAS reference
}

export interface CASIntegration {
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
  ttl?: number;
}

// NER Types
export interface NERResult {
  entities: NEREntity[];
  totalEntities: number;
  processingStats: {
    wordsProcessed: number;
    entitiesFound: number;
    averageConfidence: number;
  };
}

export interface NEREntity {
  text: string;
  label: string;
  start: number;
  end: number;
  confidence: number;
  domain?: 'legal' | 'medical' | 'financial' | 'general';
}

export interface DomainConfig {
  legal?: {
    extractCaseNumbers: boolean;
    extractStatutes: boolean;
    extractParties: boolean;
    confidenceBoost: number;
  };
  medical?: {
    extractMedications: boolean;
    extractSymptoms: boolean;
    extractDiagnoses: boolean;
    confidenceBoost: number;
  };
  financial?: {
    extractCurrencies: boolean;
    extractTickers: boolean;
    extractCompanies: boolean;
    confidenceBoost: number;
  };
}

// Route Types
export interface RouteDecision {
  selectedRoute: string;
  confidence: number;
  reasoning: string;
  alternatives: Array<{
    route: string;
    score: number;
    reason: string;
  }>;
  businessConstraints?: {
    priority: number;
    riskTolerance: 'low' | 'medium' | 'high';
    costThreshold?: number;
    latencyThreshold?: number;
  };
}

export interface BusinessConstraints {
  maxCost?: number;
  maxLatency?: number;
  riskTolerance: 'low' | 'medium' | 'high';
  priority: 1 | 2 | 3 | 4 | 5;
  entityPriorities?: Record<string, number>;
  conflictResolution: 'first-match' | 'best-score' | 'priority' | 'hybrid';
}

export interface RulesetConfig {
  name: string;
  version: string;
  rules: RouteRule[];
  fallbackStrategy: 'reject' | 'default' | 'last-match';
  cacheStrategy: 'none' | 'memory' | 'redis' | 'hybrid';
}

export interface RouteRule {
  id: string;
  conditions: {
    path?: string | RegExp;
    method?: string[];
    headers?: Record<string, string | RegExp>;
    query?: Record<string, string | RegExp>;
    body?: any;
    priority?: number;
    weight?: number;
  };
  actions: {
    route: string;
    transform?: any;
    headers?: Record<string, string>;
    timeout?: number;
  };
  metadata?: {
    description?: string;
    tags?: string[];
    owner?: string;
    lastModified?: Date;
  };
}

// Performance Logger Types
export interface PerformanceMetrics {
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  metadata?: Record<string, any>;
  memoryUsage?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
}

export class PerformanceLogger {
  private metrics: PerformanceMetrics;

  constructor(operationName: string) {
    this.metrics = {
      operationName,
      startTime: performance.now(),
      success: false
    };
  }

  end(success: boolean = true, metadata?: Record<string, any>): number {
    this.metrics.endTime = performance.now();
    this.metrics.duration = this.metrics.endTime - this.metrics.startTime;
    this.metrics.success = success;
    this.metrics.metadata = metadata;
    this.metrics.memoryUsage = {
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      external: process.memoryUsage().external
    };

    // Log performance metrics (simplified)
    if (this.metrics.duration > 1000) {
      console.warn(`Slow operation: ${this.metrics.operationName} took ${Math.round(this.metrics.duration)}ms`);
    }

    return this.metrics.duration;
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
}

// Validation Types
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Event Types
export interface ApplicationEvent {
  type: string;
  payload: any;
  timestamp: Date;
  source: string;
}

// Cache Types
export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string;
}

export interface CacheItem<T = any> {
  key: string;
  value: T;
  ttl: number;
  createdAt: Date;
  expiresAt: Date;
}

// Feature Flag Types
export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  conditions?: Record<string, any>;
}

// Audit Log Types
export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

// Rate Limiting Types
export interface RateLimitRule {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
  windowMs: number;
}