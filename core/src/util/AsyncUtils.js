import {Logger} from './Logger.js';

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
