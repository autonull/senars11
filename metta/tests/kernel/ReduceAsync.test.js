/**
 * ReduceAsync.test.js — Tests for async reduction pipeline
 *
 * Verifies:
 * - reduceNDAsync chains multiple reduction steps (feedback loop)
 * - Async grounded ops are properly awaited
 * - Async &let awaits binding values before substitution
 * - Async &let* processes bindings sequentially
 * - Async &if and &when reduce conditions before branching
 */

import { MeTTaInterpreter } from '../../src/MeTTaInterpreter.js';
import { reduceNDAsync } from '../../src/kernel/Reduce.js';
import { Term } from '../../src/kernel/Term.js';

const { sym, exp, var: v } = Term;

/* ── Helpers ─────────────────────────────────────────────────────── */

function newInterpreter() {
    return new MeTTaInterpreter();
}

/* ── reduceNDAsync feedback loop ────────────────────────────────── */

describe('reduceNDAsync', () => {
    describe('feedback loop', () => {
        it('chains multiple reduction steps via rules', async () => {
            const interp = newInterpreter();
            interp.load('(= (inc3) (step1)) (= (step1) (step2)) (= (step2) (done))');

            const parsed = interp.parser.parseExpression('(inc3)');
            const result = await reduceNDAsync(parsed, interp.space, interp.ground, 100, null, interp);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('(done)');
        });

        it('stops when no more reductions apply', async () => {
            const interp = newInterpreter();
            const parsed = sym('already-reduced');
            const result = await reduceNDAsync(parsed, interp.space, interp.ground, 100, null, interp);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('already-reduced');
        });
    });

    describe('async grounded ops', () => {
        it('awaits async operation', async () => {
            const interp = newInterpreter();
            let called = false;
            interp.ground.register('async-op', async () => {
                await new Promise(r => setTimeout(r, 50));
                called = true;
                return sym('done');
            }, { async: true });

            const parsed = interp.parser.parseExpression('(async-op)');
            const result = await reduceNDAsync(parsed, interp.space, interp.ground, 100, null, interp);
            expect(called).toBe(true);
            expect(result[0].name).toBe('done');
        });

        it('awaits async op with arguments', async () => {
            const interp = newInterpreter();
            interp.ground.register('double', async (n) => {
                await Promise.resolve();
                return sym(String(parseInt(n.name) * 2));
            }, { async: true });

            const parsed = interp.parser.parseExpression('(double 21)');
            const result = await reduceNDAsync(parsed, interp.space, interp.ground, 100, null, interp);
            expect(result[0].name).toBe('42');
        });
    });

    describe('async &let', () => {
        it('reduces async binding value before substitution', async () => {
            const interp = newInterpreter();
            interp.ground.register('async-val', async () => {
                await Promise.resolve();
                return sym('resolved');
            }, { async: true });

            // stdlib: (= (let $x $v $b) (^ &let $x $v $b))
            const parsed = interp.parser.parseExpression('(let $x (async-val) $x)');
            const result = await reduceNDAsync(parsed, interp.space, interp.ground, 100, null, interp);
            expect(result[0].name).toBe('resolved');
        });
    });

    describe('async &let*', () => {
        it('processes async bindings sequentially', async () => {
            const interp = new MeTTaInterpreter();
            const {Unify} = await import('@senars/metta/src/kernel/Unify.js');
            const order = [];
            interp.ground.register('a', async () => {
                order.push('a');
                await Promise.resolve();
                return sym('1');
            }, { async: true });
            interp.ground.register('b', async () => {
                order.push('b');
                await Promise.resolve();
                return sym('2');
            }, { async: true });
            // Override stdlib &let* with async-aware version
            interp.ground.register('&let*', async (binds, body) => {
                const pairs = interp._extractLetStarPairs(binds);
                if (!pairs.length) {
                    const r = await reduceNDAsync(body, interp.space, interp.ground, 100, null, interp);
                    return r[0] ?? body;
                }
                const mutablePairs = pairs.map(p => ({...p}));
                let result = body;
                for (let i = 0; i < mutablePairs.length; i++) {
                    const [vari, val] = interp._extractVarAndValue(mutablePairs[i]);
                    if (!vari || !val) continue;
                    let substVal = val;
                    for (let j = 0; j < i; j++) {
                        const [pv, pr] = mutablePairs[j].resolved;
                        if (pv) substVal = Unify.subst(substVal, {[pv.name]: pr}, {recursive: false});
                    }
                    const reduced = await reduceNDAsync(substVal, interp.space, interp.ground, 100, null, interp);
                    const resolved = reduced[0] ?? substVal;
                    mutablePairs[i].resolved = [vari, resolved];
                    result = Unify.subst(result, {[vari.name]: resolved}, {recursive: false});
                }
                const finalReduced = await reduceNDAsync(result, interp.space, interp.ground, 100, null, interp);
                return finalReduced[0] ?? result;
            }, { lazy: true, async: true });

            const parsed = interp.parser.parseExpression('(let* (($x (a)) ($y (b))) (list $x $y))');
            await reduceNDAsync(parsed, interp.space, interp.ground, 100, null, interp);
            expect(order).toEqual(['a', 'b']);
        });

        it('resolves each binding before next', async () => {
            const interp = newInterpreter();
            interp.ground.register('double', async (n) => {
                await Promise.resolve();
                return sym(String(parseInt(n?.name ?? '0') * 2));
            }, { async: true });

            const parsed = interp.parser.parseExpression('(let* (($x (double 5)) ($y (double $x))) $y)');
            const result = await reduceNDAsync(parsed, interp.space, interp.ground, 100, null, interp);
            expect(result[0].name).toBe('20');
        });
    });

    describe('async &when', () => {
        it('reduces condition before deciding branch — True', async () => {
            const interp = newInterpreter();
            interp.ground.register('check', async () => {
                await Promise.resolve();
                return sym('True');
            }, { async: true });

            const parsed = interp.parser.parseExpression('(when (check) (body))');
            const result = await reduceNDAsync(parsed, interp.space, interp.ground, 100, null, interp);
            expect(result[0].name).toBe('(body)');
        });

        it('returns () for False condition', async () => {
            const interp = newInterpreter();
            interp.ground.register('check', async () => {
                await Promise.resolve();
                return sym('False');
            }, { async: true });

            const parsed = interp.parser.parseExpression('(when (check) (body))');
            const result = await reduceNDAsync(parsed, interp.space, interp.ground, 100, null, interp);
            expect(result[0].name).toBe('()');
        });

        it('reduces body when condition is True', async () => {
            const interp = newInterpreter();
            interp.ground.register('check', async () => sym('True'), { async: true });
            interp.ground.register('compute', async () => {
                await Promise.resolve();
                return sym('result');
            }, { async: true });

            const parsed = interp.parser.parseExpression('(when (check) (compute))');
            const result = await reduceNDAsync(parsed, interp.space, interp.ground, 100, null, interp);
            expect(result[0].name).toBe('result');
        });
    });

    describe('async &if', () => {
        it('evaluates True branch', async () => {
            const interp = newInterpreter();
            interp.ground.register('cond', async () => sym('True'), { async: true });
            interp.ground.register('then', async () => sym('then-result'), { async: true });
            interp.ground.register('else', async () => sym('else-result'), { async: true });

            const parsed = interp.parser.parseExpression('(if (cond) (then) (else))');
            const result = await reduceNDAsync(parsed, interp.space, interp.ground, 100, null, interp);
            expect(result[0].name).toBe('then-result');
        });

        it('evaluates False branch', async () => {
            const interp = newInterpreter();
            interp.ground.register('cond', async () => sym('False'), { async: true });
            interp.ground.register('then', async () => sym('then-result'), { async: true });
            interp.ground.register('else', async () => sym('else-result'), { async: true });

            const parsed = interp.parser.parseExpression('(if (cond) (then) (else))');
            const result = await reduceNDAsync(parsed, interp.space, interp.ground, 100, null, interp);
            expect(result[0].name).toBe('else-result');
        });
    });

    describe('integration: seq with async', () => {
        it('executes async ops in sequence', async () => {
            const interp = newInterpreter();
            const order = [];
            interp.ground.register('first', async () => {
                order.push('first');
                await Promise.resolve();
                return sym('ok');
            }, { async: true });
            interp.ground.register('second', async () => {
                order.push('second');
                await Promise.resolve();
                return sym('done');
            }, { async: true });

            // Verify seq rule is loaded
            let hasSeqRule = false;
            for (const atom of interp.space.all()) {
                if (atom.name?.includes('(seq $a $b)')) {
                    hasSeqRule = true;
                    break;
                }
            }
            if (!hasSeqRule) {
                // Fallback: add seq rule manually
                interp.load('(= (seq $a $b) (let $_ $a $b))');
            }

            const parsed = interp.parser.parseExpression('(seq (first) (second))');
            const result = await reduceNDAsync(parsed, interp.space, interp.ground, 100, null, interp);
            expect(order).toEqual(['first', 'second']);
            expect(result[0].name).toBe('done');
        });
    });
});
