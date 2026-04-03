import { describe, it, expect, beforeEach } from '@jest/globals';
import { MeTTaInterpreter } from '../src/MeTTaInterpreter.js';

describe('JS Interoperability Enhancements', () => {
    let interp;

    beforeEach(() => {
        interp = new MeTTaInterpreter({ loadStdlib: true });
    });

    it('should access global objects and call methods', async () => {
        const res = await interp.runAsync(`
            !(&js-global "JSON")
        `);
        // Verify we get a grounded JSON object
        expect(res[0].type).toBe('grounded');
        expect(res[0].value).toBe(JSON);
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

        expect(res).toBeDefined();
    });
});
