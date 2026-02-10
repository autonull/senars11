/**
 * Test utilities for reasoner components
 */

import {Task} from '../../src/task/Task.js';
import {Truth} from '../../src/Truth.js';
import {TermFactory} from '../../src/term/TermFactory.js';

const termFactory = new TermFactory();

/**
 * Creates a test task with specified parameters
 * @param {string|Object} termStr - Term string or task configuration object
 * @param {string} type - Task type (BELIEF, GOAL, QUESTION)
 * @param {number} frequency - Truth frequency (0-1)
 * @param {number} confidence - Truth confidence (0-1)
 * @param {number} priority - Task priority (0-1)
 * @returns {Task} A test task instance
 */
export function createTestTask(termStr, type = 'BELIEF', frequency = 0.9, confidence = 0.9, priority = 0.5) {
    let term, punctuation, truth = null;

    if (typeof termStr === 'object') {
        // Handle the case where a configuration object is passed
        const config = termStr;
        term = config.term || 'A';
        type = config.type || type;
        frequency = config.frequency !== undefined ? config.frequency : frequency;
        confidence = config.confidence !== undefined ? config.confidence : confidence;
        priority = config.priority !== undefined ? config.priority : priority;
        punctuation = config.punctuation || (type === 'GOAL' ? '!' : type === 'QUESTION' ? '?' : '.');
    } else {
        // Handle the case where a string is passed
        term = termStr;
        punctuation = type === 'GOAL' ? '!' : type === 'QUESTION' ? '?' : '.';
    }

    // Create a proper Term object using TermFactory
    const termObj = typeof term === 'string' ? termFactory.atomic(term) : term;

    // Questions don't have truth values, so only create truth for BELIEF and GOAL
    if (type !== 'QUESTION') {
        truth = new Truth(frequency, confidence);
    }

    const budget = {
        priority,
        durability: 0.7,
        quality: 0.8
    };

    return new Task({
        term: termObj,
        punctuation,
        truth,
        budget
    });
}

/**
 * Creates a test memory-like object for testing
 * @param {Object} options - Configuration options for the test memory
 * @returns {Object} A mock memory object
 */
export function createTestMemory(options = {}) {
    const tasks = options.tasks || [];

    return {
        taskBag: {
            tasks: Array.isArray(tasks) ? tasks : [],
            take: function () {
                return this.tasks.shift() || null;
            },
            add: function (task) {
                this.tasks.push(task);
            },
            size: function () {
                return this.tasks.length;
            }
        },
        addTask: function (task) {
            this.taskBag.add(task);
        },
        getTask: function () {
            return this.taskBag.take();
        }
    };
}

/**
 * Creates a test task bag for testing
 * @param {Array} tasks - Array of tasks to include in the bag
 * @returns {Object} A mock task bag object
 */
export function createTestTaskBag(tasks = []) {
    return {
        tasks: tasks,
        take: function () {
            return this.tasks.shift() || null;
        },
        add: function (task) {
            this.tasks.push(task);
        },
        size: function () {
            return this.tasks.length;
        },
        peek: function () {
            return this.tasks[0] || null;
        }
    };
}

export default {
    createTestTask,
    createTestMemory,
    createTestTaskBag
};