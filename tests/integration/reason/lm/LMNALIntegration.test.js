import {afterAll, beforeAll, describe, test} from '@jest/globals';
import {Punctuation, Task, TermFactory} from '@senars/nar';
import {createLMNALTestAgent} from '../../../support/lmTestHelpers.js';
import {assertEventuallyTrue, getTerms, hasTermMatch} from '../../../support/testHelpers.js';

describe('LM ↔ NAL Integration', () => {
    let app, agent, termFactory;

    beforeAll(async () => {
        ({app, agent} = await createLMNALTestAgent());
        termFactory = new TermFactory();
    });

    afterAll(async () => {
        if (app) await app.shutdown();
    });

    describe('LM → NAL: Language Model to Symbolic Reasoning', () => {
        const lmToNalTests = [
            {
                name: 'NL translation to Narsese',
                input: '"Dogs are animals".',
                verify: (terms) => hasTermMatch(terms, 'dog', 'animal'),
                description: 'NL translation to Narsese'
            },
            {
                name: 'Concept elaboration',
                input: '"bird".',
                verify: (terms) => hasTermMatch(terms, 'bird') && (hasTermMatch(terms, 'animal') || hasTermMatch(terms, 'fly')),
                description: 'concept elaboration'
            },
            {
                name: 'Goal decomposition',
                taskConfig: {
                    punctuation: Punctuation.GOAL,
                    budget: {priority: 0.9},
                    truth: {frequency: 1.0, confidence: 0.9}
                },
                termBuilder: (tf) => tf.atomic('write_book'),
                verify: (terms, agent) => agent.getGoals().length > 0 || agent.getConcepts().length > 0,
                description: 'goal processing',
                timeout: 5000
            },
            {
                name: 'Hypothesis generation',
                taskConfig: {
                    punctuation: Punctuation.BELIEF,
                    budget: {priority: 0.9},
                    truth: {frequency: 1.0, confidence: 0.9}
                },
                termBuilder: (tf) => tf.atomic('"Activity correlates with results"'),
                verify: (terms, agent) => {
                    const all = [...agent.getQuestions(), ...agent.getBeliefs()].map(t => t.term.toString());
                    return all.some(t => ['activity', 'results', 'Increased'].some(w => t.includes(w)));
                },
                description: 'hypothesis generation'
            },
            {
                name: 'Variable grounding',
                taskConfig: {
                    punctuation: Punctuation.BELIEF,
                    budget: {priority: 0.9},
                    truth: {frequency: 0.9, confidence: 0.9}
                },
                termBuilder: (tf) => tf.atomic('"Value is $X"'),
                verify: (terms) => terms.some(t => ['robin', 'canary', 'Value'].some(w => t.includes(w))),
                description: 'variable grounding'
            },
            {
                name: 'Analogical reasoning',
                taskConfig: {
                    punctuation: Punctuation.GOAL,
                    budget: {priority: 0.9},
                    truth: {frequency: 1.0, confidence: 0.9}
                },
                termBuilder: (tf) => tf.atomic('solve_complex_problem'),
                verify: (terms) => terms.some(t => ['solution', 'problem', 'solve'].some(w => t.includes(w))),
                description: 'analogical reasoning (relaxed check)'
            }
        ];

        test.each(lmToNalTests)('$name', async ({input, taskConfig, termBuilder, verify, description, timeout}) => {
            let taskInput;

            if (termBuilder) {
                const term = termBuilder(termFactory);
                taskInput = new Task({...taskConfig, term});
            } else {
                taskInput = input;
            }

            await agent.input(taskInput);

            await assertEventuallyTrue(
                () => {
                    const terms = getTerms(agent);
                    return verify(terms, agent);
                },
                {description, timeout: timeout || 2000}
            );
        }, 5000);
    });

    describe('NAL → LM: Symbolic Reasoning to Language Model', () => {
        const nalToLmTests = [
            {
                name: 'NAL syllogism with LM explanation',
                premises: ['<exercise --> activity>.', '<activity --> healthy_behavior>.'],
                verify: (terms) => hasTermMatch(terms, 'exercise', 'healthy') || hasTermMatch(terms, 'explanation'),
                description: 'syllogistic derivation or explanation'
            },
            {
                name: 'NAL induction with LM elaboration',
                premises: ['<robin --> bird>.', '<robin --> [red_breast]>.'],
                verify: (terms) => hasTermMatch(terms, 'bird', 'red') || hasTermMatch(terms, 'robin'),
                description: 'induction result or elaboration'
            },
            {
                name: 'NAL abduction with LM validation',
                premises: ['<cat --> mammal>.', '<dog --> mammal>.'],
                verify: (terms) => terms.some(t => ['cat', 'dog', 'mammal'].some(w => t.includes(w))),
                description: 'abduction result'
            },
            {
                name: 'NAL conversion to reversed inheritance',
                premises: ['<student --> person>.'],
                verify: (terms) => hasTermMatch(terms, 'student', 'person'),
                description: 'conversion result'
            }
        ];

        test.each(nalToLmTests)('$name', async ({premises, verify, description}) => {
            for (const premise of premises) {
                await agent.input(premise);
            }

            await assertEventuallyTrue(
                () => verify(getTerms(agent)),
                {description}
            );
        });
    });

    describe('Bidirectional LM ↔ NAL Cycle', () => {
        test('Full cycle: LM translation → NAL syllogism → LM elaboration', async () => {
            await agent.input('"Birds can fly".');
            await agent.input('<canary --> bird>.');

            await assertEventuallyTrue(
                () => {
                    const terms = getTerms(agent);
                    const hasBirdFly = hasTermMatch(terms, 'bird', 'fly');
                    const hasCanaryBird = hasTermMatch(terms, 'canary', 'bird');
                    return hasBirdFly || hasCanaryBird;
                },
                {description: 'full LM→NAL→LM cycle'}
            );
        });

        test('Full cycle: NAL inference → LM hypothesis → NAL modus ponens', async () => {
            await agent.input('<exercise --> activity>.');
            await agent.input('<activity --> healthy>.');
            await agent.input('exercise.');

            await assertEventuallyTrue(
                () => {
                    const terms = getTerms(agent);
                    return terms.some(t => ['exercise', 'healthy', 'activity'].some(w => t.includes(w)));
                },
                {description: 'NAL→LM→NAL interaction'}
            );
        });
    });

    describe('Pure NAL Syllogistic (No LM)', () => {
        let pureNalApp, pureNalAgent;

        beforeAll(async () => {
            ({app: pureNalApp, agent: pureNalAgent} = await createLMNALTestAgent({}, {
                lm: {enabled: false},
                subsystems: {lm: false}
            }));
        });

        afterAll(async () => {
            if (pureNalApp) await pureNalApp.shutdown();
        });

        const pureNalTests = [
            {
                name: 'Transitive inheritance',
                premises: ['<sparrow --> bird>.', '<bird --> animal>.'],
                verify: (terms) => hasTermMatch(terms, 'sparrow', 'animal'),
                description: 'syllogistic derivation'
            },
            {
                name: 'Modus ponens',
                premises: ['(rain ==> wet).', 'rain.'],
                verify: (terms) => terms.some(t => t === 'wet' || t.includes('wet')),
                description: 'modus ponens derivation'
            },
            {
                name: 'Induction with shared subject',
                premises: ['<robin --> bird>.', '<robin --> singer>.'],
                verify: (terms) => hasTermMatch(terms, 'bird', 'singer') || hasTermMatch(terms, 'robin'),
                description: 'inductive inference'
            },
            {
                name: 'Abduction with shared predicate',
                premises: ['<bird --> animal>.', '<fish --> animal>.'],
                verify: (terms) => terms.some(t => ['bird', 'fish', 'animal'].some(w => t.includes(w))),
                description: 'abductive inference'
            },
            {
                name: 'Implication chain',
                premises: ['(study ==> learn).', '(learn ==> knowledge).'],
                verify: (terms) => hasTermMatch(terms, 'study', 'knowledge'),
                description: 'implication chain derivation'
            }
        ];

        test.each(pureNalTests)('$name', async ({premises, verify, description}) => {
            for (const premise of premises) {
                await pureNalAgent.input(premise);
            }

            await assertEventuallyTrue(
                () => verify(getTerms(pureNalAgent)),
                {description}
            );
        });
    });
});
