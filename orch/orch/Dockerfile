# Multi-stage build for Mock gRPC Policy Service v1.1
FROM node:18-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++ protobuf-dev

WORKDIR /app

# Copy package files
COPY src/package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS development
RUN npm ci

# Copy source code
COPY proto/ ./proto/
COPY src/ ./src/

# Generate proto files if needed
RUN mkdir -p src/generated

# Production stage
FROM base AS production

# Copy source and proto files
COPY proto/ ./proto/
COPY src/ ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S grpc -u 1001

# Create log directory
RUN mkdir -p /app/logs && chown -R grpc:nodejs /app/logs

# Switch to non-root user
USER grpc

# Expose gRPC port
EXPOSE 50051

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const grpc = require('@grpc/grpc-js'); const client = new grpc.Client('localhost:50051', grpc.credentials.createInsecure()); process.exit(0);" || exit 1

# Start the server
CMD ["node", "server.js"]