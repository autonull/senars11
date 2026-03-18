import { Logger } from '../../util/Logger.js';

export const asyncGeneratorFromArray = async function* (array, processor = null) {
    for (const item of array) {
        yield processor ? await processor(item) : item;
    }
};

export const transformAsyncGenerator = async function* (asyncGen, processor) {
    for await (const item of asyncGen) {
        const processedItem = await processor(item);
        if (processedItem != null) {
            yield processedItem;
        }
    }
};

export const bufferWithBackpressure = async function* (asyncGen, maxSize = 10, delay = 10) {
    const buffer = [];
    let generatorDone = false;
    const genIterator = asyncGen[Symbol.asyncIterator]();

    const getNext = async () => {
        try {
            return await genIterator.next();
        } catch (error) {
            generatorDone = true;
            throw error;
        }
    };

    let nextPromise = getNext();

    while (!generatorDone) {
        if (buffer.length < maxSize && !generatorDone) {
            try {
                const result = await Promise.race([
                    nextPromise,
                    new Promise(resolve => setTimeout(() => resolve(null), 1))
                ]);

                if (result?.done) {
                    generatorDone = true;
                } else if (result?.value != null) {
                    buffer.push(result.value);
                    nextPromise = getNext();
                }
            } catch (error) {
                generatorDone = true;
            }
        }

        if (buffer.length > 0) {
            yield buffer.shift();
        } else if (!generatorDone) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    while (buffer.length > 0) {
        yield buffer.shift();
    }
};

export const mergeAsyncGenerators = async function* (generators, selector = 'round-robin') {
    const iterators = generators.map(gen => gen[Symbol.asyncIterator]());
    const active = iterators.map(() => true);
    let roundRobinIndex = 0;

    while (active.some(a => a)) {
        let yielded = false;
        let iteratorIndex;

        if (selector === 'round-robin') {
            iteratorIndex = -1;
            for (let i = 0; i < iterators.length; i++) {
                const idx = (roundRobinIndex + i) % iterators.length;
                if (active[idx]) {
                    iteratorIndex = idx;
                    roundRobinIndex = (idx + 1) % iterators.length;
                    break;
                }
            }
        } else {
            iteratorIndex = active.findIndex(a => a);
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
            await new Promise(resolve => setTimeout(resolve, 1));
        }
    }
};

export const rateLimitedGenerator = async function* (asyncGen, rateLimit, timeWindow = 1000) {
    const timestamps = [];

    for await (const item of asyncGen) {
        const now = Date.now();
        while (timestamps.length > 0 && now - timestamps[0] > timeWindow) {
            timestamps.shift();
        }

        if (timestamps.length >= rateLimit) {
            const waitTime = timeWindow - (now - timestamps[0]);
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            const newNow = Date.now();
            while (timestamps.length > 0 && newNow - timestamps[0] > timeWindow) {
                timestamps.shift();
            }
        }

        timestamps.push(now);
        yield item;
    }
};

export const filterAsyncGenerator = async function* (asyncGen, asyncFilter) {
    for await (const item of asyncGen) {
        if (await asyncFilter(item)) {
            yield item;
        }
    }
};

export const takeAsyncGenerator = async function* (asyncGen, limit) {
    for (let count = 0; count < limit; count++) {
        const { value, done } = await asyncGen.next();
        if (done) break;
        yield value;
    }
};

export const bufferedAsyncGenerator = async function* (asyncGen, bufferSize = 5) {
    const buffer = [];
    let generatorDone = false;

    const preload = async () => {
        if (generatorDone || buffer.length >= bufferSize) return;
        try {
            for await (const item of asyncGen) {
                buffer.push(item);
                if (buffer.length >= bufferSize) break;
            }
        } catch (error) {
            Logger.error('Error during preloading', error);
        }
        generatorDone = true;
    };

    let preloadPromise = preload();

    while (!generatorDone || buffer.length > 0) {
        if (buffer.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
            continue;
        }

        yield buffer.shift();

        if (buffer.length < bufferSize && !generatorDone) {
            preloadPromise = preload();
        }
    }
};