// Unit Test Setup
// This file sets up the environment for unit tests with real objects and minimal dependencies

import {setupCustomMatchers} from '../support/test-matchers.js';
import {commonTestSetup, commonTestCleanup} from '../support/commonTestSetup.js';

// Mock danfojs — heavy browser deps (plotly, mapbox-gl, tensorflow) can't run in jsdom
// Source lazy-loads via dynamic import(), so we set a global mock
globalThis.__mockDanfojs = {
    DataFrame: class MockDataFrame {
        constructor(data) { this._data = data || []; }
        get values() { return Array.isArray(this._data) ? this._data : []; }
        get columns() { return this._data?.length > 0 ? Object.keys(this._data[0]) : []; }
        get shape() { return [this._data.length, this.columns.length]; }
    }
};

// Setup custom Jest matchers for flexible assertions
setupCustomMatchers();

// Mock browser APIs for tests that depend on them
// This needs to run before any imports that might use these APIs
const setupBrowserMocks = () => {
    // Mock window object with URL (for jsdom environment)
    if (typeof window !== 'undefined') {
        window.URL = window.URL || {};
        window.URL.createObjectURL = window.URL.createObjectURL || function() { return 'mock-url'; };
        window.URL.revokeObjectURL = window.URL.revokeObjectURL || function() {};
    }
    
    // Mock global objects (for node environment)
    if (typeof global !== 'undefined') {
        global.window = global.window || {
            URL: {
                createObjectURL: function() { return 'mock-url'; },
                revokeObjectURL: function() {}
            }
        };
        global.URL = global.URL || {
            createObjectURL: function() { return 'mock-url'; },
            revokeObjectURL: function() {}
        };
    }
};

setupBrowserMocks();

// Use common test setup
commonTestSetup({
    silenceConsole: true,
    setupGlobals: true,
    customGlobals: {}
});

// Cleanup functions for after tests
afterEach(() => {
    // Any cleanup needed between tests
});

afterAll(() => {
    // Clean up globals specific to unit tests
    commonTestCleanup(['createTestInstance']);
});
