import {AgentBuilder} from '../../../agent/src/AgentBuilder.js';
import {Agent} from '../../../agent/src/Agent.js';
import {NAR} from '../../../core/src/nar/NAR.js';

describe('AgentBuilder', () => {
    const agents = [];

    afterEach(async () => {
        for (const a of agents) {
            if (a?.dispose) await a.dispose();
            else if (a?.stop) a.stop();
        }
        agents.length = 0;
    });

    const build = async (builder = new AgentBuilder()) => {
        const a = await builder.build();
        agents.push(a);
        return a;
    };

    test('default configuration', async () => {
        const a = await build();
        expect(a).toBeInstanceOf(Agent);
        expect(a).toBeInstanceOf(NAR);
        expect(a.evaluator).toBeDefined();
        expect(a.inputQueue).toBeDefined();
    }, 30000);

    test('individual subsystems enabled', async () => {
        expect((await build(new AgentBuilder().withMetrics(true))).metricsMonitor).toBeDefined();
        expect((await build(new AgentBuilder().withEmbeddings({
            enabled: true,
            model: 'test'
        }))).embeddingLayer).toBeDefined();
        expect((await build(new AgentBuilder().withLM(true).withConfig({lm: {modelName: 'test-model'}}))).lm).toBeDefined();
        expect((await build(new AgentBuilder().withTools(true))).tools).toBeDefined();
    }, 60000);

    test('functors configured', async () => {
        const a = await build(new AgentBuilder().withFunctors(['core-arithmetic']));
        const reg = a.evaluator.getFunctorRegistry();
        expect(reg.has('add')).toBe(true);
        expect(reg.has('multiply')).toBe(true);
    }, 30000);

    test('configuration object', async () => {
        const config = {
            subsystems: {
                metrics: true, embeddingLayer: {enabled: true},
                functors: ['core-arithmetic'], rules: ['syllogistic-core'],
                tools: false, lm: true
            },
            lm: {modelName: 'test-model'}
        };
        const a = await build(new AgentBuilder().withConfig(config));

        expect(a.metricsMonitor).toBeDefined();
        expect(a.embeddingLayer).toBeDefined();
        expect(a.lm).toBeDefined();
        expect(a.evaluator.getFunctorRegistry().has('add')).toBe(true);
    }, 60000);

    test('selective disabling', async () => {
        const config = {
            subsystems: {
                metrics: false, embeddingLayer: {enabled: false},
                tools: false, lm: false, functors: []
            }
        };
        const a = await build(new AgentBuilder().withConfig(config));

        expect(a.embeddingLayer).toBeNull();
        expect(a.lm).toBeNull();
        expect(a.tools).toBeNull();
    }, 30000);
});
