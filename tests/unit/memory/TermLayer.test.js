import {TermLayer, TermFactory} from '@senars/nar';

describe('TermLayer', () => {
    let layer, tf;

    beforeEach(() => {
        layer = new TermLayer({capacity: 10});
        tf = new TermFactory();
    });

    test('initialization', () => {
        expect(layer.capacity).toBe(10);
        expect(layer.count).toBe(0);
        expect(layer.getStats()).toMatchObject({linkCount: 0, capacity: 10, utilization: 0});
    });

    test('add and retrieve', () => {
        const [src, tgt] = [tf.atomic('A'), tf.atomic('B')];
        expect(layer.add(src, tgt, {priority: 5})).toBe(true);
        expect(layer.count).toBe(1);

        const links = layer.get(src);
        expect(links).toHaveLength(1);
        expect(links[0].target.name).toBe('B');
    });

    test('remove', () => {
        const [src, tgt] = [tf.atomic('A'), tf.atomic('B')];
        layer.add(src, tgt);
        expect(layer.has(src, tgt)).toBe(true);

        expect(layer.remove(src, tgt)).toBe(true);
        expect(layer.has(src, tgt)).toBe(false);
        expect(layer.count).toBe(0);
    });

    test('update', () => {
        const [src, tgt] = [tf.atomic('A'), tf.atomic('B')];
        layer.add(src, tgt, {priority: 1});

        expect(layer.update(src, tgt, {priority: 10, confidence: 0.9})).toBe(true);
        const link = layer.get(src)[0];
        expect(link.data).toMatchObject({priority: 10, confidence: 0.9});
    });

    test('capacity eviction', () => {
        layer = new TermLayer({capacity: 2});
        const pairs = [['A', 'B', 1], ['C', 'D', 2], ['E', 'F', 3]].map(([s, t, p]) => ({
            s: tf.atomic(s), t: tf.atomic(t), p
        }));

        pairs.forEach(({s, t, p}) => layer.add(s, t, {priority: p}));

        expect(layer.count).toBe(2);
        // Lowest priority (A->B, p=1) should be evicted
        expect(layer.has(pairs[0].s, pairs[0].t)).toBe(false);
        expect(layer.has(pairs[1].s, pairs[1].t)).toBe(true);
        expect(layer.has(pairs[2].s, pairs[2].t)).toBe(true);
    });

    test('clear', () => {
        layer.add(tf.atomic('A'), tf.atomic('B'));
        layer.clear();
        expect(layer.count).toBe(0);
    });
});
