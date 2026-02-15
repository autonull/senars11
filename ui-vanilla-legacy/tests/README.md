# SeNARS End-to-End Integration Tests

This directory contains comprehensive end-to-end integration tests for the SeNARS UI system, designed to ensure complete functionality without requiring manual verification.

## Test Structure

The test suite is organized to follow these key principles:

- **Direct object testing**: Tests objects directly, without resorting to Mocks
- **Realistic UI/UX patterns**: Covers realistic user interaction patterns  
- **Visible outcomes**: Ensures tangible system reactions are observable
- **Robust error handling**: Handles errors with visible, detailed explanations
- **NAR reasoning modes**: Tests both step and continuous execution modes
- **Self-contained tests**: Each test cleans up all resources completely
- **Buffering/batching**: Tests mechanisms with small capacities for quick tests
- **Parameterized testing**: Extends and abstracts tests to avoid redundant code

## Test Files

### Core Test Components
- `test-config.js` - Configuration definitions for different test scenarios
- `robust-test-runner.js` - Utility for enhanced resource management and cleanup

### Individual Test Files
- `comprehensive-integration-test.js` - Complete round-trip functionality test
- `extended-integration-test.js` - Extended tests following new requirements
- `test-buffering-batching.js` - Dedicated test for buffering/batching with small capacities
- `test-roundtrip-io.js` - Round-trip I/O flow verification
- `test-web-integration.js` - Web UI specific integration tests
- `check-web-setup.js` - Environment verification
- `validate-with-real-nar.js` - Real NAR backend validation

### Test Suites
- `parameterized-test-suite.js` - Runs tests with multiple configurations
- `test-suite.js` - Original modular test suite
- `run-all-tests.js` - Script to run all tests

## Running Tests

### Run All Tests
```bash
node tests/run-all-tests.js
```

### Run Individual Tests
```bash
# Basic integration test
node tests/comprehensive-integration-test.js

# Extended integration test with normal config
node tests/extended-integration-test.js normal

# Extended integration test with small buffer config  
node tests/extended-integration-test.js small_buffer

# Buffering/batching test with small capacities
node tests/test-buffering-batching.js

# Parameterized test suite (runs multiple configurations)
node tests/parameterized-test-suite.js
```

### Web-Specific Tests
```bash
# Comprehensive web tests
node tests/comprehensive-web-test.js comprehensive

# Simple web test
node tests/comprehensive-web-test.js simple
```

## Test Configurations

The tests use different configurations to validate system behavior:

- **Normal**: Standard capacity settings for typical operations
- **Small Buffer**: Reduced capacities (5 items) to test buffering/batching mechanisms
- **Performance**: High capacities for performance validation

## Requirements Coverage

This test suite addresses all specified requirements:

✅ **Direct object testing** - All tests use real NAR instances, not mocks
✅ **Realistic UI/UX patterns** - Tests simulate actual user interactions  
✅ **Visible outcomes** - All tests verify tangible system reactions
✅ **Robust error handling** - Comprehensive error detection and reporting
✅ **NAR reasoning modes** - Both step and continuous execution modes tested
✅ **Self-contained tests** - Each test manages its own resources and cleanup
✅ **Small capacity testing** - Dedicated tests for buffering/batching mechanisms
✅ **Parameterized tests** - Configuration-based testing to avoid redundancy
✅ **Non-fragile tests** - Tests are resilient to UI changes during development

## Dependencies

Make sure you have the necessary dependencies installed:

```bash
# Install project dependencies
npm install

# Install UI dependencies (if not already done)
cd ui && npm install && cd ..
```

## Note for CI/CD

For continuous integration environments, you may want to run tests in headless mode by setting environment variables or using the CI configuration in the test config.