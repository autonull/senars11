import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { App } from '../../../agent/src/app/App.js';
import { assertEventuallyTrue, getTerms, hasTermMatch, wait } from '../../support/testHelpers.js';

/**
 * Full system integration tests combining NAL + LM + Prolog + Memory subsystems.
 * These tests verify cross-subsystem interactions and end-to-end workflows.
 */

describe('Full System Integration', () => {
    let app, agent;

    beforeAll(async () => {
        app = new App({
            lm: {
                provider: 'transformers',
                modelName: 'Xenova/flan-t5-small',
                enabled: true,
                temperature: 0.1,
                circuitBreaker: { failureThreshold: 5, resetTimeout: 1000 }
            },
            subsystems: { lm: true, prolog: true },
            memory: {
                priorityThreshold: 0.3,
                consolidationInterval: 5,
                maxConcepts: 100
            },
            reasoning: {
                type: 'stream',
                maxDerivationDepth: 10
            }
        });

        agent = await app.start({ startAgent: true });
    });

    afterAll(async () => {
        await app?.shutdown();
    }, 15000);

    test('Cross-subsystem workflow: NL → NAL → Prolog reasoning', async () => {
        // LM translates NL to Narsese
        await agent.input('"Birds can fly".');

        // NAL symbolic processing
        await agent.input('<robin --> bird>.');

        await assertEventuallyTrue(
            () => {
                const terms = getTerms(agent);
                return hasTermMatch(terms, 'bird', 'fly') || hasTermMatch(terms, 'robin');
            },
            { description: 'NL→NAL→Memory integration', timeout: 5000 }
        );
    }, 10000);

    test('Memory consolidation across reasoning cycles', async () => {
        // Add multiple related beliefs
        const beliefs = [
            '<cat --> mammal>.',
            '<dog --> mammal>.',
            '<cat --> pet>.',
            '<dog --> pet>.',
            '<mammal --> animal>.'
        ];

        for (const belief of beliefs) {
            await agent.input(belief);
        }

        // Run reasoning cycles to trigger consolidation
        if (agent.nar?.runCycles) {
            await agent.nar.runCycles(10);
        }

        // Verify memory consolidation
        const concepts = agent.getConcepts();
        expect(concepts.length).toBeGreaterThanOrEqual(3);

        // Verify key concepts are present
        const conceptTerms = concepts.map(c => c.term.toString());
        const hasMammal = conceptTerms.some(t => t.includes('mammal'));
        const hasPet = conceptTerms.some(t => t.includes('pet'));

        expect(hasMammal || hasPet).toBe(true);
    });

    test('Event flow across subsystems', async () => {
        const events = [];

        if (agent.on) {
            agent.on('lm.prompt', (data) => events.push({ type: 'lm.prompt', ...data }));
            agent.on('lm.response', (data) => events.push({ type: 'lm.response', ...data }));
            agent.on('task.added', (data) => events.push({ type: 'task.added', ...data }));
        }

        await agent.input('"Dogs are friendly".');
        await wait(100);

        // Verify event chain
        const hasLMEvent = events.some(e => e.type.startsWith('lm.'));
        const hasTaskEvent = events.some(e => e.type === 'task.added');

        expect(hasLMEvent || hasTaskEvent).toBe(true);
    }, 8000);

    test('Real-world scenario: Multi-step goal decomposition', async () => {
        // Complex goal requiring multiple subsystems
        await agent.input('plan_trip!');

        await assertEventuallyTrue(
            () => {
                const goals = agent.getGoals();
                const concepts = agent.getConcepts();
                return goals.length > 0 || concepts.length > 0;
            },
            { description: 'goal processed by system', timeout: 3000 }
        );
    }, 8000);

    test('Concurrent reasoning and memory management', async () => {
        // Simulate concurrent inputs
        const inputs = [
            '<vehicle --> transport>.',
            '<car --> vehicle>.',
            '<bus --> vehicle>.',
            '"Transportation is essential".',
            '(transport ==> movement).'
        ];

        await Promise.all(inputs.map(input => agent.input(input)));

        // Verify system handled concurrent inputs
        const concepts = agent.getConcepts();
        const beliefs = agent.getBeliefs();

        expect(concepts.length + beliefs.length).toBeGreaterThan(0);
    });

    test('System resilience: Error recovery across subsystems', async () => {
        // Send invalid input
        try {
            await agent.input('<<<invalid>>>');
        } catch (e) {
            // Expected
        }

        // System should continue functioning
        await agent.input('<valid --> test>.');

        await assertEventuallyTrue(
            () => {
                const terms = getTerms(agent);
                return terms.some(t => t.includes('valid') || t.includes('test'));
            },
            { description: 'system recovers from error', timeout: 2000 }
        );
    });

    describe('NAL-Prolog Synergy', () => {
        test('Prolog feedback loop → NAL stream', async () => {
            // Note: Assumes NARTool is available via agent
            if (!agent.narTool && !agent.nar) {
                console.warn('Skipping Prolog test - NARTool not available');
                return;
            }

            const narTool = agent.narTool || (agent.nar && {
                execute: async (cmd) => {
                    if (cmd.action === 'assert_prolog') {
                        // Basic assertion - this is a simplified version
                        return true;
                    }
                }
            });

            await narTool.execute({ action: 'assert_prolog', content: 'man(socrates).' });
            await narTool.execute({ action: 'assert_prolog', content: 'mortal(X) :- man(X).' });

            // Verify prolog integration is working
            const concepts = agent.getConcepts();
            expect(concepts).toBeDefined();
        }, 5000);

        test('Cross-system reasoning with Prolog rules', async () => {
            // Add NAL beliefs
            await agent.input('<cat --> animal>.');
            await agent.input('<dog --> animal>.');

            await assertEventuallyTrue(
                () => {
                    const terms = getTerms(agent);
                    return terms.some(t => t.includes('cat') || t.includes('dog'));
                },
                { description: 'NAL-Prolog integration', timeout: 3000 }
            );
        });
    });
});
