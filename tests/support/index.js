/**
 * @file tests/support/index.js
 * @description Main entry point for all test utilities following AGENTS.md guidelines
 *
 * This file provides a clean, organized import interface for all test utilities
 */

// Export the main organized test utilities
export * from './testOrganizer.js';

// For convenience, also provide direct access to the most commonly used utilities
export {
    // Test setup and teardown
    NARTestSetup,
    StandardNARTestSetup,
    createStandardNARTestSetup,
    narTestPatterns,
    narTestScenarios,

    // Assertion utilities
    truthAssertions,
    taskAssertions,
    memoryAssertions,
    flexibleAssertions,

    // Factory functions
    createTask,
    createTerm,
    createTruth,
    createMemory,
    createTestTask,
    createTestMemory,
    createTestTaskBag,

    // Test patterns
    initializationTests,
    equalityTests,
    stringRepresentationTests,
    errorHandlingTests,
    asyncTests,
    parameterizedTests,

    // Comprehensive test suites
    comprehensiveTestSuites,

    // Utilities
    waitForCondition,
    runPerformanceTest,
    testImmutability
} from './testOrganizer.js';

// Export test constants
export {TEST_CONSTANTS, COMMON_TRUTH_VALUES, COMMON_BUDGET_VALUES} from './factories.js';

// Export error handling
export {
    TestEnvironmentError,
    TestSetupError,
    TestTeardownError,
    TestAssertionError,
    default as testErrorHandling
} from './testErrorHandling.js';

// Export flexible utilities
export {
    flexibleTestConfig,
    flexibleTestWrappers,
    parameterizedTestUtils
} from './flexibleTestUtils.js';

// Export categorization utilities
export {
    TestCategorization,
    withTags,
    taggedTest,
    createCategorizedSuite
} from './testCategorization.js';

// Export test suite factory
export {
    TestSuiteFactory,
    createDataModelSuite,
    createTaskRelatedSuite,
    createTruthRelatedSuite,
    createMemoryRelatedSuite,
    createParameterizedSuite,
    createAgileSuite,
    createNARIntegrationSuite,
    createPerformanceSuite
} from './testSuiteFactory.js';

// Default export of the main organizer
export {default} from './testOrganizer.js';