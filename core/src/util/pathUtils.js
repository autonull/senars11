import {join} from 'path';

export const fallbackAgentDir = () =>
    typeof global !== 'undefined' && global.__dirname && global.__dirname.includes('agent')
        ? global.__dirname
        : join(process.cwd(), 'agent/src');

export const fallbackMemoryDir = () =>
    typeof global !== 'undefined' && global.__dirname
        ? join(global.__dirname, 'agent/src/memory')
        : join(process.cwd(), 'agent/src/memory');

export const fallbackSafetyDir = () =>
    typeof global !== 'undefined' && global.__dirname
        ? global.__dirname
        : process.cwd();

export const resolveWithFallback = (resolveFn, fallbackFn) => {
    try {
        return resolveFn();
    } catch {
        return fallbackFn();
    }
};
