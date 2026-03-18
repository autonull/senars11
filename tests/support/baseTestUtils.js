import {NAR} from '../../core/src/nar/NAR.js';
import {Task} from '../../core/src/task/Task.js';
import {Truth} from '../../core/src/Truth.js';
import {TermFactory} from '../../core/src/term/TermFactory.js';
import {ReasonerBuilder} from '../../core/src/reason/ReasonerBuilder.js';
import {createTask, createTerm, createTruth, TEST_CONSTANTS} from './factories.js';
import {ComponentTestSetup, NARTestSetup} from './setup.js';
import {truthAssertions} from './assertions.js';

const termFactory = new TermFactory();

export {NARTestSetup, ComponentTestSetup, truthAssertions};

export const taskAssertions = {
    expectTask: (task, expected) => {
        ['term', 'type', 'truth', 'budget', 'stamp'].forEach(prop =>
            expected?.[prop] && expect(task?.[prop]).toEqual(expected[prop])
        );
    },

    expectTaskType: (task, type) => {
        const method = {BELIEF: 'isBelief', GOAL: 'isGoal', QUESTION: 'isQuestion'}[type.toUpperCase()];
        if (!method) throw new Error(`Unknown task type: ${type}`);
        expect(task[method]()).toBe(true);
    },

    expectTaskPunctuation: (task, punctuation) => {
        const expectedType = {'.': 'BELIEF', '!': 'GOAL', '?': 'QUESTION'}[punctuation] ?? '';
        expect(task?.punctuation).toBe(punctuation);
        expect(task?.type).toBe(expectedType);
    },

    findTaskByTerm: (tasks, searchTerm) => {
        const lower = searchTerm?.toLowerCase();
        return tasks?.find(t =>
            t?.term?.toString()?.toLowerCase()?.includes(lower) ||
            t?.term?.name?.toLowerCase()?.includes(lower)
        );
    }
};

export const flexibleAssertions = {
    expectCloseTo: (actual, expected, tolerance = 0.01) =>
        expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance),

    expectInRange: (actual, min, max) => {
        expect(actual).toBeGreaterThanOrEqual(min);
        expect(actual).toBeLessThanOrEqual(max);
    },

    expectAtLeast: (collection, minCount) => {
        const count = Array.isArray(collection) ? collection.length :
            collection?.size ?? collection?.length ?? Object.keys(collection || {}).length;
        expect(count).toBeGreaterThanOrEqual(minCount);
    },

    expectObjectContainingFlexible: (actual, expectedSubset, tolerance = 0.01) => {
        Object.entries(expectedSubset ?? {}).forEach(([key, expectedValue]) => {
            if (typeof expectedValue === 'number' && typeof actual?.[key] === 'number') {
                expect(Math.abs(actual[key] - expectedValue)).toBeLessThanOrEqual(tolerance);
            } else {
                expect(actual?.[key]).toEqual(expectedValue);
            }
        });
    },

    expectWithinPercentage: (actual, expected, percentage = 5) => {
        const tolerance = Math.abs(expected * percentage / 100);
        expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
    },

    expectStructureMatches: (actual, template) => {
        Object.keys(template).forEach(key => expect(actual).toHaveProperty(key));
    },

    expectOneOf: (actual, validValues) =>
        expect(validValues).toContainEqual(actual)
};

export const memoryAssertions = {
    expectConceptContains: (concept, expectedTerm) => {
        expect(concept).toBeDefined();
        expect(concept?.term).toBeDefined();
        expect(concept?.term?.toString()?.toLowerCase()).toContain(expectedTerm?.toLowerCase());
    },

    expectMemoryConcepts: (memory, expectedCount) =>
        expect(memory?.getAllConcepts()?.length ?? 0).toBe(expectedCount),

    expectMemoryContainsTerm: (memory, termName) => {
        const concepts = memory?.getAllConcepts() ?? [];
        const match = concepts.find(c =>
            c?.term?.toString()?.toLowerCase()?.includes(termName?.toLowerCase())
        );
        expect(match).toBeDefined();
    }
};

const testImmutableProperty = (instance) => {
    const testProp = Object.keys(instance).find(key =>
        key.startsWith('_') || ['f', 'c', 'term'].includes(key)
    );
    if (testProp && instance[testProp] !== undefined) {
        expect(() => {
            instance[testProp] = 'modified';
        }).toThrow();
    }
};

export const initializationTests = {
    standardInitialization: (Constructor, requiredParams, defaultValues = {}) => {
        test('initializes with required parameters', () => {
            const instance = new Constructor(requiredParams);
            expect(instance).toBeDefined();
            Object.entries(defaultValues).forEach(([key, value]) =>
                value !== undefined && expect(instance[key]).toEqual(value)
            );
        });

        test('is immutable where applicable', () => {
            const instance = new Constructor(requiredParams);
            instance._isImmutable === true && testImmutableProperty(instance);
        });
    },

    parameterizedInitialization: (Constructor, validParamsList) =>
        test.each(validParamsList.map((params, i) => [i, params]))(
            'initializes correctly with params set %i',
            (_, params) => expect(new Constructor(params)).toBeDefined()
        )
};

export const equalityTests = {
    standardEquality: (instance, equalInstance, differentInstance) => {
        test('equals method works for identical instances', () => {
            expect(instance.equals(equalInstance)).toBe(true);
            expect(equalInstance.equals(instance)).toBe(true);
        });

        differentInstance && test('equals method returns false for different instances', () => {
            expect(instance.equals(differentInstance)).toBe(false);
            expect(differentInstance.equals(instance)).toBe(false);
        });

        test('equals method returns false for null/undefined', () => {
            expect(instance.equals(null)).toBe(false);
            expect(instance.equals(undefined)).toBe(false);
        });
    },

    runEqualityLaws: (objA, objB, objC) => {
        expect(objA.equals(objA)).toBe(true);
        objA.equals(objB) && expect(objB.equals(objA)).toBe(true);
        objA.equals(objB) && objB.equals(objC) && expect(objA.equals(objC)).toBe(true);
    }
};

export const stringRepresentationTests = {
    verifyToString: (instance, expectedString) =>
        expect(instance.toString()).toBe(expectedString),

    verifyToStringConsistency: (instance, expectedPattern) => {
        const str = instance.toString();
        expect(str).toMatch(expectedPattern);
        expect(instance.toString()).toBe(str);
    }
};

export const errorHandlingTests = {
    standardErrorHandling: (testFunction, invalidInputs, errorType = Error) =>
        test.each(invalidInputs.map(input => [input]))(
            'throws error for invalid input: %s',
            (invalidInput) => expect(() => testFunction?.(invalidInput)).toThrow(errorType)
        ),

    asyncErrorHandling: async (testFunction, invalidInputs, errorType = Error) => {
        for (const invalidInput of invalidInputs) {
            await expect(testFunction?.(invalidInput)).rejects.toThrow(errorType);
        }
    },

    errorWithMessage: (testFunction, invalidInput, expectedMessage) =>
        expect(() => testFunction?.(invalidInput)).toThrow(expectedMessage)
};

export const asyncTests = {
    asyncWithTimeout: async (asyncOperation, timeoutMs = 5000) => {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Test timeout')), timeoutMs)
        );
        return Promise.race([asyncOperation(), timeout]);
    },

    expectPromiseResolved: async (promise) =>
        await expect(promise).resolves.toBeDefined(),

    expectPromiseRejected: async (promise) =>
        await expect(promise).rejects.toBeDefined()
};

export const COMMON_TRUTH_VALUES = [
    {f: 1.0, c: 1.0, name: 'certain'},
    {f: 0.9, c: 0.9, name: 'high'},
    {f: 0.5, c: 0.8, name: 'medium'},
    {f: 0.1, c: 0.2, name: 'low'},
    {f: 0.0, c: 0.1, name: 'false'}
];

export const COMMON_BUDGET_VALUES = [
    {priority: 0.9, durability: 0.8, quality: 0.7, name: 'high'},
    {priority: 0.5, durability: 0.5, quality: 0.5, name: 'medium'},
    {priority: 0.1, durability: 0.2, quality: 0.3, name: 'low'}
];

export const testData = {
    getCommonTruthValues: () => COMMON_TRUTH_VALUES,
    getCommonBudgetValues: () => COMMON_BUDGET_VALUES,
    getCommonTermNames: () => ['cat', 'dog', 'animal', 'person', 'object', 'concept', 'thing', 'item'],
    getCommonCompoundTerms: () => [
        ['(&, A, B)', '&', ['A', 'B']],
        ['(|, A, B)', '|', ['A', 'B']],
        ['(-->, A, B)', '-->', ['A', 'B']],
        ['(<->, A, B)', '<->', ['A', 'B']]
    ]
};

const getStorageByType = (nar, type) => ({
    belief: () => nar.getBeliefs(),
    goal: () => nar.getGoals(),
    question: () => nar.getQuestions()
}[type.toLowerCase()] ?? (() => {
    throw new Error(`Unknown expected type: ${type}`);
}))();

export const narTestScenarios = {
    testBasicInputProcessing: async (nar, input, expectedType) => {
        expect(await nar.input(input)).toBe(true);
        const storage = getStorageByType(nar, expectedType);
        expect(storage.length).toBeGreaterThan(0);
        const task = storage.find(t =>
            t.term.toString().includes(input.replace(/[^\w\s]/g, '')) ||
            t.term.toString().includes(input.split(/[^\w]/)[0])
        );
        expect(task).toBeDefined();
        expect(task.type).toBe(expectedType.toUpperCase());
    },

    testCompoundTermProcessing: async (nar, input) => {
        expect(await nar.input(input)).toBe(true);
        const compoundBelief = nar.getBeliefs().find(b =>
            ['&', '|', '-->', '==>'].some(op => b.term.toString().includes(op))
        );
        expect(compoundBelief).toBeDefined();
    },

    testSystemLifecycle: async (nar) => {
        expect(nar.isRunning).toBe(false);
        expect(nar.start()).toBe(true);
        expect(nar.isRunning).toBe(true);
        expect(nar.stop()).toBe(true);
        expect(nar.isRunning).toBe(false);

        await nar.input('test.');
        expect(nar.getBeliefs().length).toBeGreaterThan(0);
        nar.reset();
        expect(nar.getBeliefs().length).toBe(0);
    }
};

export const waitForCondition = async (condition, timeoutMs = 1000, intervalMs = 10) =>
    new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            try {
                if (condition()) {
                    clearInterval(interval);
                    resolve();
                }
            } catch (error) {
                clearInterval(interval);
                reject(new Error(`Error in condition check: ${error.message}`));
            }
        }, intervalMs);

        setTimeout(() => {
            clearInterval(interval);
            reject(new Error(`Timeout waiting for condition after ${timeoutMs}ms`));
        }, timeoutMs);
    });

export const runPerformanceTest = async (testFn, maxDurationMs = 5000, description = 'Performance test') => {
    if (typeof testFn !== 'function') throw new Error('testFn must be a function');
    const startTime = Date.now();
    const result = await testFn();
    const duration = Date.now() - startTime;
    if (duration > maxDurationMs) {
        throw new Error(`Performance test "${description}" exceeded maximum duration: ${duration}ms > ${maxDurationMs}ms`);
    }
    return result;
};

export const parameterizedTests = {
    runWithParams: (testCases, testFn) =>
        test.each((testCases ?? []).map((testCase, i) => [i, testCase]))(
            'test case %i: %s',
            (_, testCase) => testFn(testCase)
        ),

    runAsyncWithParams: async (testCases, testFn) => {
        for (const [index, testCase] of (testCases ?? []).entries()) {
            await test(`${index}: ${JSON.stringify(testCase)}`, () => testFn(testCase));
        }
    }
};

export const comprehensiveTestSuites = {
    standardClassTests: (className, Constructor, requiredParams, defaultValues, testEquality = true, testImmutability = true) => {
        describe(`${className} Standard Class Tests`, () => {
            initializationTests.standardInitialization(Constructor, requiredParams, defaultValues);

            testEquality && describe('Equality Tests', () => {
                test('self equality', () => {
                    const instance = new Constructor(requiredParams);
                    expect(instance.equals(instance)).toBe(true);
                });

                test('null/undefined equality', () => {
                    const instance = new Constructor(requiredParams);
                    expect(instance.equals(null)).toBe(false);
                    expect(instance.equals(undefined)).toBe(false);
                });
            });

            testImmutability && test('immutability validation', () => {
                const instance = new Constructor(requiredParams);
                instance._isImmutable === true && testImmutableProperty(instance);
            });
        });
    },

    lifecycleComponentTests: (componentName, createComponent, config = {}) => {
        describe(`${componentName} Lifecycle Component Tests`, () => {
            let component;

            beforeEach(() => component = createComponent(config));
            afterEach(() => component?.destroy?.());

            test('initializes correctly', () => expect(component).toBeDefined());

            test('has required lifecycle methods', () => {
                expect(typeof component.start).toBe('function');
                expect(typeof component.stop).toBe('function');
                component.reset && expect(typeof component.reset).toBe('function');
            });
        });
    },

    inputOutputModuleTests: (moduleName, createModule, testCases) => {
        describe(`${moduleName} Input/Output Module Tests`, () => {
            let module;

            beforeEach(async () => module = await createModule());
            afterEach(() => module?.destroy?.());

            test.each(testCases)('$description', async ({input, expectedOutput, validator}) => {
                const result = await module.process(input);
                validator ? expect(validator(result, expectedOutput)).toBe(true) :
                    expect(result).toEqual(expectedOutput);
            });
        });
    },

    dataModelTests: (modelName, Constructor, testData) => {
        describe(`${modelName} Data Model Tests`, () => {
            test('should create instance with provided data', () => {
                const instance = new Constructor(testData.validInput);
                expect(instance).toBeDefined();
                Object.entries(testData.expectedProperties).forEach(([key, value]) =>
                    expect(instance[key]).toEqual(value)
                );
            });

            testData.expectedString && test('should have expected string representation', () =>
                expect(new Constructor(testData.validInput).toString()).toBe(testData.expectedString)
            );

            testData.immutable && test('should be immutable', () => {
                const instance = new Constructor(testData.validInput);
                const firstKey = Object.keys(instance)[0];
                firstKey && instance[firstKey] !== undefined &&
                expect(() => {
                    instance[firstKey] = 'modified';
                }).toThrow();
            });

            testData.testEquality && test('should implement equality correctly', () => {
                const instance1 = new Constructor(testData.validInput);
                const instance2 = new Constructor(testData.validInput);
                const instance3 = new Constructor(testData.differentInput || {});
                expect(instance1.equals(instance2)).toBe(true);
                testData.differentInput && expect(instance1.equals(instance3)).toBe(false);
            });
        });
    }
};

export const robustNARTests = {
    runWithFlexibleTiming: async (narOperation, maxDurationMs = 10000) => {
        const startTime = Date.now();
        const result = await narOperation();
        expect(Date.now() - startTime).toBeLessThanOrEqual(maxDurationMs);
        return result;
    },

    expectWithRetry: async (checkFn, maxRetries = 10, intervalMs = 100) => {
        for (let i = 0; i < maxRetries; i++) {
            try {
                await checkFn();
                return;
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
        }
    },

    findExpectedResult: (collection, matcherFn, description = 'Expected result') => {
        const result = Array.isArray(collection) ? collection.find(matcherFn) :
            Array.from(collection).find(matcherFn);
        if (!result) {
            const size = Array.isArray(collection) ? collection.length : collection.size;
            throw new Error(`Could not find ${description} in collection with ${size} items`);
        }
        return result;
    }
};

export const performanceOptimization = {
    testCache: new Map(),

    getCachedSetup: async (cacheKey, setupFn) => {
        if (performanceOptimization.testCache.has(cacheKey)) {
            return performanceOptimization.testCache.get(cacheKey);
        }
        const result = await setupFn();
        performanceOptimization.testCache.set(cacheKey, result);
        return result;
    },

    clearCache: () => performanceOptimization.testCache.clear(),

    batchProcess: async (items, processor, batchSize = 10) => {
        const results = [];
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            results.push(...await Promise.all(batch.map(processor)));
        }
        return results;
    },

    collectResults: async (operations) => Promise.all(operations.map(op => op())),

    findInCollectionOptimized: (collection, predicate) => {
        if (Array.isArray(collection)) return collection.find(predicate);
        if (collection?.[Symbol.iterator]) {
            for (const item of collection) {
                if (predicate(item)) return item;
            }
        } else if (collection?.forEach) {
            let result = null;
            collection.forEach(item => {
                result === null && predicate(item) && (result = item);
            });
            return result;
        }
        return null;
    }
};

export const optimizedTestPatterns = {
    createOptimizedNARSetup: (config = {}) => new class {
        constructor(cfg) {
            this.config = cfg;
            this.nar = null;
        }

        async setup() {
            this.nar = this.nar || new NAR(this.config);
            return this.nar;
        }

        async teardown() {
            await this.nar?.dispose?.();
            this.nar = null;
        }
    }(config),

    testDataGenerator: {
        truthCache: [],
        taskCache: [],

        getTruth: (f, c) => {
            const cached = optimizedTestPatterns.testDataGenerator.truthCache
                .find(t => Math.abs(t.f - f) < 0.001 && Math.abs(t.c - c) < 0.001);
            if (cached) return cached;
            const newTruth = new Truth(f, c);
            optimizedTestPatterns.testDataGenerator.truthCache.push(newTruth);
            return newTruth;
        },

        getTask: (config = {}) => {
            const term = config.term || createTerm('A');
            const punctuation = config.punctuation || '.';
            const truth = config.truth || (punctuation !== '?' ?
                optimizedTestPatterns.testDataGenerator.getTruth(0.9, 0.8) : null);
            const budget = config.budget || TEST_CONSTANTS.BUDGET.DEFAULT;
            return new Task({term, punctuation, truth, budget});
        }
    }
};

export const testImmutability = (instance, properties) => {
    if (!instance || typeof instance !== 'object') throw new Error('instance must be an object');
    if (!properties || typeof properties !== 'object') throw new Error('properties must be an object');
    Object.entries(properties).forEach(([propertyName, value]) =>
        expect(() => {
            instance[propertyName] = value;
        }).toThrow()
    );
};

export const setupMemoryTest = () => {
    const config = createMemoryConfig();
    return {config, createTask, createTerm, createTruth, TEST_CONSTANTS};
};

export function createTestTask(termStr, type = 'BELIEF', frequency = 0.9, confidence = 0.9, priority = 0.5) {
    let term, punctuation, truth = null;

    if (typeof termStr === 'object') {
        const config = termStr;
        term = config.term || createTerm('A');
        if (typeof term === 'string') term = termFactory.atomic(term);
        type = config.type || type;
        frequency = config.frequency ?? frequency;
        confidence = config.confidence ?? confidence;
        priority = config.priority ?? priority;
        punctuation = config.punctuation || (type === 'GOAL' ? '!' : type === 'QUESTION' ? '?' : '.');
    } else {
        term = typeof termStr === 'string' ? termFactory.atomic(termStr) : termStr;
        punctuation = type === 'GOAL' ? '!' : type === 'QUESTION' ? '?' : '.';
    }

    if (type !== 'QUESTION') truth = new Truth(frequency, confidence);

    return new Task({
        term,
        punctuation,
        truth,
        budget: {priority, durability: 0.7, quality: 0.8}
    });
}

export function createTestMemory(options = {}) {
    const tasks = options.tasks || [];
    return {
        taskBag: {
            tasks: Array.isArray(tasks) ? tasks : [],
            take() {
                return this.tasks.shift() || null;
            },
            add(task) {
                this.tasks.push(task);
            },
            size() {
                return this.tasks.length;
            }
        },
        addTask(task) {
            this.taskBag.add(task);
        },
        getTask() {
            return this.taskBag.take();
        }
    };
}

export function createTestTaskBag(tasks = []) {
    return {
        tasks,
        take() {
            return this.tasks.shift() || null;
        },
        add(task) {
            this.tasks.push(task);
        },
        size() {
            return this.tasks.length;
        },
        peek() {
            return this.tasks[0] || null;
        }
    };
}

export function createTestReasoner(options = {}) {
    const memory = options.memory || createTestMemory();
    const focus = options.focus || {
        getTasks: () => [],
        addTaskToFocus: () => {
        }
    };
    const context = {focus, memory, termFactory: options.termFactory || new TermFactory()};

    const builder = new ReasonerBuilder(context).withConfig(options.config || {});

    options.premiseSource && builder.withPremiseSource(options.premiseSource);
    options.strategy && builder.withStrategy(options.strategy);
    options.ruleProcessor && builder.withRuleProcessor(options.ruleProcessor);

    return builder.build();
}