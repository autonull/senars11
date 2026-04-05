import {MetaController, NeuroSymbolicBridge} from '../../src/index.js';
import {strict as assert} from 'assert';
import {describe, test} from '@jest/globals';
import {MeTTaInterpreter} from '@senars/metta/src/MeTTaInterpreter.js';

describe('MeTTa Reflection Integration', () => {

    test('MetaController should generate operators using MeTTa reflection', async () => {
        const mettaInterpreter = new MeTTaInterpreter();

        const controller = new MetaController({
            useMettaRepresentation: true,
            mettaInterpreter,
            mettaConfig: {ground: mettaInterpreter.ground}
        });

        // Mock architecture and history
        controller.currentArchitecture = {id: 'test-arch'};
        // controller.config.forceAdd = true; // Set via constructor
        controller.config.forceAdd = true;

        // Use a minimal bridge without SeNARS for speed
        controller.bridge = new NeuroSymbolicBridge({
            mettaInterpreter,
            useSeNARS: false,
            gradientTracking: false,
            cacheInference: false
        });

        await controller.bridge.initialize();

        const operators = await controller._generateMettaOperators();

        assert.ok(operators.length > 0, 'Should generate operators');

        const op = operators[0];
        assert.equal(op.type, 'add', 'Should be an add operator (short history)');
        assert.equal(op.parameters.stage, 'reasoning', 'Should add to reasoning stage');

        console.log('Generated operator via reflection:', op);
    });

    test.skip('MetaController should generate different operators based on state', async () => {
        const mettaInterpreter = new MeTTaInterpreter();
        const controller = new MetaController({
            useMettaRepresentation: true,
            mettaInterpreter,
            mettaConfig: {ground: mettaInterpreter.ground}
        });

        // Mock state -> should trigger 'modify' op from script
        controller.config.forceAdd = false;

        controller.bridge = new NeuroSymbolicBridge({
            mettaInterpreter,
            useSeNARS: false,
            gradientTracking: false,
            cacheInference: false
        });
        await controller.bridge.initialize();

        const operators = await controller._generateMettaOperators();

        assert.ok(operators.length > 0, 'Should generate operators');

        const op = operators[0];
        assert.equal(op.type, 'modify', 'Should be a modify operator (long history)');
        assert.equal(op.parameters.componentId, 'policy', 'Should modify policy');
    });

    test('Reflection: Manual script execution', async () => {
        const mettaInterpreter = new MeTTaInterpreter();

        // Define function
        await mettaInterpreter.run(`
            (= (get-prop $obj $key) (&js-get $obj $key))
        `);

        const obj = {foo: 'bar'};
        const {grounded, exp, sym} = await import('@senars/metta/src/kernel/Term.js');
        const objAtom = grounded(obj);
        const keyAtom = grounded('foo'); // Or string? "foo"
        // MeTTa string literal "foo" parses to symbol "foo" or string "foo"?
        // MeTTa parser handles "foo" as String atom if implemented, or symbol.
        // My reflection ops expect grounded atoms or symbols.

        // Construct (get-prop objAtom "foo")
        // Note: "foo" should be a String atom if parser supports it, or Symbol.
        // Let's use grounded string to be safe.
        const expr = exp(sym('get-prop'), [objAtom, grounded('foo')]);

        const result = await mettaInterpreter.evaluateAsync(expr);
        const results = Array.isArray(result) ? result : [result];

        assert.ok(results.length > 0);
        assert.equal(results[0].value, 'bar');
    });

    test('Reflection: Class instance property access', async () => {
        const mettaInterpreter = new MeTTaInterpreter();

        class TestClass {
            constructor() {
                this.prop = 'val';
                this.history = [];
            }
        }

        const obj = new TestClass();

        const {grounded, exp, sym} = await import('@senars/metta/src/kernel/Term.js');
        const objAtom = grounded(obj);

        // (&js-get $obj "prop")
        const expr = exp(sym('&js-get'), [objAtom, grounded('prop')]);
        const result = await mettaInterpreter.evaluateAsync(expr);
        const results = Array.isArray(result) ? result : [result];

        assert.equal(results[0].value, 'val');

        // (&js-get $obj "history")
        const expr2 = exp(sym('&js-get'), [objAtom, grounded('history')]);
        const result2 = await mettaInterpreter.evaluateAsync(expr2);
        const results2 = Array.isArray(result2) ? result2 : [result2];

        assert.ok(Array.isArray(results2[0].value));
        assert.equal(results2[0].value.length, 0);
    });

    test('Reflection: Comparison behavior', async () => {
        const mettaInterpreter = new MeTTaInterpreter();
        const {sym} = await import('@senars/metta/src/kernel/Term.js');

        // Check (&< 15 10)
        const res1 = await mettaInterpreter.runAsync('!(&< 15 10)');
        console.log('(&< 15 10) ->', res1.toString());
        assert.equal(res1[0].name, 'False');

        // Check (&< "15" 10) - mimicking what &js-unwrap returns
        // Note: unwrap returns symbol "15".
        // In MeTTa source, 15 is number. "15" is string/symbol.

        // Let's force create symbol "15"
        const sym15 = sym("15");
        const num10 = sym("10"); // Or however numbers are represented (usually symbols with digits)

        // Create expression (&< sym15 num10)
        // Need to import exp
        const {exp} = await import('@senars/metta/src/kernel/Term.js');
        const expr = exp(sym('&<'), [sym15, num10]);
        const res2 = await mettaInterpreter.evaluateAsync(expr);
        console.log('(&< "15" "10") ->', res2.toString());
        assert.equal(res2[0].name, 'False');
    });

});
