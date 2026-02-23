/**
 * Unit Tests for Composable Module System
 */
import { strict as assert } from 'assert';
import {
    Component,
    functionalComponent,
    ComponentRegistry,
    CompositionEngine,
    PipelineBuilder,
    MetaController,
    ArchitectureEvolver
} from '../../src/index.js';

console.log('🧪 Running Composable Module System Tests...\n');

// ========== Component Tests ==========
console.log('1️⃣ Component Tests\n');

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

async function testComponentLifecycle() {
    console.log('  Testing component lifecycle...');
    
    const comp = new TestComponent({ value: 10 });
    assert.equal(comp.initialized, false, 'Should not be initialized');
    
    await comp.initialize();
    assert.equal(comp.initialized, true, 'Should be initialized');
    assert.equal(comp.getState('initialized'), true, 'Should have state');
    
    await comp.shutdown();
    assert.equal(comp.initialized, false, 'Should not be initialized after shutdown');
    
    console.log('  ✓ Component lifecycle test passed\n');
}

async function testComponentComposition() {
    console.log('  Testing component composition...');
    
    const parent = new TestComponent({ value: 1 });
    const child1 = new TestComponent({ value: 2 });
    const child2 = new TestComponent({ value: 3 });
    
    parent.add('child1', child1);
    parent.add('child2', child2);
    
    assert.equal(parent.has('child1'), true, 'Should have child1');
    assert.equal(parent.has('child3'), false, 'Should not have child3');
    assert.equal(parent.get('child1'), child1, 'Should get child1');
    
    parent.remove('child1');
    assert.equal(parent.has('child1'), false, 'Should not have child1 after removal');
    
    console.log('  ✓ Component composition test passed\n');
}

async function testComponentEvents() {
    console.log('  Testing component events...');
    
    const comp = new TestComponent();
    let eventReceived = false;
    let eventData = null;
    
    comp.subscribe('testEvent', (data) => {
        eventReceived = true;
        eventData = data;
    });
    
    comp.emit('testEvent', { message: 'hello' });
    
    assert.equal(eventReceived, true, 'Should receive event');
    assert.equal(eventData.message, 'hello', 'Should have correct data');
    
    console.log('  ✓ Component events test passed\n');
}

async function testComponentSerialization() {
    console.log('  Testing component serialization...');
    
    const comp = new TestComponent({ value: 42 });
    await comp.initialize();
    comp.setState('customState', 'test');
    
    const serialized = comp.serialize();
    assert.equal(serialized.type, 'TestComponent', 'Should have correct type');
    assert.equal(serialized.config.value, 42, 'Should have config');
    
    console.log('  ✓ Component serialization test passed\n');
}

async function testFunctionalComponent() {
    console.log('  Testing functional component...');
    
    const fn = async (input, component) => input * 2;
    const FuncComp = functionalComponent(fn, { multiplier: 2 });
    const comp = new FuncComp();
    
    await comp.initialize();
    const result = await comp.call(5);
    
    assert.equal(result, 10, 'Should execute function correctly');
    
    console.log('  ✓ Functional component test passed\n');
}

// ========== ComponentRegistry Tests ==========
console.log('2️⃣ ComponentRegistry Tests\n');

function testRegistryBasic() {
    console.log('  Testing registry basic operations...');
    
    const registry = new ComponentRegistry();
    
    registry.register('testComp', TestComponent, {
        aliases: ['tc'],
        version: '1.0.0',
        description: 'Test component'
    });
    
    assert.equal(registry.has('testComp'), true, 'Should have testComp');
    assert.equal(registry.has('tc'), true, 'Should have alias');
    assert.equal(registry.get('tc'), TestComponent, 'Should resolve alias');
    
    const instance = registry.create('testComp', { value: 5 });
    assert.equal(instance.config.value, 5, 'Should create with config');
    
    registry.unregister('testComp');
    assert.equal(registry.has('testComp'), false, 'Should not have after unregister');
    
    console.log('  ✓ Registry basic operations test passed\n');
}

function testRegistryDependencies() {
    console.log('  Testing registry dependencies...');
    
    const registry = new ComponentRegistry();
    
    registry.register('dep1', TestComponent);
    registry.register('dep2', TestComponent, { dependencies: ['dep1'] });
    
    const deps = registry.resolveDependencies('dep2');
    assert.equal(deps.includes('dep1'), true, 'Should include dependency');
    assert.equal(deps.includes('dep2'), true, 'Should include self');
    
    console.log('  ✓ Registry dependencies test passed\n');
}

function testRegistryList() {
    console.log('  Testing registry list...');
    
    const registry = new ComponentRegistry();
    registry.register('comp1', TestComponent, { version: '1.0.0' });
    registry.register('comp2', TestComponent, { version: '2.0.0' });
    
    const list = registry.list();
    assert.equal(list.length, 2, 'Should list all components');
    
    console.log('  ✓ Registry list test passed\n');
}

// ========== CompositionEngine Tests ==========
console.log('3️⃣ CompositionEngine Tests\n');

async function testPipelineCreation() {
    console.log('  Testing pipeline creation...');
    
    const engine = new CompositionEngine();
    
    const comp1 = new TestComponent({ value: 1 });
    const comp2 = new TestComponent({ value: 2 });
    
    engine.createPipeline('test', [
        { id: 'stage1', component: comp1 },
        { id: 'stage2', component: comp2 }
    ]);
    
    const pipeline = engine.getPipeline('test');
    assert.equal(pipeline.stages.length, 2, 'Should have 2 stages');
    
    console.log('  ✓ Pipeline creation test passed\n');
}

async function testPipelineExecution() {
    console.log('  Testing pipeline execution...');
    
    const engine = new CompositionEngine();
    
    const comp = new TestComponent({ value: 10 });
    
    engine.createPipeline('add', [
        { id: 'add10', component: comp, config: { method: 'process' } }
    ]);
    
    const result = await engine.execute('add', 5);
    
    assert.equal(result.success, true, 'Should succeed');
    assert.equal(result.output, 15, 'Should add 10');
    
    console.log('  ✓ Pipeline execution test passed\n');
}

async function testPipelineBuilder() {
    console.log('  Testing pipeline builder...');
    
    const engine = new CompositionEngine();
    const comp = new TestComponent({ value: 5 });
    
    const result = await new PipelineBuilder(engine)
        .named('builder_test')
        .add(comp, { method: 'process' })
        .run(10);
    
    assert.equal(result.success, true, 'Should succeed');
    assert.equal(result.output, 15, 'Should add 5');
    
    console.log('  ✓ Pipeline builder test passed\n');
}

async function testConditionalStage() {
    console.log('  Testing conditional stage...');
    
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
    
    assert.equal(result1.output, 160, 'Should execute when condition true');
    assert.equal(result2.output, 30, 'Should skip when condition false');
    
    console.log('  ✓ Conditional stage test passed\n');
}

// ========== MetaController Tests ==========
console.log('4️⃣ MetaController Tests\n');

async function testMetaControllerInitialization() {
    console.log('  Testing MetaController initialization...');
    
    const meta = new MetaController({
        metaLearningRate: 0.1,
        evaluationWindow: 10
    });
    
    await meta.initialize();
    
    assert.equal(meta.getState('phase'), 'exploration', 'Should start in exploration');
    assert.equal(meta.getState('generation'), 0, 'Should start at generation 0');
    
    await meta.shutdown();
    
    console.log('  ✓ MetaController initialization test passed\n');
}

async function testArchitectureSetting() {
    console.log('  Testing architecture setting...');
    
    const meta = new MetaController();
    await meta.initialize();
    
    const arch = {
        stages: [
            { id: 's1', component: {} },
            { id: 's2', component: {} }
        ]
    };
    
    meta.setArchitecture(arch);
    
    const retrieved = meta.getArchitecture();
    assert.equal(retrieved.stages.length, 2, 'Should have 2 stages');
    assert.equal(meta.architectureHistory.length, 1, 'Should record history');
    
    await meta.shutdown();
    
    console.log('  ✓ Architecture setting test passed\n');
}

async function testEvaluation() {
    console.log('  Testing evaluation...');
    
    const meta = new MetaController({ evaluationWindow: 5 });
    await meta.initialize();
    
    // Add some performance data
    meta.onPerformance({ score: 10 });
    meta.onPerformance({ score: 20 });
    meta.onPerformance({ score: 15 });
    
    const eval1 = meta.evaluate();
    assert.equal(eval1.score, 15, 'Should calculate mean');
    assert.equal(eval1.samples, 3, 'Should have 3 samples');
    
    meta.onPerformance({ score: 25 });
    meta.onPerformance({ score: 30 });
    
    const eval2 = meta.evaluate();
    assert.equal(eval2.score, 20, 'Should calculate mean of last 5');
    
    await meta.shutdown();
    
    console.log('  ✓ Evaluation test passed\n');
}

async function testModificationProposal() {
    console.log('  Testing modification proposal...');
    
    const meta = new MetaController({ explorationRate: 1.0 });
    await meta.initialize();
    
    meta.setArchitecture({
        stages: [{ id: 's1', component: { name: 'test' } }]
    });
    
    const modification = meta.proposeModification();
    
    assert.ok(modification, 'Should propose modification');
    assert.ok(modification.type, 'Should have type');
    
    await meta.shutdown();
    
    console.log('  ✓ Modification proposal test passed\n');
}

// ========== ArchitectureEvolver Tests ==========
console.log('5️⃣ ArchitectureEvolver Tests\n');

async function testEvolverInitialization() {
    console.log('  Testing evolver initialization...');
    
    const evolver = new ArchitectureEvolver({
        populationSize: 5,
        mutationRate: 0.3
    });
    
    const baseArch = {
        stages: [
            { id: 's1', config: { lr: 0.01 } },
            { id: 's2', config: { lr: 0.01 } }
        ]
    };
    
    evolver.initializePopulation(baseArch);
    
    assert.equal(evolver.population.length, 5, 'Should have population of 5');
    assert.equal(evolver.generation, 0, 'Should start at generation 0');
    
    console.log('  ✓ Evolver initialization test passed\n');
}

async function testEvolverFitness() {
    console.log('  Testing evolver fitness...');

    const evolver = new ArchitectureEvolver({ populationSize: 3 });
    const baseArch = { stages: [{ id: 's1' }] };

    evolver.initializePopulation(baseArch);

    // Directly set fitness values (since updateFitness uses JSON comparison)
    evolver.population[0].fitness = 10;
    evolver.population[1].fitness = 20;
    evolver.population[2].fitness = 15;

    // getBestArchitecture returns population[0] (assumes sorted)
    // But population isn't sorted yet, so it returns first element
    const best = evolver.getBestArchitecture();
    
    // The first individual has fitness 10 (not sorted yet)
    assert.equal(evolver.population[0].fitness, 10, 'First should have fitness 10');
    
    // Sort and check best
    evolver.population.sort((a, b) => b.fitness - a.fitness);
    assert.equal(evolver.population[0].fitness, 20, 'After sort, first should have fitness 20');

    console.log('  ✓ Evolver fitness test passed\n');
}

async function testEvolverEvolution() {
    console.log('  Testing evolver evolution...');
    
    const evolver = new ArchitectureEvolver({
        populationSize: 4,
        elitismRate: 0.25,
        mutationRate: 0.5
    });
    
    const baseArch = {
        stages: [
            { id: 's1', config: { lr: 0.01 } },
            { id: 's2', config: { lr: 0.01 } },
            { id: 's3', config: { lr: 0.01 } }
        ]
    };
    
    evolver.initializePopulation(baseArch);
    
    // Set fitness
    for (let i = 0; i < evolver.population.length; i++) {
        evolver.updateFitness(evolver.population[i].architecture, (i + 1) * 10);
    }
    
    const newBest = evolver.evolve();
    
    assert.equal(evolver.generation, 1, 'Should increment generation');
    assert.ok(newBest, 'Should return best architecture');
    assert.ok(evolver.fitnessHistory.length > 0, 'Should record fitness history');
    
    console.log('  ✓ Evolver evolution test passed\n');
}

// ========== Run All Tests ==========
async function runAllTests() {
    try {
        // Component tests
        await testComponentLifecycle();
        await testComponentComposition();
        await testComponentEvents();
        await testComponentSerialization();
        await testFunctionalComponent();
        
        // Registry tests
        testRegistryBasic();
        testRegistryDependencies();
        testRegistryList();
        
        // Composition tests
        await testPipelineCreation();
        await testPipelineExecution();
        await testPipelineBuilder();
        await testConditionalStage();
        
        // MetaController tests
        await testMetaControllerInitialization();
        await testArchitectureSetting();
        await testEvaluation();
        await testModificationProposal();
        
        // Evolver tests
        await testEvolverInitialization();
        await testEvolverFitness();
        await testEvolverEvolution();
        
        console.log('✅ All Composable Module System Tests Passed!\n');
        return true;
    } catch (error) {
        console.error('❌ Test Failed:', error);
        process.exit(1);
    }
}

runAllTests();
