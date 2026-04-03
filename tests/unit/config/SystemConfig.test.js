import {beforeEach, describe, expect, test} from '@jest/globals';
import {DEFAULT_CONFIG, SystemConfig} from '@senars/nar/src/config/SystemConfig.js';

describe('SystemConfig', () => {
    let systemConfig;

    beforeEach(() => systemConfig = new SystemConfig());

    test('initializes with default config', () =>
        expect(systemConfig._config).toMatchObject(DEFAULT_CONFIG)
    );

    test('validates valid configuration', () =>
        expect(() => new SystemConfig({
            memory: {capacity: 5000},
            lm: {enabled: true}
        })).not.toThrow()
    );

    test('detects invalid configuration', () =>
        expect(() => new SystemConfig({
            memory: {capacity: -100}
        })).toThrow(/validation failed/)
    );

    test('gets nested config values', () =>
        expect(systemConfig.get('memory.capacity')).toBe(1000)
    );

    test('returns undefined for non-existent paths', () =>
        expect(systemConfig.get('non.existent.path')).toBeUndefined()
    );
});
