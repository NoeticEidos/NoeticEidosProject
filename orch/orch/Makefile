# Node Orchestrator Makefile
# This Makefile provides convenient commands for development, testing, and deployment

.PHONY: help install build test clean dev docker-build docker-up docker-down lint format typecheck proto docs migrate seed backup restore

# Default target
help: ## Display this help message
	@echo "Node Orchestrator Development Commands"
	@echo "======================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Installation and Setup
install: ## Install all dependencies
	npm install
	@echo "Dependencies installed successfully!"

install-ci: ## Install dependencies for CI (clean install)
	npm ci
	@echo "Dependencies installed for CI!"

# Development
dev: ## Start development server with hot reload
	docker-compose up -d redis mongodb jaeger
	npm run dev

dev-full: ## Start full development environment with all services
	docker-compose up

dev-services: ## Start only development services (Redis, MongoDB, Jaeger)
	docker-compose up -d redis mongodb jaeger prometheus grafana

# Building
build: ## Build the TypeScript project
	npm run clean
	npm run build
	@echo "Build completed successfully!"

build-watch: ## Build with watch mode
	npm run build:watch

# Testing
test: ## Run all tests
	npm test

test-unit: ## Run unit tests only
	npm run test:unit

test-integration: ## Run integration tests only
	npm run test:integration

test-e2e: ## Run end-to-end tests
	npm run test:e2e

test-watch: ## Run tests in watch mode
	npm run test:watch

test-coverage: ## Run tests with coverage report
	npm run test:coverage
	@echo "Coverage report generated in ./coverage/"

# Code Quality
lint: ## Run ESLint
	npm run lint

lint-fix: ## Run ESLint with auto-fix
	npm run lint:fix

format: ## Format code with Prettier
	npx prettier --write "src/**/*.ts" "tests/**/*.ts"

typecheck: ## Run TypeScript type checking
	npm run typecheck

quality: lint typecheck test ## Run all quality checks

# Docker Operations
docker-build: ## Build Docker images
	docker-compose build

docker-up: ## Start all Docker services
	docker-compose up -d

docker-down: ## Stop all Docker services
	docker-compose down

docker-logs: ## View Docker logs
	docker-compose logs -f

docker-restart: ## Restart all Docker services
	docker-compose restart

docker-clean: ## Clean up Docker resources
	docker-compose down -v
	docker system prune -f

# Database Operations
migrate: ## Run database migrations
	npm run migrate

seed: ## Seed database with sample data
	npm run seed

backup: ## Backup MongoDB database
	@mkdir -p backups
	docker-compose exec mongodb mongodump --host localhost --port 27017 --db orchestrator --out /data/backup
	docker cp $$(docker-compose ps -q mongodb):/data/backup ./backups/mongodb-$$(date +%Y%m%d-%H%M%S)
	@echo "Database backup completed!"

restore: ## Restore MongoDB database (use BACKUP_FILE=path/to/backup)
	@if [ -z "$(BACKUP_FILE)" ]; then echo "Please specify BACKUP_FILE=path/to/backup"; exit 1; fi
	docker cp $(BACKUP_FILE) $$(docker-compose ps -q mongodb):/data/restore
	docker-compose exec mongodb mongorestore --host localhost --port 27017 --db orchestrator /data/restore
	@echo "Database restore completed!"

# Protocol Buffers
proto: ## Generate gRPC code from proto files
	@mkdir -p src/generated
	npm run proto:generate
	@echo "Protocol buffer files generated!"

# Documentation
docs: ## Generate API documentation
	npm run docs:generate
	@echo "Documentation generated in ./docs/api/"

# Cleaning
clean: ## Clean build artifacts
	npm run clean
	rm -rf coverage
	rm -rf docs/api
	@echo "Clean completed!"

clean-all: clean docker-clean ## Clean everything including Docker resources

# Production
prod-build: ## Build for production
	NODE_ENV=production npm run build

prod-test: ## Run tests in production mode
	NODE_ENV=production npm test

# Monitoring and Logs
logs: ## View application logs
	docker-compose logs -f node-orchestrator

logs-all: ## View all service logs
	docker-compose logs -f

monitor: ## Open monitoring dashboards
	@echo "Opening monitoring dashboards..."
	@echo "Grafana: http://localhost:3001 (admin/admin123)"
	@echo "Jaeger: http://localhost:16686"
	@echo "Prometheus: http://localhost:9090"

# Performance
benchmark: ## Run performance benchmarks
	@echo "Running performance benchmarks..."
	NODE_ENV=test npm run test -- --testNamePattern="benchmark"

profile: ## Profile application performance
	@echo "Starting application with profiling..."
	NODE_ENV=development node --inspect=0.0.0.0:9229 dist/index.js

# Security
audit: ## Run security audit
	npm audit
	npm audit fix

security-scan: ## Run security scan with additional tools
	npm audit
	@echo "Running additional security checks..."
	# Add additional security scanning tools here

# Git Hooks
precommit: ## Run pre-commit checks
	npm run precommit

setup-hooks: ## Setup Git hooks
	npm run prepare

# Health Checks
health: ## Check service health
	@echo "Checking service health..."
	curl -f http://localhost:3000/health || exit 1
	@echo "All services are healthy!"

# Environment Management
env-example: ## Create .env.example file
	@echo "Creating .env.example..."
	@echo "# Copy this file to .env and update the values" > .env.example
	@echo "" >> .env.example
	@echo "# Application Configuration" >> .env.example
	@echo "NODE_ENV=development" >> .env.example
	@echo "PORT=3000" >> .env.example
	@echo "GRPC_PORT=50051" >> .env.example
	@echo "" >> .env.example
	@echo "# Database Configuration" >> .env.example
	@echo "MONGODB_URL=mongodb://admin:admin123@localhost:27017/orchestrator?authSource=admin" >> .env.example
	@echo "MONGODB_ROOT_USER=admin" >> .env.example
	@echo "MONGODB_ROOT_PASSWORD=admin123" >> .env.example
	@echo "MONGODB_DATABASE=orchestrator" >> .env.example
	@echo "" >> .env.example
	@echo "# Redis Configuration" >> .env.example
	@echo "REDIS_URL=redis://localhost:6379" >> .env.example
	@echo "REDIS_PORT=6379" >> .env.example
	@echo "" >> .env.example
	@echo "# Authentication" >> .env.example
	@echo "JWT_SECRET=your-super-secret-jwt-key-change-this-in-production" >> .env.example
	@echo "JWT_EXPIRES_IN=24h" >> .env.example
	@echo "" >> .env.example
	@echo "# Monitoring" >> .env.example
	@echo "JAEGER_ENDPOINT=http://localhost:14268/api/traces" >> .env.example
	@echo "GRAFANA_PASSWORD=admin123" >> .env.example
	@echo "" >> .env.example
	@echo "# AI Services" >> .env.example
	@echo "TESSERACT_LANG=eng" >> .env.example
	@echo "OPENAI_API_KEY=your-openai-api-key" >> .env.example
	@echo "" >> .env.example
	@echo "# Logging" >> .env.example
	@echo "LOG_LEVEL=info" >> .env.example
	@echo "LOG_FORMAT=json" >> .env.example
	@echo "" >> .env.example
	@echo ".env.example created successfully!"

# Quick Setup
setup: install env-example setup-hooks ## Complete project setup
	@echo "Project setup completed! Run 'make dev' to start development."

# One-command Development Start
start: dev-services ## Quick start development environment
	@echo "Development environment started!"
	@echo "Application will be available at http://localhost:3000"
	@echo "Run 'make monitor' to open monitoring dashboards"

# CI/CD
ci: install-ci typecheck lint test ## Run CI pipeline
	@echo "CI pipeline completed successfully!"

cd: prod-build prod-test ## Run CD pipeline
	@echo "CD pipeline completed successfully!"