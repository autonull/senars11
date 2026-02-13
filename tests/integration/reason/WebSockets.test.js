/**
 * @file WebSockets.test.js
 * @description Unit tests for WebSocket pathway using TestNARRemote
 *              Verifies that WebSocket communication pathway produces identical results
 *              to direct reasoner tests, ensuring UI/REPL functionality is preserved.
 */

import {TestNAR} from '../../../src/testing/TestNAR.js';
import {TestNARRemote} from '../../../src/testing/TestNARRemote.js';
import {RemoteTaskMatch} from '../../../src/testing/TaskMatch.js';

describe('WebSocket Pathway Tests', () => {
    // Basic inheritance chain verification
    test('Basic inheritance chain via WebSocket - should match repl:test behavior', async () => {
        // This test replicates the exact same logic as repl:test default case
        // Input: <a ==> b> and <b ==> c>, expect derivation of <a ==> c>
        await new TestNARRemote()
            .input('<a ==> b>', 1.0, 0.9)
            .input('<b ==> c>', 1.0, 0.9)
            .run(50) // Increase cycles slightly to ensure propagation over WS
            .expect('<a ==> c>')
            .execute();
    }, 30000); // Increased timeout for WS

    test('Continuous execution via *run command', async () => {
        // Verifies that the continuous execution loop works without locking up
        await new TestNARRemote()
            .command('*run') // Start running continuously
            .input('<cat ==> animal>', 1.0, 0.9)
            // Wait for reasoning to happen in the background loop
            .expect('<cat ==> animal>')
            .command('*stop') // Stop running
            .execute();
    }, 30000);

    test('Virtual UI Verification - Graph and Console', async () => {
        // Verifies that the headless UI components (VirtualGraph, VirtualConsole) are populated correctly
        await new TestNARRemote()
            .input('<cat ==> animal>', 1.0, 0.9)
            .command('<dog ==> animal>.', 'narsese') // Test command/input method
            .run(50)
            // Verify Logic
            .expect('<cat ==> animal>')
            // Verify Graph Nodes exist
            .expectNode('cat')
            .expectNode('dog')
            .expectNode('animal')
            // Verify Console Logs
            .expectLog('(==>, cat, animal)')
            .execute();
    }, 30000);
});

describe('Direct Pathway Tests', () => {
    test('Complex inheritance via Direct Pathway - should match repl:test behavior', async () => {
        // Test: <robinson ==> bird> and <bird ==> animal> should derive <robinson ==> animal>
        await new TestNAR()
            .input('<robinson ==> bird>', 1.0, 0.9)
            .input('<bird ==> animal>', 1.0, 0.9)
            .run(5)
            .expect('<robinson ==> animal>')
            .execute();
    });

    test('Multiple inheritance chain via Direct Pathway - should match repl:test behavior', async () => {
        // Test: <car ==> vehicle> and <vehicle ==> object> should derive <car ==> object>
        // but should NOT derive <car ==> entity> (verifying reasoning limits)
        await new TestNAR()
            .input('<car ==> vehicle>', 1.0, 0.9)
            .input('<vehicle ==> object>', 1.0, 0.9)
            .run(5)
            .expect('<car ==> object>')
            .expectNot('<car ==> entity>')
            .execute();
    });

    test('Truth value expectations via Direct Pathway', async () => {
        // Test that derived tasks have expected truth values
        await new TestNAR()
            .input('<x ==> y>', 1.0, 0.9)
            .input('<y ==> z>', 1.0, 0.9)
            .run(5)
            .expect(new RemoteTaskMatch('<x ==> z>').withFlexibleTruth(1.0, 0.8, 0.1))
            .execute();
    });

    test('No spurious derivations via Direct Pathway', async () => {
        // Ensure that unrelated concepts don't get spurious derivations
        await new TestNAR()
            .input('<cat ==> animal>', 1.0, 0.9)
            .run(3)
            .expectNot('<dog ==> animal>')
            .execute();
    });

    test('Sequential inputs via Direct Pathway produce correct derivations', async () => {
        // Test multiple inputs in sequence
        await new TestNAR()
            .input('<dog ==> animal>', 1.0, 0.9)
            .input('<animal ==> living_thing>', 1.0, 0.9)
            .input('<living_thing ==> thing>', 1.0, 0.9)
            .run(15)  // Increase cycles for longer chain derivation
            .expect('<dog ==> living_thing>')  // Should derive intermediate step
            .expect('<dog ==> thing>')         // Should derive final step
            .execute();
    });

    test('Basic property inheritance via Direct Pathway', async () => {
        // Simple property inheritance test
        await new TestNAR()
            .input('<robin ==> bird>', 1.0, 0.9)
            .input('<bird ==> [flying]>', 1.0, 0.9)  // bird has property flying
            .run(5)
            .expect('<robin ==> [flying]>')  // robin inherits flying property
            .execute();
    });
});
