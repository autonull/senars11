import {beforeEach, describe, expect, test} from '@jest/globals';
import {DerivationTracer} from '@senars/nar/src/util/DerivationTracer.js';
import {EventBus} from '@senars/core/src/util/EventBus.js';
import {IntrospectionEvents} from '@senars/core/src/util/IntrospectionEvents.js';

describe('DerivationTracer', () => {
    let eventBus;
    let tracer;

    beforeEach(() => {
        eventBus = new EventBus();
        tracer = new DerivationTracer(eventBus);
    });

    describe('Lifecycle', () => {
        test('startTrace creates new trace', () => {
            const traceId = tracer.startTrace();
            expect(traceId).toBeDefined();
            expect(typeof traceId).toBe('string');
            expect(tracer.getTrace(traceId)).toBeDefined();
        });

        test('endTrace finalizes trace', () => {
            const traceId = tracer.startTrace();
            const trace = tracer.endTrace(traceId);

            expect(trace.endTime).toBeDefined();
            expect(trace.metrics).toBeDefined();
            expect(trace.metrics.totalSteps).toBe(0);
        });

        test('activeTrace is set on start', () => {
            const traceId = tracer.startTrace();
            expect(tracer.activeTrace).toBe(traceId);
        });

        test('activeTrace is cleared on end', () => {
            const traceId = tracer.startTrace();
            tracer.endTrace(traceId);
            expect(tracer.activeTrace).toBeNull();
        });
    });

    describe('Event Capture', () => {
        test('captures RULE_FIRED events', () => {
            const traceId = tracer.startTrace();

            eventBus.emit(IntrospectionEvents.RULE_FIRED, {
                ruleName: 'TestRule',
                premises: [{term: 'a', serialize: () => ({term: 'a'})}],
                conclusion: {term: 'b', serialize: () => ({term: 'b'})},
                truth: {frequency: 1.0, confidence: 0.9},
                depth: 1
            });

            const trace = tracer.getTrace(traceId);
            expect(trace.steps.length).toBe(1);
            expect(trace.steps[0].rule).toBe('TestRule');
            expect(trace.steps[0].depth).toBe(1);
        });

        test('captures RULE_NOT_FIRED events', () => {
            const traceId = tracer.startTrace();

            eventBus.emit(IntrospectionEvents.RULE_NOT_FIRED, {
                ruleName: 'SkippedRule',
                reason: 'precondition failed'
            });

            const trace = tracer.getTrace(traceId);
            expect(trace.skips.length).toBe(1);
            expect(trace.skips[0].rule).toBe('SkippedRule');
            expect(trace.skips[0].reason).toBe('precondition failed');
        });

        test('captures REASONING_DERIVATION events', () => {
            const traceId = tracer.startTrace();

            eventBus.emit(IntrospectionEvents.REASONING_DERIVATION, {
                task: {term: 'c', serialize: () => ({term: 'c'})}
            });

            const trace = tracer.getTrace(traceId);
            expect(trace.derivations.length).toBe(1);
        });

        test('respects recordSkips option', () => {
            tracer = new DerivationTracer(eventBus, {recordSkips: false});
            const traceId = tracer.startTrace();

            eventBus.emit(IntrospectionEvents.RULE_NOT_FIRED, {
                ruleName: 'SkippedRule'
            });

            const trace = tracer.getTrace(traceId);
            expect(trace.skips.length).toBe(0);
        });
    });

    describe('Query Methods', () => {
        test('getTrace returns null for non-existent trace', () => {
            expect(tracer.getTrace('non-existent')).toBeNull();
        });

        test('getActiveTrace returns current trace', () => {
            const traceId = tracer.startTrace();
            const active = tracer.getActiveTrace();
            expect(active).toBeDefined();
            expect(active.id).toBe(traceId);
        });

        test('list returns all trace IDs', () => {
            const id1 = tracer.startTrace();
            tracer.endTrace(id1);
            const id2 = tracer.startTrace();

            const ids = tracer.list();
            expect(ids).toContain(id1);
            expect(ids).toContain(id2);
            expect(ids.length).toBe(2);
        });
    });

    describe('Analysis Methods', () => {
        test('findPath finds derivation chain', () => {
            const traceId = tracer.startTrace();

            // Simulate a -> b derivation
            eventBus.emit(IntrospectionEvents.RULE_FIRED, {
                ruleName: 'Rule1',
                premises: ['a'],
                conclusion: 'b',
                depth: 1
            });

            // Simulate b -> c derivation
            eventBus.emit(IntrospectionEvents.RULE_FIRED, {
                ruleName: 'Rule2',
                premises: ['b'],
                conclusion: 'c',
                depth: 2
            });

            const path = tracer.findPath(traceId, 'a', 'c');
            expect(path.length).toBeGreaterThan(0);
        });

        test('whyNot returns relevant skips', () => {
            const traceId = tracer.startTrace();

            eventBus.emit(IntrospectionEvents.RULE_NOT_FIRED, {
                ruleName: 'InductionRule',
                reason: 'insufficient evidence'
            });

            const skips = tracer.whyNot(traceId, 'induction');
            expect(skips.length).toBeGreaterThan(0);
        });

        test('hotRules returns rule frequencies', () => {
            const traceId = tracer.startTrace();

            eventBus.emit(IntrospectionEvents.RULE_FIRED, {
                ruleName: 'Rule1',
                premises: [],
                conclusion: 'a'
            });

            eventBus.emit(IntrospectionEvents.RULE_FIRED, {
                ruleName: 'Rule1',
                premises: [],
                conclusion: 'b'
            });

            eventBus.emit(IntrospectionEvents.RULE_FIRED, {
                ruleName: 'Rule2',
                premises: [],
                conclusion: 'c'
            });

            const hot = tracer.hotRules(traceId);
            expect(hot.get('Rule1')).toBe(2);
            expect(hot.get('Rule2')).toBe(1);
        });
    });

    describe('Export Formats', () => {
        test('exports JSON format', () => {
            const traceId = tracer.startTrace();
            eventBus.emit(IntrospectionEvents.RULE_FIRED, {
                ruleName: 'TestRule',
                premises: [],
                conclusion: 'test'
            });
            tracer.endTrace(traceId);

            const json = tracer.export(traceId, 'json');
            expect(json).toContain('TestRule');
            expect(() => JSON.parse(json)).not.toThrow();
        });

        test('exports Mermaid format', () => {
            const traceId = tracer.startTrace();
            eventBus.emit(IntrospectionEvents.RULE_FIRED, {
                ruleName: 'TestRule',
                premises: ['a'],
                conclusion: 'b'
            });
            tracer.endTrace(traceId);

            const mermaid = tracer.export(traceId, 'mermaid');
            expect(mermaid).toContain('graph TD');
            expect(mermaid).toContain('TestRule');
        });

        test('exports DOT format', () => {
            const traceId = tracer.startTrace();
            eventBus.emit(IntrospectionEvents.RULE_FIRED, {
                ruleName: 'TestRule',
                premises: ['a'],
                conclusion: 'b'
            });
            tracer.endTrace(traceId);

            const dot = tracer.export(traceId, 'dot');
            expect(dot).toContain('digraph Trace');
            expect(dot).toContain('TestRule');
        });

        test('exports HTML format', () => {
            const traceId = tracer.startTrace();
            eventBus.emit(IntrospectionEvents.RULE_FIRED, {
                ruleName: 'TestRule',
                premises: ['a'],
                conclusion: 'b'
            });
            tracer.endTrace(traceId);

            const html = tracer.export(traceId, 'html');
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('TestRule');
        });
    });

    describe('Metrics', () => {
        test('computes metrics correctly', () => {
            const traceId = tracer.startTrace();

            eventBus.emit(IntrospectionEvents.RULE_FIRED, {
                ruleName: 'Rule1',
                premises: [],
                conclusion: 'a',
                depth: 1
            });

            eventBus.emit(IntrospectionEvents.RULE_FIRED, {
                ruleName: 'Rule2',
                premises: [],
                conclusion: 'b',
                depth: 2
            });

            eventBus.emit(IntrospectionEvents.REASONING_DERIVATION, {
                task: {term: 'c'}
            });

            const trace = tracer.endTrace(traceId);

            expect(trace.metrics.totalSteps).toBe(2);
            expect(trace.metrics.totalDerivations).toBe(1);
            expect(trace.metrics.uniqueRules).toBe(2);
            expect(trace.metrics.maxDepth).toBe(2);
            expect(trace.metrics.duration).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Cleanup', () => {
        test('dispose cleans up resources', () => {
            const traceId = tracer.startTrace();
            tracer.dispose();

            expect(tracer.traces.size).toBe(0);
            expect(tracer.activeTrace).toBeNull();
        });
    });
});
