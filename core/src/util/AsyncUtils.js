import {Logger} from './Logger.js';

export const safeAsync = async (asyncFn, defaultValue = null) => {
    try {
        return await asyncFn();
    } catch (error) {
        Logger.error('Error in safeAsync', {message: error?.message || error});
        return defaultValue;
    }
};

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const timeout = (ms, message = 'Operation timed out') => {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), ms);
    });
};

export const withTimeout = async (promise, ms, message = 'Operation timed out') => {
    return Promise.race([
        promise,
        timeout(ms, message)
    ]);
};

export async function* asyncIteratorWithDelay(items, delay = 0) {
    for (const item of items) {
        if (delay > 0) await sleep(delay);
        yield item;
    }
}
