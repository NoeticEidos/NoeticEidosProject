# Multi-stage Dockerfile for Node.js Orchestrator

# ==============================
# Base Image
# ==============================
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# ==============================
# Dependencies Stage
# ==============================
FROM base AS dependencies

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci --only=production --silent
RUN cp -R node_modules prod_node_modules
RUN npm ci --silent

# ==============================
# Build Stage
# ==============================
FROM dependencies AS build

# Copy source code
COPY . .

# Build the application
RUN npm run build

# ==============================
# Development Stage
# ==============================
FROM base AS development

# Install development tools
RUN npm install -g nodemon ts-node

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm ci --silent

# Copy source code
COPY . .

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose ports
EXPOSE 3000 50051 9229

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start development server
CMD ["dumb-init", "npm", "run", "dev"]

# ==============================
# Test Stage
# ==============================
FROM development AS test

# Run tests
RUN npm run test

# ==============================
# Production Stage
# ==============================
FROM base AS production

# Copy production dependencies
COPY --from=dependencies /app/prod_node_modules ./node_modules

# Copy built application
COPY --from=build /app/dist ./dist

# Copy necessary files
COPY package*.json ./
COPY config ./config

# Create necessary directories
RUN mkdir -p logs uploads temp cache && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3000 50051

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start production server
CMD ["dumb-init", "node", "dist/index.js"]

# ==============================
# Metadata
# ==============================
LABEL maintainer="Node Orchestrator Team"
LABEL version="1.0.0"
LABEL description="Node.js Orchestration Platform with AI Capabilities"