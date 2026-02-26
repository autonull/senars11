/**
 * Async iteration and stream processing utilities for the reasoner
 */

import { Logger } from '../../util/Logger.js';

/**
 * Create an async generator from an array with optional processing
 * @param {Array} array - Array to convert
 * @param {Function} processor - Optional processor function for each item
 * @returns {AsyncGenerator}
 */
export async function* asyncGeneratorFromArray(array, processor = null) {
    for (const item of array) {
        const processedItem = processor ? await processor(item) : item;
        yield processedItem;
    }
}

/**
 * Transform an async generator using a processing function
 * @param {AsyncGenerator} asyncGen - Source async generator
 * @param {Function} processor - Processor function
 * @returns {AsyncGenerator}
 */
export async function* transformAsyncGenerator(asyncGen, processor) {
    for await (const item of asyncGen) {
        const processedItem = await processor(item);
        if (processedItem !== null && processedItem !== undefined) {
            yield processedItem;
        }
    }
}

/**
 * Buffer an async generator with a maximum size and delay when full
 * @param {AsyncGenerator} asyncGen - Source async generator
 * @param {number} maxSize - Maximum buffer size
 * @param {number} delay - Delay when buffer is full
 * @returns {AsyncGenerator}
 */
export async function* bufferWithBackpressure(asyncGen, maxSize = 10, delay = 10) {
    const buffer = [];
    let generatorDone = false;
    let nextPromise = null;

    // Start the async generator
    const genPromise = asyncGen[Symbol.asyncIterator]();

    // Async function to get the next value from the generator
    const getNext = async () => {
        try {
            return await genPromise.next();
        } catch (error) {
            generatorDone = true;
            throw error;
        }
    };

    // Start fetching the first value
    nextPromise = getNext();

    while (!generatorDone) {
        // If buffer is below max size, try to add more items
        if (buffer.length < maxSize && !generatorDone) {
            try {
                const result = await Promise.race([nextPromise, new Promise(resolve => setTimeout(() => resolve(null), 1))]);

                if (result && result.done) {
                    generatorDone = true;
                } else if (result && !result.done) {
                    buffer.push(result.value);
                    // Start fetching the next value
                    nextPromise = getNext();
                } else {
                    // Timeout case: continue with what we have
                }
            } catch (error) {
                generatorDone = true;
            }
        }

        // If there are items in the buffer, yield them
        if (buffer.length > 0) {
            yield buffer.shift();
        } else if (!generatorDone) {
            // If no items in buffer and not done, wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // Yield any remaining items in buffer
    while (buffer.length > 0) {
        yield buffer.shift();
    }
}

/**
 * Merge multiple async generators into one
 * @param {Array<AsyncGenerator>} generators - Array of async generators to merge
 * @param {Function} selector - Function to select which generator to pull from next
 * @returns {AsyncGenerator}
 */
export async function* mergeAsyncGenerators(generators, selector = 'round-robin') {
    const iterators = generators.map(gen => gen[Symbol.asyncIterator]());
    const buffers = iterators.map(() => []);
    const active = iterators.map(() => true);
    let roundRobinIndex = 0;

    while (active.some(a => a)) {
        let yielded = false;

        // Select which iterator to pull from next
        let iteratorIndex;
        switch (selector) {
            case 'round-robin':
                // Find next active iterator
                iteratorIndex = -1;
                for (let i = 0; i < iterators.length; i++) {
                    const idx = (roundRobinIndex + i) % iterators.length;
                    if (active[idx]) {
                        iteratorIndex = idx;
                        roundRobinIndex = (idx + 1) % iterators.length;
                        break;
                    }
                }
                break;
            case 'first-available':
            default:
                iteratorIndex = active.findIndex(a => a === true);
                break;
        }

        if (iteratorIndex !== -1) {
            try {
                const result = await iterators[iteratorIndex].next();
                if (result.done) {
                    active[iteratorIndex] = false;
                } else {
                    yield result.value;
                    yielded = true;
                }
            } catch (error) {
                active[iteratorIndex] = false;
                Logger.error(`Error reading from generator ${iteratorIndex}`, error);
            }
        }

        if (!yielded && active.some(a => a)) {
            // No data available, wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 1));
        }
    }
}

/**
 * Limit the rate of an async generator
 * @param {AsyncGenerator} asyncGen - Source async generator
 * @param {number} rateLimit - Max items per time window
 * @param {number} timeWindow - Time window in ms
 * @returns {AsyncGenerator}
 */
export async function* rateLimitedGenerator(asyncGen, rateLimit, timeWindow = 1000) {
    const timestamps = [];

    for await (const item of asyncGen) {
        const now = Date.now();

        // Remove timestamps outside the time window
        while (timestamps.length > 0 && now - timestamps[0] > timeWindow) {
            timestamps.shift();
        }

        // If we've reached the rate limit, wait
        if (timestamps.length >= rateLimit) {
            const waitTime = timeWindow - (now - timestamps[0]);
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            // Recalculate after waiting
            const newNow = Date.now();
            while (timestamps.length > 0 && newNow - timestamps[0] > timeWindow) {
                timestamps.shift();
            }
        }

        // Add current timestamp and yield the item
        timestamps.push(now);
        yield item;
    }
}

/**
 * Filter an async generator with an async filter function
 * @param {AsyncGenerator} asyncGen - Source async generator
 * @param {Function} asyncFilter - Async filter function
 * @returns {AsyncGenerator}
 */
export async function* filterAsyncGenerator(asyncGen, asyncFilter) {
    for await (const item of asyncGen) {
        const shouldInclude = await asyncFilter(item);
        if (shouldInclude) {
            yield item;
        }
    }
}

/**
 * Take a limited number of items from an async generator
 * @param {AsyncGenerator} asyncGen - Source async generator
 * @param {number} limit - Number of items to take
 * @returns {AsyncGenerator}
 */
export async function* takeAsyncGenerator(asyncGen, limit) {
    let count = 0;
    for await (const item of asyncGen) {
        if (count >= limit) {
            break;
        }
        yield item;
        count++;
    }
}

/**
 * Create a buffered async iterator that preloads items
 * @param {AsyncGenerator} asyncGen - Source async generator
 * @param {number} bufferSize - Size of the buffer
 * @returns {AsyncGenerator}
 */
export async function* bufferedAsyncGenerator(asyncGen, bufferSize = 5) {
    const buffer = [];
    let generatorDone = false;

    // Start preloading
    const preload = async () => {
        if (generatorDone || buffer.length >= bufferSize) {
            return;
        }

        try {
            for await (const item of asyncGen) {
                buffer.push(item);
                if (buffer.length >= bufferSize) {
                    break;
                }
            }
        } catch (error) {
            Logger.error('Error during preloading', error);
        }
        generatorDone = true;
    };

    // Start preloading in the background
    let preloadPromise = preload();

    while (!generatorDone || buffer.length > 0) {
        if (buffer.length === 0) {
            // Wait for the next item to be available
            await new Promise(resolve => setTimeout(resolve, 10));
            continue;
        }

        yield buffer.shift();

        // Restart preloading if needed
        if (buffer.length < bufferSize && !generatorDone) {
            preloadPromise = preload();
        }
    }
}