#!/bin/bash

# Mock gRPC Policy Service v1.1 - Startup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVICE_NAME="Mock Policy Service v1.1"
DEFAULT_PORT=50051
NODE_ENV=${NODE_ENV:-development}

echo -e "${BLUE}🚀 Starting $SERVICE_NAME${NC}"
echo -e "${BLUE}================================${NC}"

# Function to check if port is available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}❌ Port $port is already in use${NC}"
        echo -e "${YELLOW}💡 Try: kill \$(lsof -t -i:$port)${NC}"
        return 1
    fi
    return 0
}

# Function to install dependencies
install_deps() {
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    cd src
    if [ ! -d "node_modules" ]; then
        npm install
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Dependencies installed successfully${NC}"
        else
            echo -e "${RED}❌ Failed to install dependencies${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}✅ Dependencies already installed${NC}"
    fi
    cd ..
}

# Function to start the service
start_service() {
    local mode=$1
    
    echo -e "${YELLOW}🔧 Environment: $NODE_ENV${NC}"
    echo -e "${YELLOW}🌐 Starting service on port $DEFAULT_PORT...${NC}"
    
    cd src
    
    case $mode in
        "dev")
            if command -v nodemon >/dev/null 2>&1; then
                echo -e "${BLUE}🔄 Starting in development mode with nodemon${NC}"
                nodemon server.js
            else
                echo -e "${YELLOW}⚠️  nodemon not found, starting with node${NC}"
                node server.js
            fi
            ;;
        "prod")
            echo -e "${BLUE}🏭 Starting in production mode${NC}"
            NODE_ENV=production node server.js
            ;;
        *)
            echo -e "${BLUE}🔧 Starting in default mode${NC}"
            node server.js
            ;;
    esac
}

# Function to show service information
show_info() {
    echo -e "${BLUE}📋 Service Information:${NC}"
    echo -e "   Name: $SERVICE_NAME"
    echo -e "   Port: $DEFAULT_PORT"
    echo -e "   Environment: $NODE_ENV"
    echo -e "   Protocol: gRPC"
    echo -e "   Proto Version: v1.1"
    echo ""
    echo -e "${BLUE}🔗 Available Endpoints:${NC}"
    echo -e "   Health Check: grpcurl -plaintext localhost:$DEFAULT_PORT policy.v1.PolicyService/HealthCheck"
    echo -e "   Test Client: node scripts/test-client.js"
    echo ""
    echo -e "${BLUE}🐳 Docker Commands:${NC}"
    echo -e "   Build: docker build -t mock-policy-service ."
    echo -e "   Run: docker run -p $DEFAULT_PORT:$DEFAULT_PORT mock-policy-service"
    echo -e "   Compose: docker-compose up"
    echo ""
}

# Function to run tests
run_tests() {
    echo -e "${YELLOW}🧪 Running tests...${NC}"
    cd src
    if [ -f "package.json" ] && grep -q "\"test\":" package.json; then
        npm test
    else
        echo -e "${YELLOW}⚠️  No test script found${NC}"
        if [ -f "../tests/policy_service.test.js" ]; then
            echo -e "${BLUE}🔄 Running test file directly...${NC}"
            cd ..
            npm test tests/policy_service.test.js
        fi
    fi
}

# Function to validate proto file
validate_proto() {
    echo -e "${YELLOW}🔍 Validating proto file...${NC}"
    if [ -f "proto/policy_service.proto" ]; then
        if command -v protoc >/dev/null 2>&1; then
            protoc --proto_path=proto --descriptor_set_out=/dev/null proto/policy_service.proto
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✅ Proto file is valid${NC}"
            else
                echo -e "${RED}❌ Proto file has syntax errors${NC}"
                return 1
            fi
        else
            echo -e "${YELLOW}⚠️  protoc not found, skipping proto validation${NC}"
        fi
    else
        echo -e "${RED}❌ Proto file not found${NC}"
        return 1
    fi
}

# Function to cleanup
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up...${NC}"
    
    # Kill any existing service processes
    pkill -f "node.*server.js" 2>/dev/null || true
    pkill -f "nodemon.*server.js" 2>/dev/null || true
    
    # Clean generated files
    if [ -d "src/generated" ]; then
        rm -rf src/generated
        echo -e "${GREEN}✅ Cleaned generated files${NC}"
    fi
    
    # Clean logs
    if [ -d "logs" ]; then
        rm -f logs/*.log
        echo -e "${GREEN}✅ Cleaned log files${NC}"
    fi
}

# Function to show help
show_help() {
    echo -e "${BLUE}$SERVICE_NAME - Startup Script${NC}"
    echo ""
    echo "Usage: ./start.sh [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  start [dev|prod]    Start the service (default: dev mode)"
    echo "  test               Run tests"
    echo "  validate           Validate proto files"
    echo "  info               Show service information"
    echo "  cleanup            Clean up processes and files"
    echo "  install            Install dependencies"
    echo "  help               Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  NODE_ENV           Set environment (development/production)"
    echo "  LOG_LEVEL          Set log level (debug/info/warn/error)"
    echo ""
    echo "Examples:"
    echo "  ./start.sh start dev       Start in development mode"
    echo "  ./start.sh start prod      Start in production mode"
    echo "  NODE_ENV=production ./start.sh start"
    echo ""
}

# Main script logic
main() {
    local command=${1:-start}
    local mode=${2:-dev}

    case $command in
        "start")
            validate_proto
            check_port $DEFAULT_PORT
            install_deps
            show_info
            start_service $mode
            ;;
        "test")
            install_deps
            run_tests
            ;;
        "validate")
            validate_proto
            ;;
        "info")
            show_info
            ;;
        "cleanup")
            cleanup
            ;;
        "install")
            install_deps
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

# Handle interrupts
trap cleanup INT TERM

# Run the main function with all arguments
main "$@"