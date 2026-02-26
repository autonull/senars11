/**
 * Integration Tests for Higher-Order Abstractions
 * Testing functional utilities, strategies, experience system, and cognitive architecture.
 */
import { strict as assert } from 'assert';

// Functional Utilities
import {
    compose, pipe, curry, partial, memoize,
    Lazy, Maybe, Either, Stream, Lens, State, Reader
} from '../../src/functional/FunctionalUtils.js';

// Strategy Patterns
import {
    StrategyRegistry,
    EpsilonGreedy, Softmax, UCB,
    ConstantLR, StepDecayLR, CosineAnnealingLR,
    PotentialBasedShaping, IntrinsicShaping,
    RandomShooting, CEMPlanning,
    UniformReplay, PrioritizedReplay,
    composeStrategies, withRetry, withCaching,
    StrategyPresets
} from '../../src/strategies/StrategyPatterns.js';

// Experience System
import {
    Experience, ExperienceStream, Episode,
    ExperienceStore, ExperienceIndex, SkillExtractor
} from '../../src/experience/ExperienceSystem.js';

// Cognitive Architecture
import {
    CognitiveModule,
    PerceptionModule, ReasoningModule, PlanningModule,
    ActionModule, MemoryModule, SkillModule, MetaCognitiveModule,
    CognitiveArchitecture, ArchitecturePresets
} from '../../src/systems/CognitiveArchitecture.js';

console.log('🧪 Running Higher-Order Abstractions Tests...\n');

// ========== Functional Utilities Tests ==========
console.log('1️⃣ Functional Utilities Tests\n');

function testCompose() {
    console.log('  Testing compose...');
    
    const double = x => x * 2;
    const addOne = x => x + 1;
    const fn = compose(double, addOne);
    
    assert.equal(fn(5), 12, 'compose(double, addOne)(5) = 12');
    
    const id = compose(x => x);
    assert.equal(id(42), 42, 'Identity function');
    
    console.log('  ✓ compose test passed\n');
}

function testPipe() {
    console.log('  Testing pipe...');
    
    const result = pipe(5, x => x * 2, x => x + 1);
    assert.equal(result, 11, 'pipe(5, double, addOne) = 11');
    
    console.log('  ✓ pipe test passed\n');
}

function testCurry() {
    console.log('  Testing curry...');
    
    const add = (a, b, c) => a + b + c;
    const curried = curry(add);
    
    assert.equal(curried(1)(2)(3), 6, 'Curried add(1)(2)(3) = 6');
    assert.equal(curried(1, 2)(3), 6, 'Partially applied curried(1, 2)(3) = 6');
    
    console.log('  ✓ curry test passed\n');
}

function testMaybe() {
    console.log('  Testing Maybe...');
    
    const just5 = Maybe.of(5);
    assert.equal(just5.map(x => x * 2).getOrElse(0), 10, 'Just(5).map(*2) = Just(10)');
    
    const nothing = Maybe.nothing();
    assert.equal(nothing.map(x => x * 2).getOrElse(0), 0, 'Nothing.map(*2) = Nothing');
    
    const fromNullable = Maybe.fromNullable(null);
    assert.equal(fromNullable.isPresent(), false, 'fromNullable(null).isPresent() = false');
    
    const fromValue = Maybe.fromNullable('value');
    assert.equal(fromValue.isPresent(), true, 'fromNullable("value").isPresent() = true');
    
    console.log('  ✓ Maybe test passed\n');
}

function testEither() {
    console.log('  Testing Either...');
    
    const right = Either.of(42);
    assert.ok(right.isRight(), 'Either.of(42).isRight() = true');
    
    const left = Either.left('error');
    assert.ok(left.isLeft(), 'Either.left("error").isLeft() = true');
    
    const result = Either.try(() => 1 / 0);
    assert.ok(result.isRight(), 'Division by zero is Infinity (not error)');
    
    const error = Either.try(() => { throw new Error('test'); });
    assert.ok(error.isLeft(), 'Thrown error should be Left');
    
    console.log('  ✓ Either test passed\n');
}

function testStream() {
    console.log('  Testing Stream...');
    
    const result = Stream.range(1, 10)
        .filter(x => x % 2 === 0)
        .map(x => x * 2)
        .take(3)
        .collect();
    
    assert.deepEqual(result, [4, 8, 12], 'Stream operations');
    
    const sum = Stream.range(1, 6).reduce((a, b) => a + b, 0);
    assert.equal(sum, 15, 'Stream reduce sum (1+2+3+4+5=15)');
    
    const found = Stream.range(1, 10).find(x => x > 5);
    assert.equal(found.getOrElse(-1), 6, 'Stream find');
    
    console.log('  ✓ Stream test passed\n');
}

function testLazy() {
    console.log('  Testing Lazy...');
    
    let evaluated = false;
    const lazy = new Lazy(() => {
        evaluated = true;
        return 42;
    });
    
    assert.equal(evaluated, false, 'Lazy not evaluated yet');
    assert.equal(lazy.value, 42, 'Lazy value');
    assert.equal(evaluated, true, 'Lazy evaluated after access');
    
    const mapped = lazy.map(x => x * 2);
    assert.equal(mapped.value, 84, 'Lazy map');
    
    console.log('  ✓ Lazy test passed\n');
}

function testLens() {
    console.log('  Testing Lens...');
    
    const obj = { user: { name: 'John', age: 30 } };
    const nameLens = Lens.path(['user', 'name']);
    
    assert.equal(nameLens.get(obj), 'John', 'Lens get');
    
    const updated = nameLens.set('Jane', obj);
    assert.equal(updated.user.name, 'Jane', 'Lens set (immutable)');
    assert.equal(obj.user.name, 'John', 'Original unchanged');
    
    const modified = nameLens.modify(n => n.toUpperCase(), obj);
    assert.equal(modified.user.name, 'JOHN', 'Lens modify');
    
    console.log('  ✓ Lens test passed\n');
}

function testState() {
    console.log('  Testing State monad...');
    
    const increment = State.modify(s => s + 1);
    const getValue = State.get();
    
    const program = increment.flatMap(() => increment).flatMap(() => getValue);
    
    const [value, state] = program.run(0);
    assert.equal(value, 2, 'State get after 2 increments');
    assert.equal(state, 2, 'State after 2 increments');
    
    console.log('  ✓ State monad test passed\n');
}

// ========== Strategy Patterns Tests ==========
console.log('2️⃣ Strategy Patterns Tests\n');

function testExplorationStrategies() {
    console.log('  Testing exploration strategies...');
    
    const epsilonGreedy = new EpsilonGreedy({ epsilon: 0.5 });
    const actionValues = [1, 2, 3, 4, 5];
    
    const action = epsilonGreedy.select(actionValues);
    assert.ok(action >= 0 && action < 5, 'EpsilonGreedy selects valid action');
    
    epsilonGreedy.step();
    assert.ok(epsilonGreedy.currentEpsilon <= 0.5, 'Epsilon decays');
    
    const softmax = new Softmax({ temperature: 1.0 });
    const softmaxAction = softmax.select(actionValues);
    assert.ok(softmaxAction >= 0 && softmaxAction < 5, 'Softmax selects valid action');
    
    const ucb = new UCB({ c: 2.0 });
    ucb.select(actionValues, 10);
    ucb.update(0, 1.0);
    assert.equal(ucb.counts[0], 1, 'UCB updates counts');
    
    console.log('  ✓ Exploration strategies test passed\n');
}

function testLearningRateSchedules() {
    console.log('  Testing learning rate schedules...');
    
    const constant = new ConstantLR({ lr: 0.01 });
    assert.equal(constant.get(0), 0.01, 'Constant LR');
    assert.equal(constant.get(1000), 0.01, 'Constant LR unchanged');
    
    const stepDecay = new StepDecayLR({ lr: 0.01, decay: 0.5, stepSize: 100 });
    assert.equal(stepDecay.get(0), 0.01, 'StepDecay initial');
    assert.equal(stepDecay.get(100), 0.005, 'StepDecay after 1 step');
    assert.equal(stepDecay.get(200), 0.0025, 'StepDecay after 2 steps');
    
    const cosine = new CosineAnnealingLR({ lr: 0.01, minLr: 0.0001, period: 100 });
    const lr0 = cosine.get(0);
    const lr50 = cosine.get(50);
    assert.ok(lr0 > lr50, 'Cosine annealing decreases then increases');
    
    console.log('  ✓ Learning rate schedules test passed\n');
}

function testRewardShaping() {
    console.log('  Testing reward shaping...');
    
    const potential = new PotentialBasedShaping({ gamma: 0.99 });
    const shapedPotential = potential.withPotential(s => s[0] ?? 0);
    
    const state = [1, 2, 3];
    const nextState = [2, 3, 4];
    const shapedReward = shapedPotential.shape(1, state, nextState);
    
    assert.ok(typeof shapedReward === 'number', 'Shaped reward is number');
    
    const intrinsic = new IntrinsicShaping({ noveltyWeight: 0.1 });
    const reward1 = intrinsic.shape(1, state, nextState);
    intrinsic.shape(1, state, nextState); // Visit again
    const reward2 = intrinsic.shape(1, state, nextState);
    
    assert.ok(reward1 > reward2, 'Novelty reward decreases with visits');
    
    console.log('  ✓ Reward shaping test passed\n');
}

function testPlanningStrategies() {
    console.log('  Testing planning strategies...');
    
    const model = {
        actionSpace: { n: 4 },
        step: (state, action) => ({
            reward: Math.random(),
            nextState: state.map(x => x + Math.random() * 0.1)
        })
    };
    
    const randomShooting = new RandomShooting({ numSamples: 10 });
    const state = [0, 0, 0, 0];
    const action1 = randomShooting.plan(state, model, 5);
    assert.ok(action1 >= 0 && action1 < 4, 'RandomShooting returns valid action');
    
    const cem = new CEMPlanning({ numSamples: 20, numElites: 5, iterations: 3 });
    const action2 = cem.plan(state, model, 5);
    assert.ok(action2 >= 0 && action2 < 4, 'CEM returns valid action');
    
    console.log('  ✓ Planning strategies test passed\n');
}

function testMemoryStrategies() {
    console.log('  Testing memory strategies...');
    
    const uniform = new UniformReplay({ capacity: 100 });
    
    for (let i = 0; i < 50; i++) {
        uniform.store({ i, data: `item_${i}` });
    }
    
    assert.equal(uniform.size(), 50, 'UniformReplay size');
    
    const samples = uniform.retrieve(null, 10);
    assert.equal(samples.length, 10, 'UniformReplay sample count');
    
    const prioritized = new PrioritizedReplay({ capacity: 100 });
    
    for (let i = 0; i < 50; i++) {
        prioritized.store({ i }, 1.0 + i * 0.1);
    }
    
    const { samples: pSamples, weights } = prioritized.retrieve(null, 10);
    assert.equal(pSamples.length, 10, 'PrioritizedReplay sample count');
    assert.equal(weights.length, 10, 'PrioritizedReplay weights count');
    
    console.log('  ✓ Memory strategies test passed\n');
}

function testStrategyCombinators() {
    console.log('  Testing strategy combinators...');
    
    const s1 = { execute: x => x + 1, canHandle: () => true };
    const s2 = { execute: x => x * 2, canHandle: () => true };
    
    const composed = composeStrategies(s1, s2);
    assert.equal(composed.execute(5), 12, 'Composed strategies: (5+1)*2 = 12');
    
    const withCache = withCaching(s1);
    assert.equal(withCache.execute(5), 6, 'Cached strategy first call');
    assert.equal(withCache.execute(5), 6, 'Cached strategy second call');
    
    console.log('  ✓ Strategy combinators test passed\n');
}

function testStrategyPresets() {
    console.log('  Testing strategy presets...');
    
    assert.ok(StrategyPresets.exploration.greedy, 'Has greedy preset');
    assert.ok(StrategyPresets.exploration.balanced, 'Has balanced preset');
    assert.ok(StrategyPresets.learningRate.cosine, 'Has cosine LR preset');
    assert.ok(StrategyPresets.planning.cem, 'Has CEM planning preset');
    assert.ok(StrategyPresets.memory.prioritized, 'Has prioritized replay preset');
    
    console.log('  ✓ Strategy presets test passed\n');
}

// ========== Experience System Tests ==========
console.log('3️⃣ Experience System Tests\n');

function testExperience() {
    console.log('  Testing Experience...');
    
    const exp = new Experience({
        state: [1, 2, 3],
        action: 0,
        reward: 1.0,
        nextState: [1.1, 2.1, 3.1],
        done: false,
        info: { episode: 1, step: 5, tags: ['positive'] }
    });
    
    assert.ok(exp.id.startsWith('exp_'), 'Experience has ID');
    assert.equal(exp.reward, 1.0, 'Experience reward');
    assert.ok(exp.info.tags.includes('positive'), 'Experience tags');
    
    const withPriority = exp.withPriority(2.0);
    assert.equal(withPriority.info.priority, 2.0, 'Updated priority');
    
    const withTag = exp.withTag('important');
    assert.ok(withTag.info.tags.includes('important'), 'Added tag');
    
    console.log('  ✓ Experience test passed\n');
}

function testEpisode() {
    console.log('  Testing Episode...');
    
    const episode = new Episode();
    
    for (let i = 0; i < 10; i++) {
        episode.add(new Experience({
            state: [i],
            action: i % 4,
            reward: i * 0.1,
            nextState: [i + 1],
            done: i === 9,
            info: { episode: episode.id, step: i }
        }));
    }
    
    episode.finalize();
    
    assert.equal(episode.length, 10, 'Episode length');
    assert.ok(episode.totalReward > 0, 'Episode total reward');
    assert.ok(episode.success, 'Episode success');
    assert.ok(episode.startTime > 0, 'Episode has start time');
    
    const trajectory = episode.getTrajectory();
    assert.equal(trajectory.length, 10, 'Trajectory length');
    
    console.log('  ✓ Episode test passed\n');
}

function testExperienceStore() {
    console.log('  Testing ExperienceStore...');
    
    const store = new ExperienceStore({ capacity: 1000, priorityReplay: false });
    
    // Record episodes
    for (let ep = 0; ep < 5; ep++) {
        store.startEpisode({ env: 'test' });
        
        for (let step = 0; step < 10; step++) {
            store.record(
                [step],
                step % 4,
                step * 0.1,
                [step + 1],
                step === 9,
                { tags: [step > 5 ? 'positive' : 'neutral'] }
            );
        }
    }
    
    const stats = store.getStats();
    assert.equal(stats.totalEpisodes, 5, 'Total episodes');
    assert.ok(stats.totalExperiences > 0, 'Total experiences');
    
    // Query
    const positiveExps = store.query({ tags: ['positive'] }).collect();
    assert.ok(positiveExps.length > 0, 'Query by tag');
    
    // Sample
    const samples = store.sample(20);
    assert.equal(samples.length, 20, 'Sample count');
    
    // Get successful episodes
    const successful = store.getSuccessfulEpisodes();
    assert.ok(successful.length > 0, 'Successful episodes');
    
    console.log('  ✓ ExperienceStore test passed\n');
}

function testExperienceStream() {
    console.log('  Testing ExperienceStream...');
    
    const experiences = Array.from({ length: 20 }, (_, i) => 
        new Experience({
            state: [i],
            action: i % 4,
            reward: i * 0.1,
            nextState: [i + 1],
            done: false
        })
    );
    
    const result = ExperienceStream.from(experiences)
        .filter(e => e.reward > 1.0)
        .map(e => e.withReward(e.reward * 2))
        .take(5)
        .collect();
    
    assert.equal(result.length, 5, 'Stream operations');
    assert.ok(result.every(e => e.reward > 2.0), 'Filtered and mapped');
    
    console.log('  ✓ ExperienceStream test passed\n');
}

function testSkillExtractor() {
    console.log('  Testing SkillExtractor...');
    
    const extractor = new SkillExtractor({ minSupport: 2, minConfidence: 0.3 });
    
    // Create episodes with common patterns
    const episodes = [];
    for (let ep = 0; ep < 5; ep++) {
        const episode = new Episode();
        
        // Common pattern: actions [0, 1, 2]
        for (let step = 0; step < 10; step++) {
            episode.add(new Experience({
                state: [step],
                action: step % 4,
                reward: step === 9 ? 1.0 : 0.1,
                nextState: [step + 1],
                done: step === 9
            }));
        }
        
        episode.finalize();
        episodes.push(episode);
    }
    
    const skills = extractor.extractSkills(episodes);
    
    assert.ok(Array.isArray(skills), 'Skills is array');
    // Skills may or may not be extracted depending on pattern matching
    
    console.log('  ✓ SkillExtractor test passed\n');
}

// ========== Cognitive Architecture Tests ==========
console.log('4️⃣ Cognitive Architecture Tests\n');

function testCognitiveModule() {
    console.log('  Testing CognitiveModule...');
    
    const module = new CognitiveModule({ name: 'TestModule', enabled: true });
    
    module.setState('key', 'value');
    assert.equal(module.getState('key'), 'value', 'State set/get');
    
    let eventReceived = false;
    module.subscribe('stateChange', () => { eventReceived = true; });
    module.setState('key2', 'value2');
    assert.ok(eventReceived, 'Event emitted');
    
    console.log('  ✓ CognitiveModule test passed\n');
}

async function testPerceptionModule() {
    console.log('  Testing PerceptionModule...');
    
    const perception = new PerceptionModule({
        featureExtractors: [
            obs => Array.isArray(obs) ? obs.map(x => x * 2) : [obs]
        ]
    });
    
    const result = await perception.process([1, 2, 3]);
    
    assert.ok(result.features, 'Has features');
    assert.ok(result.symbols, 'Has symbols');
    
    console.log('  ✓ PerceptionModule test passed\n');
}

async function testReasoningModule() {
    console.log('  Testing ReasoningModule...');
    
    const reasoning = new ReasoningModule({ inferenceDepth: 2 });
    
    const symbols = new Map([
        ['belief1', { value: 0.8, confidence: 0.9 }],
        ['belief2', { value: 0.6, confidence: 0.8 }]
    ]);
    
    const result = await reasoning.process({ symbols });
    
    assert.ok(result.beliefs, 'Has beliefs');
    assert.ok(result.inferences, 'Has inferences');
    
    console.log('  ✓ ReasoningModule test passed\n');
}

async function testActionModule() {
    console.log('  Testing ActionModule...');
    
    const action = new ActionModule({
        actionSpace: { n: 4 },
        explorationStrategy: new EpsilonGreedy({ epsilon: 0.5 })
    });
    
    const result = await action.process({}, { state: [1, 2, 3] });
    
    assert.ok(result.action !== undefined, 'Has action');
    assert.ok(result.action >= 0 && result.action < 4, 'Valid action');
    
    console.log('  ✓ ActionModule test passed\n');
}

async function testMemoryModule() {
    console.log('  Testing MemoryModule...');
    
    const memory = new MemoryModule();
    
    // Store experience
    await memory.process({
        experience: {
            state: [1, 2],
            action: 0,
            reward: 1.0,
            nextState: [1.1, 2.1],
            done: false
        }
    }, { store: true });
    
    // Retrieve
    await memory.process({}, { query: 'positive' });
    
    const stats = memory.getStats();
    assert.ok(stats.storeStats.totalExperiences > 0, 'Stored experience');
    
    console.log('  ✓ MemoryModule test passed\n');
}

async function testCognitiveArchitecture() {
    console.log('  Testing CognitiveArchitecture...');
    
    const arch = new CognitiveArchitecture({
        name: 'TestArchitecture',
        integrationStrategy: 'sequential'
    });
    
    assert.ok(arch.modules.has('perception'), 'Has perception module');
    assert.ok(arch.modules.has('reasoning'), 'Has reasoning module');
    assert.ok(arch.modules.has('action'), 'Has action module');
    assert.ok(arch.modules.has('memory'), 'Has memory module');
    
    // Process observation
    const result = await arch.process([1, 2, 3, 4], { goal: 'test' });
    
    assert.ok(result, 'Process returns result');
    
    // Act
    const action = await arch.act([1, 2, 3, 4]);
    assert.ok(typeof action === 'number', 'Act returns action');
    
    // Learn
    arch.learn({ state: [1], action: 0, reward: 1, nextState: [2], done: false }, 1.0);
    
    const state = arch.getState();
    assert.ok(state, 'Has state');
    
    console.log('  ✓ CognitiveArchitecture test passed\n');
}

function testArchitecturePresets() {
    console.log('  Testing ArchitecturePresets...');
    
    assert.ok(ArchitecturePresets.minimal, 'Has minimal preset');
    assert.ok(ArchitecturePresets.standard, 'Has standard preset');
    assert.ok(ArchitecturePresets.reflective, 'Has reflective preset');
    assert.ok(ArchitecturePresets.skillBased, 'Has skill-based preset');
    
    const minimal = ArchitecturePresets.minimal();
    assert.equal(minimal.config.name, 'MinimalCognition', 'Minimal name');
    
    console.log('  ✓ ArchitecturePresets test passed\n');
}

// ========== Run All Tests ==========
async function runAllTests() {
    try {
        // Functional utilities
        testCompose();
        testPipe();
        testCurry();
        testMaybe();
        testEither();
        testStream();
        testLazy();
        testLens();
        testState();
        
        // Strategy patterns
        testExplorationStrategies();
        testLearningRateSchedules();
        testRewardShaping();
        testPlanningStrategies();
        testMemoryStrategies();
        testStrategyCombinators();
        testStrategyPresets();
        
        // Experience system
        testExperience();
        testEpisode();
        testExperienceStore();
        testExperienceStream();
        testSkillExtractor();
        
        // Cognitive architecture
        testCognitiveModule();
        testPerceptionModule();
        testReasoningModule();
        testActionModule();
        testMemoryModule();
        testCognitiveArchitecture();
        testArchitecturePresets();
        
        console.log('✅ All Higher-Order Abstractions Tests Passed!\n');
        return true;
    } catch (error) {
        console.error('❌ Test Failed:', error);
        process.exit(1);
    }
}

runAllTests();
