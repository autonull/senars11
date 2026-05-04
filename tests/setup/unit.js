// Unit Test Setup
// This file sets up the environment for unit tests with real objects and minimal dependencies

import {TextDecoder, TextEncoder} from 'util';
import {setupCustomMatchers} from '../support/test-matchers.js';
import {commonTestCleanup, commonTestSetup} from '../support/commonTestSetup.js';

globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

// Mock browser APIs for tests that depend on them
const setupBrowserMocks = () => {
    if (typeof window !== 'undefined') {
        window.URL = window.URL || {};
        window.URL.createObjectURL = window.URL.createObjectURL || function () {
            return 'mock-url';
        };
        window.URL.revokeObjectURL = window.URL.revokeObjectURL || function () {
        };
    }
    if (typeof global !== 'undefined') {
        global.window = global.window || {
            URL: {
                createObjectURL: function () {
                    return 'mock-url';
                },
                revokeObjectURL: function () {
                }
            }
        };
        global.URL = global.URL || {
            createObjectURL: function () {
                return 'mock-url';
            },
            revokeObjectURL: function () {
            }
        };
    }
};

setupBrowserMocks();
setupCustomMatchers();

commonTestSetup({
    silenceConsole: true,
    setupGlobals: true,
    customGlobals: {}
});

afterEach(() => {
});

afterAll(() => {
    commonTestCleanup(['createTestInstance']);
});

afterEach(() => {
});

afterAll(() => {
    commonTestCleanup(['createTestInstance']);
});

// Cleanup functions for after tests
afterEach(() => {
    // Any cleanup needed between tests
});

afterAll(() => {
    // Clean up globals specific to unit tests
    commonTestCleanup(['createTestInstance']);
});
