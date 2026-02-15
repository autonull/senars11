/**
 * @file functional.test.js
 * @description Comprehensive functional tests using shared utilities
 */

import { UITestRunner, getSharedBrowser, closeSharedBrowser } from '../utils/test-utils.js';

describe('UI Functional Tests with Real Backend', () => {
    let testRunner = null;

    beforeAll(async () => {
        // Assumes backend is running via launcher script on default ports
    });

    afterAll(async () => {
        await closeSharedBrowser();
    });

    beforeEach(async () => {
        testRunner = new UITestRunner({ uiPort: 8210, wsPort: 8211 });
        await testRunner.setup();
    }, 40000); // Increase timeout for setup

    afterEach(async () => {
        await testRunner.teardown();
    });

    test('Core functionality: Connection and basic command processing', async () => {
        // Test connection is established
        await testRunner.testConnection();

        // Test basic command execution
        await testRunner.testCommandExecution(
            '<{functional_test} --> concept>.',
            'functional_test'
        );
    }, 35000); // Increase test timeout

    test('Core functionality: Reasoning step execution', async () => {
        await testRunner.testCommandExecution('*step', '*step');
    }, 25000); // Increase test timeout

    test('Core functionality: Question processing', async () => {
        await testRunner.testCommandExecution(
            '<{question_test} --> concept>?',
            'question_test'
        );
    }, 25000); // Increase test timeout

    test('Core functionality: UI controls work', async () => {
        await testRunner.testUIControls();
    }, 25000); // Increase test timeout

    test('Core functionality: Debug commands work', async () => {
        await testRunner.testDebugCommands();
    }, 25000); // Increase test timeout

    test('Core functionality: Quick commands work', async () => {
        await testRunner.testQuickCommands();
    }, 25000); // Increase test timeout
});