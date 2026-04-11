# Hyperon Test Suite

Integration tests for validating behavioral parity with the official Hyperon (Rust) implementation.

## Overview

This test suite runs official MeTTa test files against our JavaScript implementation and compares results with expected
output from the Hyperon reference implementation.

## Directory Structure

```
tests/integration/metta/hyperon/
├── HyperonTestRunner.js      # Test harness
├── hyperon-suite.test.js     # Jest integration tests
├── GAPS.md                    # Gap analysis and known issues
├── README.md                  # This file
├── basic/                     # Basic syntax and evaluation tests
│   └── syntax.metta
├── stdlib/                    # Standard library tests
│   └── operations.metta
├── types/                     # Type system tests (TODO)
├── superpose/                 # Non-determinism tests (TODO)
├── recursion/                 # Recursion and TCO tests (TODO)
└── edge-cases/                # Edge cases and error handling (TODO)
```

## Test File Format

Test files use the following format:

```metta
; Test: Description of what this test validates
!(expression to evaluate)
; Expected: expected result
```

**Example**:

```metta
; Test: Basic arithmetic addition
!(+ 2 3)
; Expected: 5
```

## Running Tests

### Run all Hyperon tests via Jest:

```bash
npm run test:integration -- tests/integration/metta/hyperon/
```

### Run specific test category:

```bash
npm run test:integration -- tests/integration/metta/hyperon/hyperon-suite.test.js -t "Basic Tests"
```

### Run test harness directly (with verbose output):

```bash
node debug_hyperon_tests.js
```

## Current Status

- **Total Tests**: 28
- **Passing**: 17 (60.71%)
- **Failing**: 11 (39.29%)

See [GAPS.md](./GAPS.md) for detailed analysis of failures and known issues.

## Test Categories

### ✅ Basic Syntax (11/15 passing - 73.33%)

- Arithmetic operations
- Variable binding
- Conditionals
- Comparisons

### ⚠️ Standard Library (6/13 passing - 46.15%)

- Expression operations
- Math functions
- Set operations
- Metatype introspection

### 🔜 Type System (0 tests)

- Type assertions
- Type checking
- Type inference

### 🔜 Non-Determinism (0 tests)

- Superpose operations
- Non-deterministic evaluation

### 🔜 Recursion (0 tests)

- Recursive functions
- Tail-call optimization

### 🔜 Edge Cases (0 tests)

- Error handling
- Boundary conditions

## Adding New Tests

1. Create a `.metta` file in the appropriate category directory
2. Follow the test file format (see above)
3. Run tests to verify
4. Update this README with new test counts

## Known Issues

See [GAPS.md](./GAPS.md) for detailed list of known issues and gaps.

**Summary**:

- Expression reduction semantics differ from Hyperon
- Some operations behave differently on reduced values
- Format differences in list/set representations

## Future Work

1. **Download Official Tests**: Port tests from `hyperon-experimental` and `metta-testsuite` repositories
2. **Expand Coverage**: Add tests for type system, non-determinism, recursion, edge cases
3. **Fix Gaps**: Address known issues to achieve 100% parity
4. **CI Integration**: Run tests on every commit to prevent regressions

## Contributing

When adding new tests:

1. Use descriptive test names
2. Include expected output from Hyperon reference implementation
3. Document any known differences in GAPS.md
4. Update test counts in this README

## References

- [Hyperon Experimental](https://github.com/trueagi-io/hyperon-experimental) - Official Rust implementation
- [MeTTa Test Suite](https://github.com/logicmoo/metta-testsuite) - Cross-implementation test suite
