/**
 * Test Utilities for UI Tests
 * Provides common testing utilities and patterns for UI components
 */

// Test assertion helpers
export const assert = (condition, message) => {
    if (!condition) throw new Error(message || 'Assertion failed');
};

export const assertTrue = (value, message = 'Expected value to be truthy') => {
    assert(value, message);
};

export const assertFalse = (value, message = 'Expected value to be falsy') => {
    assert(!value, message);
};

export const assertEquals = (actual, expected, message = `Expected ${actual} to equal ${expected}`) => {
    assert(actual === expected, message);
};

export const assertDeepEqual = (actual, expected, message = 'Objects are not deeply equal') => {
    const areEqual = (a, b) => {
        if (a === b) return true;
        if (a == null || b == null) return a === b;
        if (typeof a !== 'object' || typeof b !== 'object') return a === b;
        if (Array.isArray(a) !== Array.isArray(b)) return false;

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;

        return keysA.every(key => areEqual(a[key], b[key]));
    };
    assert(areEqual(actual, expected), message);
};

export const assertThrows = (fn, expectedError, message = 'Function did not throw an error') => {
    let error = null;
    try {
        fn();
    } catch (e) {
        error = e;
    }
    assert(error !== null, message);
    if (expectedError && typeof expectedError === 'string') {
        assert(error.message.includes(expectedError), `Error message does not contain "${expectedError}"`);
    }
};

// Async test helpers
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Mock data generation
export const generateMockNode = (overrides = {}) => {
    const id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    return {
        id,
        label: `Node ${id}`,
        type: 'concept',
        x: Math.random() * 100,
        y: Math.random() * 100,
        ...overrides
    };
};

export const generateMockEdge = (nodeIds = [], overrides = {}) => {
    const id = `edge-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const source = nodeIds.length > 0 ? nodeIds[Math.floor(Math.random() * nodeIds.length)] : `node-${Math.random() * 100}`;
    const target = nodeIds.length > 0 ? nodeIds[Math.floor(Math.random() * nodeIds.length)] : `node-${Math.random() * 100}`;
    return {
        id,
        source,
        target,
        type: 'relation',
        ...overrides
    };
};

export const generateMockSnapshot = (nodeCount = 5, edgeCount = 3, overrides = {}) => {
    const nodes = Array.from({ length: nodeCount }, () => generateMockNode());
    const nodeIds = nodes.map(n => n.id);
    const edges = Array.from({ length: edgeCount }, () => generateMockEdge(nodeIds));

    return {
        nodes,
        edges,
        ...overrides
    };
};

// Mock WebSocket for Node.js environment
class MockWebSocketClass {
    constructor(url) {
        this.url = url;
        this.readyState = 0; // CONNECTING
        this.OPEN = 1;
        this.CONNECTING = 0;
        this.CLOSED = 3;

        // Transition to open state after a short delay
        setTimeout(() => {
            if (this.readyState !== this.CLOSED) {
                this.readyState = this.OPEN;
                this.onopen?.({ type: 'open' });
            }
        }, 10);
    }

    send(data) {
        if (this.readyState !== this.OPEN) {
            throw new Error('WebSocket is not open');
        }
        this.onsend?.(data);
    }

    close(code = 1000, reason = '') {
        if (this.readyState !== this.CLOSED) {
            this.readyState = this.CLOSED;
            this.onclose?.({ code, reason, type: 'close' });
        }
    }

    // Method to simulate receiving a message
    simulateMessage(data) {
        this.onmessage?.({ data, type: 'message' });
    }
}

// Override global WebSocket for testing if in Node.js environment
if (typeof window === 'undefined') {
    global.WebSocket = MockWebSocketClass;
} else {
    window.MockWebSocket = MockWebSocketClass;
}

export const MockWebSocket = typeof window !== 'undefined' ? window.MockWebSocket : global.WebSocket;

// Test runner helpers
export const runTest = (description, testFn) => {
    const PASSED = '✅';
    const FAILED = '❌';
    
    try {
        testFn();
        console.log(`${PASSED} PASS: ${description}`);
        return true;
    } catch (error) {
        console.error(`${FAILED} FAIL: ${description}`);
        console.error(`   Error: ${error.message}`);
        return false;
    }
};

export const runAsyncTest = async (description, testFn) => {
    const PASSED = '✅';
    const FAILED = '❌';
    
    try {
        await testFn();
        console.log(`${PASSED} PASS: ${description}`);
        return true;
    } catch (error) {
        console.error(`${FAILED} FAIL: ${description}`);
        console.error(`   Error: ${error.message}`);
        return false;
    }
};

// Test suite runner
export const runTestSuite = (suiteName, tests) => {
    console.log(`\nRunning test suite: ${suiteName}\n`);

    const results = tests.map(test =>
        test.async
            ? runAsyncTest(test.desc, test.fn)
            : runTest(test.desc, test.fn)
    );

    const passed = results.filter(Boolean).length;
    const total = tests.length;
    const failed = total - passed;

    console.log(`\nTest suite completed: ${passed}/${total} passed`);

    if (passed === total) {
        console.log('🎉 All tests in suite passed!');
    } else {
        console.log(`⚠️  ${failed} tests failed in suite`);
        if (process && process.exitCode === undefined) {
            process.exitCode = failed > 0 ? 1 : 0;
        }
    }

    return { passed, total, failed };
};

// Setup and teardown helpers
export const setupTestEnvironment = () => {
    // Reset any global state for tests
    if (typeof window !== 'undefined') {
        // Browser environment setup
        window.testState = {};
    } else {
        // Node.js environment setup
        global.testState = {};
    }
};

export const teardownTestEnvironment = () => {
    // Cleanup any global state after tests
    if (typeof window !== 'undefined') {
        window.testState = null;
    } else {
        global.testState = null;
    }
};