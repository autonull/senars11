import {MemoryValidator} from '@senars/core/src/util/MemoryValidator';

describe('MemoryValidator', () => {
    let validator;
    beforeEach(() => {
        validator = new MemoryValidator();
    });

    test('initialization', () => {
        expect(validator.isEnabled).toBe(true);
        expect(validator.calculateChecksum({a: 1})).not.toBeNull();
    });

    test('consistency', () => {
        const obj = {a: 1, b: 2};
        expect(validator.calculateChecksum(obj)).toBe(validator.calculateChecksum(obj));
        expect(validator.calculateChecksum({a: 1})).not.toBe(validator.calculateChecksum({a: 2}));
    });

    test('validation cycle', () => {
        const obj = {data: 'test'};
        const key = 'k1';

        validator.storeChecksum(key, obj);
        expect(validator.validate(key, obj)).toMatchObject({valid: true});

        obj.data = 'changed';
        const res = validator.validate(key, obj);
        expect(res.valid).toBe(false);
        expect(res.message).toContain('corruption');
    });

    test('batch validation', () => {
        const items = [['k1', {a: 1}], ['k2', {b: 2}]];
        items.forEach(([k, o]) => validator.storeChecksum(k, o));

        const res = validator.validateBatch(items);
        expect(res).toHaveLength(2);
        expect(res.every(r => r.result.valid)).toBe(true);

        items[1][1].b = 3; // Corrupt k2
        const res2 = validator.validateBatch(items);
        expect(res2[0].result.valid).toBe(true);
        expect(res2[1].result.valid).toBe(false);
    });

    test('disable', () => {
        validator.disable();
        expect(validator.validate('k', {})).toMatchObject({valid: true, message: /disabled/});
    });
});
