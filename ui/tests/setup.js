// Setup file to handle WebSocket properly for tests
// This ensures proper WebSocket support in test environments

// Only define WebSocket mock if not already available in browser context
if (typeof WebSocket === 'undefined' || typeof window === 'undefined') {
  // Node.js environment - provide WebSocket mock
  global.WebSocket = class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0; // CONNECTING
      this.onopen = null;
      this.onclose = null;
      this.onerror = null;
      this.onmessage = null;

      // Simulate connection
      setTimeout(() => {
        this.readyState = 1; // OPEN
        if (this.onopen) {
          this.onopen({ target: this });
        }
      }, 0);
    }

    send(data) {
      // Mock send functionality
      console.log(`Mock WebSocket sending: ${data}`);
    }

    close() {
      this.readyState = 3; // CLOSED
      if (this.onclose) {
        this.onclose({ target: this });
      }
    }
  };
}

// Mock TransformStream if not available (for e2e tests)
if (typeof TransformStream === 'undefined') {
  global.TransformStream = class TransformStream {
    constructor() {
      this.writable = {};
      this.readable = {};
    }
  };
}

// Mock jest if not available
global.jest = global.jest || {
  fn: () => ({
    mockImplementation: () => global.jest.fn(),
    mockReturnValue: () => global.jest.fn(),
    mockResolvedValue: () => global.jest.fn(),
    calledWith: () => global.jest.fn(),
    clearAllMocks: () => {}
  }),
  clearAllMocks: () => {},
  spyOn: () => global.jest.fn()
};

// Add common globals for browser compatibility in tests
if (typeof window !== 'undefined') {
  global.window = global.window || {};
  global.window.requestAnimationFrame = global.window.requestAnimationFrame ||
    ((callback) => setTimeout(callback, 0));
}