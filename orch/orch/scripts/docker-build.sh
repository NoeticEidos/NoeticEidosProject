#!/bin/bash

# Docker build and deployment script for Mock gRPC Policy Service

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
IMAGE_NAME="mock-policy-service"
VERSION=${VERSION:-"v1.1.0"}
REGISTRY=${REGISTRY:-""}

echo -e "${BLUE}🐳 Docker Build Script for Mock Policy Service v1.1${NC}"
echo -e "${BLUE}================================================${NC}"

# Function to build Docker image
build_image() {
    local target=${1:-"production"}
    local tag="${IMAGE_NAME}:${VERSION}-${target}"
    
    echo -e "${YELLOW}🔨 Building Docker image: ${tag}${NC}"
    
    docker build \
        --target ${target} \
        --tag ${tag} \
        --tag ${IMAGE_NAME}:${target} \
        --tag ${IMAGE_NAME}:latest \
        --build-arg VERSION=${VERSION} \
        --build-arg BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
        .
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Successfully built ${tag}${NC}"
        
        # Show image info
        echo -e "${BLUE}📊 Image Information:${NC}"
        docker images ${IMAGE_NAME} --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
    else
        echo -e "${RED}❌ Failed to build ${tag}${NC}"
        exit 1
    fi
}

# Function to run image
run_image() {
    local target=${1:-"production"}
    local port=${2:-"50051"}
    local tag="${IMAGE_NAME}:${target}"
    
    echo -e "${YELLOW}🚀 Running Docker container: ${tag}${NC}"
    
    # Stop existing container if running
    docker stop mock-policy-service-${target} 2>/dev/null || true
    docker rm mock-policy-service-${target} 2>/dev/null || true
    
    # Run new container
    docker run -d \
        --name mock-policy-service-${target} \
        --port ${port}:50051 \
        --restart unless-stopped \
        --health-cmd="node -e 'console.log(\"Health check\")' || exit 1" \
        --health-interval=30s \
        --health-timeout=10s \
        --health-retries=3 \
        ${tag}
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Container started successfully${NC}"
        echo -e "${BLUE}🌐 Service available at: localhost:${port}${NC}"
        
        # Show container info
        docker ps -f name=mock-policy-service-${target} --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    else
        echo -e "${RED}❌ Failed to start container${NC}"
        exit 1
    fi
}

# Function to test image
test_image() {
    local target=${1:-"production"}
    local tag="${IMAGE_NAME}:${target}"
    
    echo -e "${YELLOW}🧪 Testing Docker image: ${tag}${NC}"
    
    # Run container for testing
    local container_id=$(docker run -d -p 50053:50051 ${tag})
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Test container started${NC}"
        
        # Wait for service to start
        sleep 5
        
        # Run health check
        if command -v grpcurl >/dev/null 2>&1; then
            echo -e "${BLUE}🔍 Running gRPC health check...${NC}"
            grpcurl -plaintext localhost:50053 policy.v1.PolicyService/HealthCheck
        else
            echo -e "${YELLOW}⚠️  grpcurl not found, running node test client...${NC}"
            node scripts/test-client.js --server localhost:50053
        fi
        
        # Cleanup test container
        docker stop ${container_id}
        docker rm ${container_id}
        
        echo -e "${GREEN}✅ Image test completed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to start test container${NC}"
        exit 1
    fi
}

# Function to push to registry
push_image() {
    local target=${1:-"production"}
    local tag="${IMAGE_NAME}:${VERSION}-${target}"
    
    if [ -z "$REGISTRY" ]; then
        echo -e "${YELLOW}⚠️  No registry specified, skipping push${NC}"
        return
    fi
    
    local remote_tag="${REGISTRY}/${tag}"
    
    echo -e "${YELLOW}📤 Pushing to registry: ${remote_tag}${NC}"
    
    docker tag ${tag} ${remote_tag}
    docker push ${remote_tag}
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Successfully pushed ${remote_tag}${NC}"
    else
        echo -e "${RED}❌ Failed to push ${remote_tag}${NC}"
        exit 1
    fi
}

# Function to cleanup images
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up Docker images...${NC}"
    
    # Remove dangling images
    docker image prune -f
    
    # Remove old versions (keep last 3)
    docker images ${IMAGE_NAME} --format "{{.ID}} {{.Tag}}" | \
    grep -v latest | \
    tail -n +4 | \
    cut -d' ' -f1 | \
    xargs -r docker rmi
    
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Function to show help
show_help() {
    echo "Usage: ./docker-build.sh [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  build [production|development]  Build Docker image"
    echo "  run [production|development] [port]  Run Docker container"
    echo "  test [production|development]   Test Docker image"
    echo "  push [production|development]   Push to registry"
    echo "  cleanup                         Clean up old images"
    echo "  all                            Build, test, and run"
    echo "  help                           Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  VERSION     Image version (default: v1.1.0)"
    echo "  REGISTRY    Docker registry URL"
    echo ""
    echo "Examples:"
    echo "  ./docker-build.sh build production"
    echo "  ./docker-build.sh run development 50052"
    echo "  REGISTRY=myregistry.com ./docker-build.sh push production"
    echo ""
}

# Main script logic
main() {
    local command=${1:-"build"}
    local target=${2:-"production"}
    local port=${3:-"50051"}
    
    case $command in
        "build")
            build_image $target
            ;;
        "run")
            run_image $target $port
            ;;
        "test")
            test_image $target
            ;;
        "push")
            push_image $target
            ;;
        "cleanup")
            cleanup
            ;;
        "all")
            build_image $target
            test_image $target
            run_image $target $port
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        *)
            echo -e "${RED}❌ Unknown command: $command${NC}"
            show_help
            exit 1
            ;;
    esac
}

# Check if Docker is available
if ! command -v docker >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not installed or not in PATH${NC}"
    exit 1
fi

# Run main function
main "$@"