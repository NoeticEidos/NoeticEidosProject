#!/bin/bash

# Comprehensive Test Suite Runner
# Executes all validation tests and generates reports

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Comprehensive Validation Test Suite${NC}"
echo "=================================================="

# Create directories
echo -e "${YELLOW}📁 Setting up test environment...${NC}"
mkdir -p test-results
mkdir -p coverage
mkdir -p reports

# Set environment variables
export NODE_ENV=test
export LOG_LEVEL=error
export JEST_COVERAGE=true

# Function to run a test suite
run_test_suite() {
    local suite_name=$1
    local test_pattern=$2
    local description=$3
    
    echo -e "\n${BLUE}🧪 Running $suite_name Tests${NC}"
    echo "Description: $description"
    echo "Pattern: $test_pattern"
    echo "------------------------------------------"
    
    if npm test -- --testPathPattern="$test_pattern" --verbose --coverage=false; then
        echo -e "${GREEN}✅ $suite_name tests PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ $suite_name tests FAILED${NC}"
        return 1
    fi
}

# Function to run demo scripts
run_demo() {
    local demo_name=$1
    local demo_script=$2
    local description=$3
    
    echo -e "\n${BLUE}🎭 Running $demo_name Demo${NC}"
    echo "Description: $description"
    echo "Script: $demo_script"
    echo "----------------------------------"
    
    if timeout 300 node --loader ts-node/esm "$demo_script"; then
        echo -e "${GREEN}✅ $demo_name demo PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ $demo_name demo FAILED${NC}"
        return 1
    fi
}

# Initialize test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
test_results=()

# Track test result
track_result() {
    local test_name=$1
    local result=$2
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ $result -eq 0 ]; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        test_results+=("✅ $test_name")
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        test_results+=("❌ $test_name")
    fi
}

echo -e "\n${YELLOW}Phase 1: Unit Tests${NC}"
echo "=================="

# Schema validation tests
run_test_suite "Schema Validation" "test/unit/schema-validation.test.ts" "Tests for JSON schema validation system"
track_result "Schema Validation Unit Tests" $?

# Safety systems tests
run_test_suite "Safety Systems" "test/unit/safety-systems.test.ts" "Tests for budget, depth, and capability enforcement"
track_result "Safety Systems Unit Tests" $?

# Tool execution tests
run_test_suite "Tool Execution" "test/unit/tool-execution.test.ts" "Tests for OCR, NER, Route tools and gRPC communication"
track_result "Tool Execution Unit Tests" $?

echo -e "\n${YELLOW}Phase 2: Integration Tests${NC}"
echo "=========================="

# Workflow execution tests
run_test_suite "Workflow Execution" "test/integration/workflow-execution.test.ts" "End-to-end workflow processing tests"
track_result "Workflow Execution Integration Tests" $?

# Performance tests
run_test_suite "Performance & Load" "test/performance/load-testing.test.ts" "Performance and load testing scenarios"
track_result "Performance & Load Tests" $?

echo -e "\n${YELLOW}Phase 3: Validation Scripts${NC}"
echo "============================"

# Automated validation script
if [ -f "scripts/validation/automated-validation.ts" ]; then
    run_demo "Automated Validation" "scripts/validation/automated-validation.ts" "Comprehensive automated validation suite"
    track_result "Automated Validation Script" $?
else
    echo -e "${YELLOW}⚠️  Automated validation script not found, skipping...${NC}"
fi

echo -e "\n${YELLOW}Phase 4: Safety Demonstrations${NC}"
echo "==============================="

# Budget enforcement demo
if [ -f "deliverables/safety-demos/budget-enforcement-demo.ts" ]; then
    run_demo "Budget Enforcement" "deliverables/safety-demos/budget-enforcement-demo.ts" "Budget tracking and enforcement demonstration"
    track_result "Budget Enforcement Demo" $?
else
    echo -e "${YELLOW}⚠️  Budget enforcement demo not found, skipping...${NC}"
fi

# Schema validation demo
if [ -f "deliverables/safety-demos/schema-validation-demo.ts" ]; then
    run_demo "Schema Validation" "deliverables/safety-demos/schema-validation-demo.ts" "Comprehensive schema validation demonstration"
    track_result "Schema Validation Demo" $?
else
    echo -e "${YELLOW}⚠️  Schema validation demo not found, skipping...${NC}"
fi

# Workflow safety demo
if [ -f "deliverables/safety-demos/workflow-safety-demo.ts" ]; then
    run_demo "Workflow Safety" "deliverables/safety-demos/workflow-safety-demo.ts" "End-to-end workflow safety demonstration"
    track_result "Workflow Safety Demo" $?
else
    echo -e "${YELLOW}⚠️  Workflow safety demo not found, skipping...${NC}"
fi

echo -e "\n${YELLOW}Phase 5: Coverage Report${NC}"
echo "========================"

echo "Generating comprehensive coverage report..."
if npm test -- --coverage --coverageReporters=text-summary --coverageReporters=html --coverageReporters=lcov --passWithNoTests; then
    echo -e "${GREEN}✅ Coverage report generated${NC}"
    
    # Check if coverage meets thresholds
    if [ -f "coverage/coverage-summary.json" ]; then
        echo "Coverage summary:"
        cat coverage/coverage-summary.json | jq '.total'
    fi
else
    echo -e "${RED}❌ Coverage report generation failed${NC}"
fi

echo -e "\n${YELLOW}Phase 6: Validation of Deliverables${NC}"
echo "==================================="

# Check trajectory samples
echo "Validating trajectory samples..."
trajectory_count=0
for file in deliverables/trajectory-samples/*.json; do
    if [ -f "$file" ]; then
        if jq empty "$file" 2>/dev/null; then
            echo -e "  ${GREEN}✅ $(basename $file) - Valid JSON${NC}"
            trajectory_count=$((trajectory_count + 1))
        else
            echo -e "  ${RED}❌ $(basename $file) - Invalid JSON${NC}"
        fi
    fi
done

if [ $trajectory_count -ge 4 ]; then
    echo -e "${GREEN}✅ Trajectory samples validation passed (${trajectory_count} files)${NC}"
    track_result "Trajectory Samples" 0
else
    echo -e "${RED}❌ Insufficient trajectory samples (found ${trajectory_count}, expected 4)${NC}"
    track_result "Trajectory Samples" 1
fi

# Check safety demo scripts
echo "\nValidating safety demo scripts..."
demo_count=0
for file in deliverables/safety-demos/*.ts; do
    if [ -f "$file" ]; then
        if npx tsc --noEmit "$file"; then
            echo -e "  ${GREEN}✅ $(basename $file) - TypeScript compilation passed${NC}"
            demo_count=$((demo_count + 1))
        else
            echo -e "  ${RED}❌ $(basename $file) - TypeScript compilation failed${NC}"
        fi
    fi
done

if [ $demo_count -ge 3 ]; then
    echo -e "${GREEN}✅ Safety demo scripts validation passed (${demo_count} files)${NC}"
    track_result "Safety Demo Scripts" 0
else
    echo -e "${RED}❌ Insufficient safety demo scripts (found ${demo_count}, expected 3)${NC}"
    track_result "Safety Demo Scripts" 1
fi

echo -e "\n${YELLOW}Phase 7: Report Generation${NC}"
echo "=========================="

# Generate final test report
report_file="reports/validation-report-$(date +%Y%m%d-%H%M%S).json"
echo "Generating final report: $report_file"

cat > "$report_file" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "testSuite": "Comprehensive Validation Framework",
  "summary": {
    "totalTests": $TOTAL_TESTS,
    "passedTests": $PASSED_TESTS,
    "failedTests": $FAILED_TESTS,
    "successRate": $(awk "BEGIN {printf \"%.2f\", $PASSED_TESTS/$TOTAL_TESTS*100}")
  },
  "results": [
EOF

# Add test results to report
for ((i=0; i<${#test_results[@]}; i++)); do
    result="${test_results[i]}"
    if [[ $result == *"✅"* ]]; then
        status="passed"
    else
        status="failed"
    fi
    name=$(echo "$result" | sed 's/^[✅❌] //')
    
    echo "    {\"name\": \"$name\", \"status\": \"$status\"}" >> "$report_file"
    if [ $i -lt $((${#test_results[@]} - 1)) ]; then
        echo "," >> "$report_file"
    fi
done

cat >> "$report_file" << EOF
  ],
  "environment": {
    "nodeVersion": "$(node --version)",
    "npmVersion": "$(npm --version)",
    "platform": "$(uname -s)",
    "architecture": "$(uname -m)"
  },
  "coverage": {
    "reportAvailable": $([ -f "coverage/lcov.info" ] && echo "true" || echo "false"),
    "htmlReportPath": "coverage/lcov-report/index.html"
  }
}
EOF

echo -e "${GREEN}✅ Final report generated: $report_file${NC}"

# Display final results
echo -e "\n${BLUE}📊 FINAL RESULTS${NC}"
echo "================"
echo -e "Total Tests: ${TOTAL_TESTS}"
echo -e "${GREEN}Passed: ${PASSED_TESTS}${NC}"
echo -e "${RED}Failed: ${FAILED_TESTS}${NC}"
echo -e "Success Rate: $(awk "BEGIN {printf \"%.1f%%\", $PASSED_TESTS/$TOTAL_TESTS*100}")"

echo -e "\n${YELLOW}Test Results Summary:${NC}"
for result in "${test_results[@]}"; do
    echo "  $result"
done

# Check if coverage report exists
if [ -f "coverage/lcov-report/index.html" ]; then
    echo -e "\n${GREEN}📈 Coverage report available at: coverage/lcov-report/index.html${NC}"
fi

echo -e "\n${BLUE}📋 Available Reports:${NC}"
echo "  - Test Results: $report_file"
echo "  - Coverage Report: coverage/lcov-report/index.html"
echo "  - JUnit XML: test-results/junit.xml (if available)"
echo "  - HTML Test Report: test-results/test-report.html (if available)"

# Exit with appropriate code
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed! Validation framework is working correctly.${NC}"
    exit 0
else
    echo -e "\n${RED}💥 Some tests failed. Please review the results and fix issues.${NC}"
    exit 1
fi
