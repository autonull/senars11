/**
 * @file TestNAR.js
 * @description Simple test framework for NAR functionality
 */

import {TaskMatch} from './TaskMatch.js';
import {Logger} from '../util/Logger.js';

// Re-export TaskMatch as before to maintain backward compatibility
//export { SharedTaskMatch as TaskMatch };
export {TaskMatch as TaskMatch};

/**
 * Simplified test framework for NAR
 */
export class TestNAR {
    constructor(trace = false) {
        this.operations = [];
        this.nar = null;
        this.trace = trace; // Add trace flag to show all events
        this.eventLog = []; // Log of all events for debugging
        this.logger = Logger;
    }

    static _matchesTruth(taskTruth, criteriaTruth) {
        if (!taskTruth) return false;
        return (!criteriaTruth.minFreq || taskTruth.f >= criteriaTruth.minFreq) &&
            (!criteriaTruth.minConf || taskTruth.c >= criteriaTruth.minConf);
    }

    getNAR() {
        return this.nar;
    }

    input(termStr, freq = 0.9, conf = 0.9) {
        this.operations.push({type: 'input', termStr, freq, conf});
        return this;
    }

    run(cycles = 1) {
        this.operations.push({type: 'run', cycles});
        return this;
    }

    expect(termStr) {
        // If termStr is already a TaskMatch instance, use it directly
        // Otherwise, create a new TaskMatch with the provided term string
        const matcher = termStr instanceof TaskMatch ? termStr : new TaskMatch(termStr);
        this.operations.push({type: 'expect', matcher, shouldExist: true});
        return this;
    }

    expectNot(termStr) {
        // If termStr is already a TaskMatch instance, use it directly
        // Otherwise, create a new TaskMatch with the provided term string
        const matcher = termStr instanceof TaskMatch ? termStr : new TaskMatch(termStr);
        this.operations.push({type: 'expect', matcher, shouldExist: false});
        return this;
    }

    inspect(callback) {
        this.operations.push({type: 'inspect', callback});
        return this;
    }

    // Provide convenience methods for consistent API
    expectWithPunct(termStr, punct) {
        return this.expect(new TaskMatch(termStr).withPunctuation(punct));
    }

    expectWithTruth(termStr, minFreq, minConf) {
        return this.expect(new TaskMatch(termStr).withTruth(minFreq, minConf));
    }

    expectWithFlexibleTruth(termStr, expectedFreq, expectedConf, tolerance) {
        return this.expect(new TaskMatch(termStr).withFlexibleTruth(expectedFreq, expectedConf, tolerance));
    }

    async execute() {
        // Dynamically import NAR to avoid circular dependencies
        const {NAR} = await import('../nar/NAR.js');

        // Use optimized config for tests to improve performance
        const config = {
            performance: {
                useOptimizedCycle: true,
                cycle: {
                    maxTaskCacheSize: 1000, // Keep at default or reasonable value
                    maxInferenceCacheSize: 500, // Keep at reasonable value
                    batchProcessingEnabled: false // Disable batching for simpler test flow
                }
            },
            reasoning: {
                maxCombinations: 10, // Minimal for tests - reduced from 25
                maxRuleApplications: 20, // Minimal for tests - reduced from 50  
                maxTasksPerBatch: 3, // Smaller batches - reduced from 5

                cpuThrottleInterval: 0,
                maxDerivationDepth: 3 // Reduced from 5
            },
            cycle: {
                delay: 1 // Minimum delay to pass validation but still optimized for tests
            }
        };

        this.nar = new NAR(config);
        if (this.trace) {
            this.nar.traceEnabled = true;
            this.nar.on('reasoning.derivation', (data) => {
                this.logger.info(`[TRACE] Derivation: ${data.derivedTask.toString()} from ${data.derivedTask.stamp?.source || data.source}`);
            });
            this.nar.on('task.input', (data) => {
                this.logger.info(`[TRACE] Input: ${data.task.toString()}`);
            });
        }

        try {
            await this.nar.initialize(); // Initialize the NAR to ensure components are set up

            // Process operations first
            const expectations = [];

            for (const op of this.operations) {
                switch (op.type) {
                    case 'input':
                        try {
                            // Format input with truth values: "term. %freq;conf%"
                            const inputStr = `${op.termStr}. %${op.freq};${op.conf}%`;
                            await this.nar.input(inputStr);
                        } catch (error) {
                            this.logger?.warn(`Input failed: ${op.termStr}`, error);
                        }
                        break;

                    case 'run':
                        // For stream reasoner, run iterative steps with enhanced processing
                        for (let i = 0; i < op.cycles; i++) {
                            await this.nar.step();
                        }
                        break;

                    case 'expect':
                        expectations.push(op);
                        break;

                    case 'inspect':
                        // Store inspection callbacks to be executed later
                        // We don't execute them here because we want to run them after all reasoning cycles
                        break;
                }
            }

            // Run additional reasoning cycles after all inputs to allow for inference
            // Execute multiple steps to make sure processing happens
            if (this.nar.streamReasoner) {
                for (let i = 0; i < 50; i++) {  // Run additional steps to allow for derivations
                    await this.nar.step();
                }
            }

            // Collect tasks emitted by the system
            let collectedTasks = [];

            // Get tasks from memory and focus
            if (this.nar.memory) {
                collectedTasks = this.nar.memory.getAllConcepts().flatMap(c => c.getAllTasks());
            }

            // Also check focus for tasks that might not be in memory yet
            if (this.nar._focus) {
                const focusTasks = this.nar._focus.getTasks(1000);
                collectedTasks = [...collectedTasks, ...focusTasks];
            }

            // Get all tasks from memory and focus to catch derived results
            let allTasks = [...collectedTasks]; // Start with collected tasks

            // Also get tasks from memory and focus to ensure nothing is missed
            if (this.nar.memory) {
                const memoryTasks = this.nar.memory.getAllConcepts().flatMap(c => c.getAllTasks());
                allTasks = [...allTasks, ...memoryTasks];
            }

            // Also check focus for tasks that might not be in memory yet
            if (this.nar._focus) {
                const focusTasks = this.nar._focus.getTasks(1000);
                allTasks = [...allTasks, ...focusTasks];
            }

            // Remove duplicates based on term and stamp
            const uniqueTasks = [];
            const seen = new Set();

            for (const task of allTasks) {
                const key = task.term?.toString() + (task.stamp?.id || '');
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueTasks.push(task);
                }
            }

            allTasks = uniqueTasks;

            // Execute inspection callbacks
            for (const op of this.operations) {
                if (op.type === 'inspect' && typeof op.callback === 'function') {
                    try {
                        await op.callback(this.nar, allTasks);
                    } catch (error) {
                        throw new Error(`Inspection failed: ${error.message}`);
                    }
                }
            }

            // Validate expectations
            for (const exp of expectations) {
                const {matcher, shouldExist} = exp;

                let found = false;
                for (const task of allTasks) {
                    if (await matcher.matches(task)) {
                        found = true;
                        break;
                    }
                }

                if ((shouldExist && !found) || (!shouldExist && found)) {
                    const taskList = allTasks.length
                        ? allTasks.map(t => `  - ${t.toString()}`).join('\n')
                        : '  (None)';

                    throw new Error(`
          ==================== TEST FAILED ====================
          Expectation: ${shouldExist ? 'FIND' : 'NOT FIND'} a task matching criteria.
          Criteria: Term="${matcher.termFilter}", MinFreq="${matcher.minFreq}", MinConf="${matcher.minConf}"

          ----- All Tasks (${allTasks.length}) -----
${taskList}
          ---------------------------------------------------
        `);
                }
            }
        } finally {
            // Properly dispose of the NAR to avoid Jest teardown issues
            if (this.nar) {
                try {
                    await this.nar.dispose();
                } catch (disposeError) {
                    // Log disposal errors but don't fail the test
                    this.logger.warn('Warning during NAR disposal:', {message: disposeError.message});
                }
            }
        }

        return true;
    }


}