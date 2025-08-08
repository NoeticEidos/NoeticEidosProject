#!/bin/bash

# Generate TypeScript client stubs for orchestration proto

set -e

# Create output directory
mkdir -p generated/client

# Install protoc if not available
if ! command -v protoc &> /dev/null; then
    echo "Installing Protocol Buffer Compiler..."
    npm install -g grpc-tools
fi

echo "Generating TypeScript client stubs..."

# Generate JavaScript code
npx grpc_tools_node_protoc \
    --js_out=import_style=commonjs,binary:generated/client \
    --grpc_out=grpc_js:generated/client \
    --plugin=protoc-gen-grpc=`which grpc_tools_node_protoc_plugin` \
    -I . \
    orchestration.proto

# Generate TypeScript definitions
npx grpc_tools_node_protoc \
    --plugin=protoc-gen-ts=`which protoc-gen-ts` \
    --ts_out=grpc_js:generated/client \
    -I . \
    orchestration.proto

echo "✅ TypeScript client stubs generated in proto/generated/client/"