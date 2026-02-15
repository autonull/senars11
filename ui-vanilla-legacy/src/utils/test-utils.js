/**
 * Test Utilities - Common utilities for testing across the application
 */

/**
 * Mock Data Generator
 */
export class MockDataGenerator {
  constructor() {
    this.idCounter = 0;
  }

  /**
   * Generate a mock node object
   * @param {Object} overrides - Properties to override in the generated node
   * @returns {Object} A mock node object
   */
  generateNode(overrides = {}) {
    this.idCounter++;
    return {
      id: `node-${this.idCounter}`,
      label: `Node ${this.idCounter}`,
      type: 'concept',
      x: Math.random() * 100,
      y: Math.random() * 100,
      ...overrides
    };
  }

  /**
   * Generate a mock edge object
   * @param {Object} overrides - Properties to override in the generated edge
   * @returns {Object} A mock edge object
   */
  generateEdge(overrides = {}) {
    this.idCounter++;
    return {
      id: `edge-${this.idCounter}`,
      source: `node-${Math.floor(Math.random() * 100)}`,
      target: `node-${Math.floor(Math.random() * 100)}`,
      type: 'relation',
      ...overrides
    };
  }

  /**
   * Generate a mock graph snapshot
   * @param {number} nodeCount - Number of nodes to generate
   * @param {number} edgeCount - Number of edges to generate
   * @param {Object} overrides - Properties to override in the generated snapshot
   * @returns {Object} A mock graph snapshot {nodes, edges}
   */
  generateGraphSnapshot(nodeCount = 5, edgeCount = 3, overrides = {}) {
    const nodes = [];
    const edges = [];

    for (let i = 0; i < nodeCount; i++) {
      nodes.push(this.generateNode());
    }

    for (let i = 0; i < edgeCount; i++) {
      edges.push(this.generateEdge({
        source: nodes[Math.floor(Math.random() * nodes.length)].id,
        target: nodes[Math.floor(Math.random() * nodes.length)].id
      }));
    }

    return {
      nodes,
      edges,
      ...overrides
    };
  }

  /**
   * Generate mock WebSocket message
   * @param {string} type - Message type
   * @param {Object} payload - Message payload
   * @returns {Object} A mock WebSocket message
   */
  generateWebSocketMessage(type, payload) {
    return JSON.stringify({
      type,
      payload,
      timestamp: Date.now(),
      id: `msg-${++this.idCounter}`
    });
  }
}

/**
 * Test Assertion Utilities
 */
export class TestAssertions {
  static assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  }

  static assertTrue(value, message = 'Expected value to be truthy') {
    this.assert(value, message);
  }

  static assertFalse(value, message = 'Expected value to be falsy') {
    this.assert(!value, message);
  }

  static assertEquals(actual, expected, message = `Expected ${actual} to equal ${expected}`) {
    this.assert(actual === expected, message);
  }

  static assertNotEquals(actual, expected, message = `Expected ${actual} to not equal ${expected}`) {
    this.assert(actual !== expected, message);
  }

  static assertDeepEqual(actual, expected, message = 'Objects are not deeply equal') {
    this.assert(JSON.stringify(actual) === JSON.stringify(expected), message);
  }

  static assertArrayEquals(actual, expected, message = 'Arrays are not equal') {
    this.assert(
      Array.isArray(actual) && Array.isArray(expected) && 
      actual.length === expected.length && 
      actual.every((val, i) => val === expected[i]),
      message
    );
  }

  static assertInstanceOf(obj, constructor, message = `Object is not instance of ${constructor.name}`) {
    this.assert(obj instanceof constructor, message);
  }

  static assertType(value, type, message = `Value is not of type ${type}`) {
    this.assert(typeof value === type, message);
  }

  static assertThrows(fn, expectedError, message = 'Function did not throw an error') {
    let error = null;
    try {
      fn();
    } catch (e) {
      error = e;
    }
    this.assert(error !== null, message);
    if (expectedError && typeof expectedError === 'string') {
      this.assert(error.message.includes(expectedError), `Error message does not contain "${expectedError}"`);
    }
  }

  static async assertThrowsAsync(promise, expectedError, message = 'Promise did not throw an error') {
    let error = null;
    try {
      await promise;
    } catch (e) {
      error = e;
    }
    this.assert(error !== null, message);
    if (expectedError && typeof expectedError === 'string') {
      this.assert(error.message.includes(expectedError), `Error message does not contain "${expectedError}"`);
    }
  }
}

/**
 * Test Runner with async support
 */
export class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.pending = 0;
  }

  /**
   * Add a test to the runner
   * @param {string} description - Test description
   * @param {Function} testFn - Test function
   * @param {boolean} async - Whether the test is asynchronous
   */
  addTest(description, testFn, async = false) {
    this.tests.push({ description, testFn, async });
  }

  /**
   * Run all tests
   */
  async run() {
    console.log(`\nRunning ${this.tests.length} tests...\n`);

    for (const test of this.tests) {
      await this._runSingleTest(test);
    }

    const total = this.passed + this.failed;
    console.log(`\nTests completed: ${this.passed}/${total} passed`);

    if (this.failed === 0) {
      console.log('🎉 All tests passed!');
    } else {
      console.log(`⚠️  ${this.failed} tests failed`);
      process.exitCode = 1;
    }

    return { passed: this.passed, failed: this.failed, total };
  }

  /**
   * Run a single test
   */
  async _runSingleTest(test) {
    const PASSED = '✅';
    const FAILED = '❌';

    try {
      if (test.async) {
        await test.testFn();
      } else {
        test.testFn();
      }
      console.log(`${PASSED} PASS: ${test.description}`);
      this.passed++;
    } catch (error) {
      console.error(`${FAILED} FAIL: ${test.description}`);
      console.error(`   Error: ${error.message}`);
      this.failed++;
    }
  }
}

/**
 * Mock WebSocket for testing
 */
export class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.OPEN = 1;
    this.CONNECTING = 0;
    this.CLOSED = 3;
    
    // Initialize with CONNECTING state, then transition to OPEN after a short delay
    setTimeout(() => {
      if (this.readyState !== this.CLOSED) {
        this.readyState = this.OPEN;
        if (this.onopen) this.onopen({ type: 'open' });
      }
    }, 10);
  }

  send(data) {
    if (this.readyState !== this.OPEN) {
      throw new Error('WebSocket is not open');
    }
    if (this.onsend) this.onsend(data);
  }

  close(code = 1000, reason = '') {
    if (this.readyState !== this.CLOSED) {
      this.readyState = this.CLOSED;
      if (this.onclose) this.onclose({ code, reason, type: 'close' });
    }
  }

  // Method to simulate receiving a message
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data, type: 'message' });
    }
  }
}

/**
 * Mock DOM Environment for testing
 */
export class MockDOM {
  constructor() {
    this.elements = new Map();
    this.eventListeners = new Map();
  }

  createElement(tagName) {
    const element = {
      tagName: tagName.toUpperCase(),
      children: [],
      attributes: {},
      textContent: '',
      innerHTML: '',
      style: {},
      className: '',
      
      // Methods
      appendChild: (child) => {
        element.children.push(child);
        return child;
      },
      
      removeChild: (child) => {
        const index = element.children.indexOf(child);
        if (index !== -1) {
          element.children.splice(index, 1);
        }
        return child;
      },
      
      setAttribute: (name, value) => {
        element.attributes[name] = value;
      },
      
      getAttribute: (name) => {
        return element.attributes[name] || null;
      },
      
      addEventListener: (event, handler) => {
        if (!this.eventListeners.has(element)) {
          this.eventListeners.set(element, new Map());
        }
        const elementListeners = this.eventListeners.get(element);
        if (!elementListeners.has(event)) {
          elementListeners.set(event, []);
        }
        elementListeners.get(event).push(handler);
      },
      
      dispatchEvent: (event) => {
        const elementListeners = this.eventListeners.get(element);
        if (elementListeners && elementListeners.has(event.type)) {
          elementListeners.get(event.type).forEach(handler => handler(event));
        }
      }
    };
    
    return element;
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  querySelector(selector) {
    // Simple selector implementation for testing
    if (selector.startsWith('#')) {
      return this.getElementById(selector.substring(1));
    }
    return null;
  }

  querySelectorAll(selector) {
    // Simple selector implementation for testing
    if (selector.startsWith('.')) {
      // Find all elements with className matching the class
      const className = selector.substring(1);
      return Array.from(this.elements.values()).filter(el => 
        el.className && el.className.includes(className)
      );
    }
    return [];
  }

  setElement(id, element) {
    this.elements.set(id, element);
  }
}

// Export default test runner instance
export const testRunner = new TestRunner();
export const mockDataGenerator = new MockDataGenerator();