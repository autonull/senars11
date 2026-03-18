/**
 * Unit Tests for Composable Module System
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
    Component,
    functionalComponent,
    ComponentRegistry,
    CompositionEngine,
    PipelineBuilder
} from '../../src/composable/ComposableSystem.js';
import { MetaController, ArchitectureEvolver } from '../../src/meta/MetaControlSystem.js';

// ========== Component Tests ==========
describe('Component', () => {

    class TestComponent extends Component {
        constructor(config = {}) {
            super({ value: 0, ...config });
        }

        async onInitialize() {
            this.setState('initialized', true);
        }

        async process(input) {
            return input + this.config.value;
        }
    }

    describe('Lifecycle', () => {
        it('should initialize and shutdown', async () => {
            const comp = new TestComponent({ value: 10 });
            expect(comp.initialized).toBe(false);

            await comp.initialize();
            expect(comp.initialized).toBe(true);
            expect(comp.getState('initialized')).toBe(true);

            await comp.shutdown();
            expect(comp.initialized).toBe(false);
        });
    });

    describe('Composition', () => {
        it('should add, get, and remove children', async () => {
            const parent = new TestComponent({ value: 1 });
            const child1 = new TestComponent({ value: 2 });
            const child2 = new TestComponent({ value: 3 });

            parent.add('child1', child1);
            parent.add('child2', child2);

            expect(parent.has('child1')).toBe(true);
            expect(parent.has('child3')).toBe(false);
            expect(parent.get('child1')).toBe(child1);

            parent.remove('child1');
            expect(parent.has('child1')).toBe(false);
        });
    });

    describe('Events', () => {
        it('should emit and receive events', async () => {
            const comp = new TestComponent();
            let eventReceived = false;
            let eventData = null;

            comp.subscribe('testEvent', (data) => {
                eventReceived = true;
                eventData = data;
            });

            comp.emit('testEvent', { message: 'hello' });

            expect(eventReceived).toBe(true);
            expect(eventData.message).toBe('hello');
        });
    });

    describe('Serialization', () => {
        it('should serialize component', async () => {
            const comp = new TestComponent({ value: 42 });
            await comp.initialize();
            comp.setState('customState', 'test');

            const serialized = comp.serialize();
            expect(serialized.type).toBe('TestComponent');
            expect(serialized.config.value).toBe(42);
        });
    });

    describe('Functional Component', () => {
        it('should execute function', async () => {
            const fn = async (input, component) => input * 2;
            const FuncComp = functionalComponent(fn, { multiplier: 2 });
            const comp = new FuncComp();

            await comp.initialize();
            const result = await comp.call(5);

            expect(result).toBe(10);
        });
    });
});

// ========== ComponentRegistry Tests ==========
describe('ComponentRegistry', () => {

    class TestComponent extends Component {
        constructor(config = {}) {
            super({ value: 0, ...config });
        }
    }

    describe('Basic Operations', () => {
        it('should register and create components', () => {
            const registry = new ComponentRegistry();

            registry.register('testComp', TestComponent, {
                aliases: ['tc'],
                version: '1.0.0',
                description: 'Test component'
            });

            expect(registry.has('testComp')).toBe(true);
            expect(registry.has('tc')).toBe(true);
            expect(registry.get('tc')).toBe(TestComponent);

            const instance = registry.create('testComp', { value: 5 });
            expect(instance.config.value).toBe(5);

            registry.unregister('testComp');
            expect(registry.has('testComp')).toBe(false);
        });
    });

    describe('Dependencies', () => {
        it('should resolve dependencies', () => {
            const registry = new ComponentRegistry();

            registry.register('dep1', TestComponent);
            registry.register('dep2', TestComponent, { dependencies: ['dep1'] });

            const deps = registry.resolveDependencies('dep2');
            expect(deps.includes('dep1')).toBe(true);
            expect(deps.includes('dep2')).toBe(true);
        });
    });

    describe('List', () => {
        it('should list all components', () => {
            const registry = new ComponentRegistry();
            registry.register('comp1', TestComponent, { version: '1.0.0' });
            registry.register('comp2', TestComponent, { version: '2.0.0' });

            const list = registry.list();
            expect(list.length).toBe(2);
        });
    });
});

// ========== CompositionEngine Tests ==========
describe('CompositionEngine', () => {

    class TestComponent extends Component {
        constructor(config = {}) {
            super({ value: 0, ...config });
        }

        async process(input) {
            return input + this.config.value;
        }
    }

    describe('Pipeline Creation', () => {
        it('should create pipeline', async () => {
            const engine = new CompositionEngine();

            const comp1 = new TestComponent({ value: 1 });
            const comp2 = new TestComponent({ value: 2 });

            engine.createPipeline('test', [
                { id: 'stage1', component: comp1 },
                { id: 'stage2', component: comp2 }
            ]);

            const pipeline = engine.getPipeline('test');
            expect(pipeline.stages.length).toBe(2);
        });
    });

    describe('Pipeline Execution', () => {
        it('should execute pipeline', async () => {
            const engine = new CompositionEngine();
            const comp = new TestComponent({ value: 10 });

            engine.createPipeline('add', [
                { id: 'add10', component: comp, config: { method: 'process' } }
            ]);

            const result = await engine.execute('add', 5);
            expect(result.success).toBe(true);
            expect(result.output).toBe(15);
        });
    });

    describe('Pipeline Builder', () => {
        it('should build and run pipeline', async () => {
            const engine = new CompositionEngine();
            const comp = new TestComponent({ value: 5 });

            const result = await new PipelineBuilder(engine)
                .named('builder_test')
                .add(comp, { method: 'process' })
                .run(10);

            expect(result.success).toBe(true);
            expect(result.output).toBe(15);
        });
    });

    describe('Conditional Stage', () => {
        it('should execute conditionally', async () => {
            const engine = new CompositionEngine();
            const comp = new TestComponent({ value: 100 });

            engine.createPipeline('conditional', [
                {
                    id: 'maybe',
                    component: comp,
                    condition: (input) => input > 50,
                    config: { method: 'process' }
                }
            ]);

            const result1 = await engine.execute('conditional', 60);
            const result2 = await engine.execute('conditional', 30);

            expect(result1.output).toBe(160);
            expect(result2.output).toBe(30);
        });
    });
});

// ========== MetaController Tests ==========
describe('MetaController', () => {

    describe('Initialization', () => {
        it('should initialize correctly', async () => {
            const meta = new MetaController({
                metaLearningRate: 0.1,
                evaluationWindow: 10
            });

            await meta.initialize();
            const state = meta.getState();
            expect(state).toBeDefined();
            expect(state.generation).toBe(0);

            await meta.shutdown();
        });
    });

    describe('Architecture', () => {
        it('should set architecture', async () => {
            const meta = new MetaController();
            await meta.initialize();

            const arch = {
                stages: [
                    { id: 's1', component: {} },
                    { id: 's2', component: {} }
                ]
            };

            meta.setArchitecture(arch);
            const state = meta.getState();
            expect(state).toBeDefined();

            await meta.shutdown();
        });
    });

    describe('Evaluation', () => {
        it('should track metrics', async () => {
            const meta = new MetaController({ evaluationWindow: 5 });
            await meta.initialize();

            const state = meta.getState();
            expect(state).toBeDefined();
            expect(state.metrics).toBeDefined();

            await meta.shutdown();
        });
    });

    describe('Modification', () => {
        it('should track modification metrics', async () => {
            const meta = new MetaController({ explorationRate: 1.0 });
            await meta.initialize();

            const state = meta.getState();
            expect(state).toBeDefined();
            expect(state.metrics.modificationsProposed).toBeDefined();

            await meta.shutdown();
        });
    });
});

// ========== ArchitectureEvolver Tests ==========
describe('ArchitectureEvolver', () => {

    describe('Initialization', () => {
        it('should initialize correctly', async () => {
            const evolver = new ArchitectureEvolver({
                populationSize: 5,
                mutationRate: 0.3
            });

            expect(evolver.config.populationSize).toBe(5);
            expect(evolver.config.mutationRate).toBe(0.3);
        });
    });

    describe('Configuration', () => {
        it('should store configuration', async () => {
            const evolver = new ArchitectureEvolver({ 
                populationSize: 3,
                elitismRate: 0.25
            });

            expect(evolver.config.populationSize).toBe(3);
            expect(evolver.config.elitismRate).toBe(0.25);
        });
    });

    describe('Evolution', () => {
        it('should track generation', async () => {
            const evolver = new ArchitectureEvolver({
                populationSize: 4,
                mutationRate: 0.5
            });

            expect(evolver.generation).toBe(0);
        });
    });
});
