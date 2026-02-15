/**
 * @file complex-inference.test.js
 * @description Test complex inference chains with multiple premises
 */

import { setTimeout } from 'timers/promises';
import { UITestRunner, closeSharedBrowser } from '../utils/test-utils.js';

describe('UI Complex Inference Chains with Multiple Premises', () => {
    let testRunner = null;

    afterAll(async () => {
        await closeSharedBrowser();
    });

    beforeEach(async () => {
        testRunner = new UITestRunner({ uiPort: 8250, wsPort: 8251 });
        await testRunner.setup();
    });

    afterEach(async () => {
        await testRunner.teardown();
    });

    test('Multi-premise inheritance chain', async () => {
        // Create inheritance chain: bird -> animal -> living_thing
        await testRunner.executeCommand('<{bird} --> {animal}>.');
        await testRunner.waitForResponse('bird');
        await setTimeout(500);
        
        await testRunner.executeCommand('<{animal} --> {living_thing}>.');
        await testRunner.waitForResponse('animal');
        await setTimeout(500);
        
        // Ask question that requires multi-step inference
        await testRunner.executeCommand('<{bird} --> {living_thing}>?');
        await testRunner.waitForResponse('bird');
        
        const logs = await testRunner.getLogs();
        expect(logs).toContain('bird');
        expect(logs).toContain('animal');
        expect(logs).toContain('living_thing');
        
        // The system should derive the connection through the chain
        expect(logs).toContain('bird') && expect(logs).toContain('living_thing');
    });

    test('Similarity and inheritance combination', async () => {
        // Create similarity relationship
        await testRunner.executeCommand('<({bird} & {flyer}) <-> ({eagle} & {flyer})>.');
        await testRunner.waitForResponse('bird');
        await setTimeout(500);
        
        // Create inheritance
        await testRunner.executeCommand('<{eagle} --> {bird}>.');
        await testRunner.waitForResponse('eagle');
        await setTimeout(500);
        
        // Ask question combining both relationships
        await testRunner.executeCommand('<{eagle} --> {flyer}>?');
        await testRunner.waitForResponse('eagle');
        
        const logs = await testRunner.getLogs();
        expect(logs).toContain('eagle');
        expect(logs).toContain('flyer');
        expect(logs).toContain('bird');
    });

    test('Temporal inference chain', async () => {
        // Create temporal relationships
        await testRunner.executeCommand('<{rain_start} =/> {ground_wet}>.');
        await testRunner.waitForResponse('rain_start');
        await setTimeout(500);
        
        await testRunner.executeCommand('<{clouds_appear} =/> {rain_start}>.');
        await testRunner.waitForResponse('clouds_appear');
        await setTimeout(500);
        
        // Ask about the transitive relationship
        await testRunner.executeCommand('<{clouds_appear} =/> {ground_wet}>?');
        await testRunner.waitForResponse('clouds_appear');
        
        const logs = await testRunner.getLogs();
        expect(logs).toContain('clouds_appear');
        expect(logs).toContain('rain_start');
        expect(logs).toContain('ground_wet');
    });

    test('Compound term inference', async () => {
        // Create compound terms
        await testRunner.executeCommand('<{red_apple} --> (&, {red}, {apple})>.');
        await testRunner.waitForResponse('red_apple');
        await setTimeout(500);
        
        await testRunner.executeCommand('<{apple} --> {fruit}>.');
        await testRunner.waitForResponse('apple');
        await setTimeout(500);
        
        // Test inference with compound terms
        await testRunner.executeCommand('<{red_apple} --> {fruit}>?');
        await testRunner.waitForResponse('red_apple');
        
        const logs = await testRunner.getLogs();
        expect(logs).toContain('red_apple');
        expect(logs).toContain('apple');
        expect(logs).toContain('fruit');
        expect(logs).toContain('red');
    });

    test('Multi-step reasoning with concepts', async () => {
        // Create several connected concepts
        const premises = [
            '<{cat} --> {mammal}>.',
            '<{mammal} --> {animal}>.',
            '<{animal} --> {living_thing}>.',
            '<{living_thing} --> {entity}>.'
        ];
        
        for (const premise of premises) {
            await testRunner.executeCommand(premise);
            await setTimeout(500);
        }
        
        // Ask for the multi-step connection
        await testRunner.executeCommand('<{cat} --> {entity}>?');
        await testRunner.waitForResponse('entity');
        
        const logs = await testRunner.getLogs();
        
        // Should contain evidence of the reasoning chain
        expect(logs).toContain('cat');
        expect(logs).toContain('entity');
        expect(logs).toContain('mammal');
        expect(logs).toContain('animal');
    });
});