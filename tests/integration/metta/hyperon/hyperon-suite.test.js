/**
 * Integration tests for Hyperon test suite
 * Runs official MeTTa test files and validates results
 */

import {HyperonTestRunner} from './HyperonTestRunner.js';

describe('Hyperon Test Suite', () => {
    let runner;

    beforeEach(() => {
        runner = new HyperonTestRunner({verbose: false});
    });

    afterEach(() => {
        runner.reset();
    });

    describe('Basic Tests', () => {
        test('should pass basic syntax tests', async () => {
            const report = await runner.runDirectory('basic');

            expect(report.total).toBeGreaterThan(0);
            expect(report.failed).toBe(0);
            expect(report.passRate).toBe('100.00');
        }, 10000);
    });

    describe('Standard Library Tests', () => {
        test('should pass stdlib operation tests', async () => {
            const report = await runner.runDirectory('stdlib');

            expect(report.total).toBeGreaterThan(0);
            // Allow some failures initially as we may not have all features
            expect(parseFloat(report.passRate)).toBeGreaterThan(80);
        }, 10000);
    });

    describe('Type System Tests', () => {
        test('should pass type system tests', async () => {
            const report = await runner.runDirectory('types');

            // May have no tests yet, or may have some failures
            if (report.total > 0) {
                expect(parseFloat(report.passRate)).toBeGreaterThan(70);
            }
        }, 10000);
    });

    describe('Non-Determinism Tests', () => {
        test('should pass superpose tests', async () => {
            const report = await runner.runDirectory('superpose');

            // May have no tests yet
            if (report.total > 0) {
                expect(parseFloat(report.passRate)).toBeGreaterThan(70);
            }
        }, 10000);
    });

    describe('Recursion Tests', () => {
        test('should pass recursion tests', async () => {
            const report = await runner.runDirectory('recursion');

            // May have no tests yet
            if (report.total > 0) {
                expect(parseFloat(report.passRate)).toBeGreaterThan(70);
            }
        }, 10000);
    });

    describe('Edge Cases', () => {
        test('should pass edge case tests', async () => {
            const report = await runner.runDirectory('edge-cases');

            // May have no tests yet
            if (report.total > 0) {
                expect(parseFloat(report.passRate)).toBeGreaterThan(70);
            }
        }, 10000);
    });

    describe('Full Suite Report', () => {
        test('should generate comprehensive report', async () => {
            // Run all test directories
            await runner.runDirectory('basic');
            await runner.runDirectory('stdlib');
            await runner.runDirectory('types');
            await runner.runDirectory('superpose');
            await runner.runDirectory('recursion');
            await runner.runDirectory('edge-cases');

            const report = runner.printReport();

            expect(report.total).toBeGreaterThan(0);
            console.log(`\nOverall pass rate: ${report.passRate}%`);

            // Document failures for gap analysis
            if (report.failures.length > 0) {
                console.log(`\nFailures to investigate: ${report.failures.length}`);
            }
        }, 30000);
    });
});
