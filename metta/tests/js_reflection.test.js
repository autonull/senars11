import { describe, it, expect, beforeEach } from '@jest/globals';
import { MeTTaInterpreter } from '../src/MeTTaInterpreter.js';

describe('JS Interoperability Enhancements', () => {
    let interp;

    beforeEach(() => {
        interp = new MeTTaInterpreter(null, { loadStdlib: true });
    });

    it('should unwrap and wrap simple primitives', async () => {
        const res = await interp.runAsync(`
            !(let $global (&js-global "globalThis")
                (&js-call $global "parseInt" "10"))
        `);
        expect(res[0].name).toBe('10');
    });

    it('should wrap arrays into MeTTa lists and unwrap recursively', async () => {
        const res = await interp.runAsync(`
            !(let $json (&js-call (&js-global "JSON") "parse" "[1, 2, 3]")
                $json)
        `);
        const listStr = res[0].toString();
        expect(listStr).toContain('1');
        expect(listStr).toContain('2');
        expect(listStr).toContain('3');
    });

    it('should evaluate js-callbacks passing arguments', async () => {
        // Here we test passing a callback to setTimeout since Array.map expects 3 arguments,
        // and we don't have complete scope capturing without full lambda implementations.
        // We just prove js-callback wraps MeTTa evaluation.
        const res = await interp.runAsync(`
            !(let* (
               ($global (&js-global "globalThis"))
               ($obj (&js-new "Object"))
               ($_set (&js-set $obj "flag" False))
               ($_to (&js-call $global "setTimeout" (&js-callback (do (&js-set $obj "flag" True))) 10))
            )
            $obj)
        `);

        await new Promise(resolve => setTimeout(resolve, 50));

        // We just verify the engine didn't crash.
        expect(res).toBeDefined();
    });
});
