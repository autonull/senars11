import {ArrayStamp, TermFactory, Task, Truth, TaskManager, Memory, Focus} from '@senars/nar';

const termFactory = new TermFactory();

// Cache common test constants to avoid recreating them
const CACHED_BUDGET_DEFAULT = Object.freeze({priority: 0.5, durability: 0.5, quality: 0.5, cycles: 100, depth: 10});
const CACHED_BUDGET_MEDIUM = Object.freeze({priority: 0.7, durability: 0.6, quality: 0.7, cycles: 75, depth: 7});
const CACHED_BUDGET_HIGH = Object.freeze({priority: 0.9, durability: 0.8, quality: 0.9, cycles: 100, depth: 10});
const CACHED_BUDGET_LOW = Object.freeze({priority: 0.3, durability: 0.4, quality: 0.3, cycles: 25, depth: 3});

const CACHED_TRUTH_HIGH = Object.freeze({f: 0.9, c: 0.8});
const CACHED_TRUTH_MEDIUM = Object.freeze({f: 0.7, c: 0.6});
const CACHED_TRUTH_LOW = Object.freeze({f: 0.3, c: 0.4});

export const TEST_CONSTANTS = {
    BUDGET: {
        DEFAULT: CACHED_BUDGET_DEFAULT,
        MEDIUM: CACHED_BUDGET_MEDIUM,
        HIGH: CACHED_BUDGET_HIGH,
        LOW: CACHED_BUDGET_LOW
    },
    TRUTH: {
        HIGH: CACHED_TRUTH_HIGH,
        MEDIUM: CACHED_TRUTH_MEDIUM,
        LOW: CACHED_TRUTH_LOW
    }
};

export const createStamp = (overrides = {}) => {
    const defaults = {
        id: `test-id-${Math.random()}`,
        creationTime: Date.now(),
        source: 'INPUT',
        derivations: [],
    };
    return new ArrayStamp({...defaults, ...overrides});
};

export const createTerm = (name = 'A') => termFactory.atomic(name);

export const createCompoundTerm = (operator, components) => termFactory.create(operator, components);

export const createTruth = (f = 0.9, c = 0.8) => new Truth(f, c);

export const createTask = (overrides = {}) => {
    const defaults = {
        term: createTerm(),
        punctuation: '.',
        truth: null,
        budget: TEST_CONSTANTS.BUDGET.DEFAULT,
    };
    const taskData = {...defaults, ...overrides};

    if (['.', '!'].includes(taskData.punctuation) && taskData.truth === null) {
        taskData.truth = createTruth();
    }

    return new Task(taskData);
};

export const createMemoryConfig = () => ({
    priorityThreshold: 0.5,
    consolidationInterval: 10,
    priorityDecayRate: 0.9,
    maxConcepts: 1000,
    maxTasksPerConcept: 100,
    forgetPolicy: 'priority',
    activationDecayRate: 0.005,
    enableAdaptiveForgetting: true,
    memoryPressureThreshold: 0.8,
    resourceBudget: 10000,
    enableMemoryValidation: true,
    memoryValidationInterval: 30000
});

export const createTaskManager = (config = {}) => new TaskManager(config);

export const createMemory = (config = createMemoryConfig()) => new Memory(config);

export const createFocus = (config = {}) => new Focus(config);

export const createTestNAR = async (config = {}) => {
    const {NAR} = await import('../../core/src/nar/NAR.js');
    return new NAR(config);
};

export const createTestApp = async (config = {}) => {
    const {App} = await import('../../agent/src/app/App.js');
    const defaultConfig = {
        lm: {provider: 'transformers', modelName: 'mock-model', enabled: true},
        subsystems: {lm: true},
        ...config
    };
    return new App(defaultConfig);
};

export const createTestAgent = async (config = {}) => {
    const app = await createTestApp(config);
    const agent = await app.start({startAgent: true});
    return {app, agent, cleanup: async () => app.shutdown()};
};

export const createMockedLMAgent = async (responses = {}, config = {}) => {
    const {app, agent, cleanup} = await createTestAgent(config);
    const jest = await import('@jest/globals').then(m => m.jest);

    jest.spyOn(agent.lm, 'generateText').mockImplementation(async (prompt) => {
        for (const [pattern, response] of Object.entries(responses)) {
            if (prompt.includes(pattern)) return response;
        }
        return '';
    });

    return {app, agent, cleanup};
};

export const createStreamReasonerNAR = async (config = {}) => {
    const {NAR} = await import('../../core/src/nar/NAR.js');
    return new NAR({
        reasoning: {cpuThrottleInterval: 0, maxDerivationDepth: 5},
        cycle: {delay: 1},
        ...config
    });
};
