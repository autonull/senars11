/**
 * HyperonTestRunner.js - Integration test harness for Hyperon test suite
 * Runs official MeTTa test files and compares results
 */

import {MeTTaInterpreter} from '../../../../metta/src/index.js';
import {Formatter} from '../../../../metta/src/kernel/Formatter.js';
import {basename, dirname, join, resolve} from 'path';
import {fileURLToPath} from 'url';
import {readdir} from 'fs/promises';
import {existsSync, readFileSync} from 'fs';

let __dirname;
try {
    __dirname = dirname(fileURLToPath(import.meta.url));
} catch {
    // Fallback: resolve relative to known project structure
    __dirname = resolve(process.cwd(), 'tests/integration/metta/hyperon');
}

export class HyperonTestRunner {
    constructor(options = {}) {
        this.testDir = options.testDir || __dirname;
        this.verbose = options.verbose || false;
        this.failFast = options.failFast || false;
        this.results = {
            passed: [],
            failed: [],
            skipped: []
        };
    }

    /**
     * Run all tests in a directory
     */
    async runDirectory(dirName) {
        const fullPath = join(this.testDir, dirName);

        if (!existsSync(fullPath)) {
            console.warn(`Directory not found: ${fullPath}`);
            return this.getReport();
        }

        const files = (await readdir(fullPath)).filter(f => f.endsWith('.metta'));

        for (const file of files) {
            const filePath = join(fullPath, file);
            await this.runTestFile(filePath);

            if (this.failFast && this.results.failed.length > 0) {
                break;
            }
        }

        return this.getReport();
    }

    /**
     * Run a single test file
     */
    async runTestFile(filePath) {
        const content = readFileSync(filePath, 'utf-8');
        const testCases = this.parseTestFile(content, filePath);

        for (const testCase of testCases) {
            try {
                const result = await this.runTestCase(testCase);
                if (result.passed) {
                    this.results.passed.push(result);
                } else {
                    this.results.failed.push(result);
                }
            } catch (error) {
                this.results.failed.push({
                    ...testCase,
                    passed: false,
                    error: error.message
                });
            }
        }
    }

    /**
     * Parse test file into test cases
     * Format: ; Test: description
     *         !(expression)
     *         ; Expected: result
     */
    parseTestFile(content, filePath) {
        const lines = content.split('\n');
        const testCases = [];
        let currentTest = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Test description
            if (line.startsWith('; Test:')) {
                if (currentTest) testCases.push(currentTest);
                currentTest = {
                    file: basename(filePath),
                    line: i + 1,
                    description: line.substring(7).trim(),
                    expression: null,
                    expected: null
                };
            }
            // Expression to evaluate
            else if (line.startsWith('!') && currentTest) {
                currentTest.expression = line.substring(1).trim();
            }
            // Expected result
            else if (line.startsWith('; Expected:') && currentTest) {
                currentTest.expected = line.substring(11).trim();
            }
        }

        if (currentTest) testCases.push(currentTest);
        return testCases;
    }

    /**
     * Run a single test case
     */
    async runTestCase(testCase) {
        const interpreter = new MeTTaInterpreter();

        try {
            // Parser strips the !, so we need to add it back
            const results = interpreter.run(`!${testCase.expression}`);

            const actual = results.length > 0
                ? Formatter.toHyperonString(results[0])
                : 'Empty';

            const passed = this.compareResults(actual, testCase.expected);

            return {
                ...testCase,
                actual,
                passed
            };
        } catch (error) {
            return {
                ...testCase,
                actual: `Error: ${error.message}`,
                passed: false,
                error: error.message
            };
        }
    }

    /**
     * Compare actual and expected results
     */
    compareResults(actual, expected) {
        // Normalize whitespace
        const normalizeWS = (s) => s.replace(/\s+/g, ' ').trim();
        return normalizeWS(actual) === normalizeWS(expected);
    }

    /**
     * Get test report
     */
    getReport() {
        const total = this.results.passed.length +
            this.results.failed.length +
            this.results.skipped.length;

        return {
            total,
            passed: this.results.passed.length,
            failed: this.results.failed.length,
            skipped: this.results.skipped.length,
            passRate: total > 0 ? (this.results.passed.length / total * 100).toFixed(2) : 0,
            failures: this.results.failed
        };
    }

    /**
     * Print report
     */
    printReport() {
        const report = this.getReport();

        console.log('\n=== Hyperon Test Suite Results ===');
        console.log(`Total:   ${report.total}`);
        console.log(`Passed:  ${report.passed} (${report.passRate}%)`);
        console.log(`Failed:  ${report.failed}`);
        console.log(`Skipped: ${report.skipped}`);

        if (report.failures.length > 0 && this.verbose) {
            console.log('\n=== Failures ===');
            report.failures.forEach((f, i) => {
                console.log(`\n${i + 1}. ${f.description}`);
                console.log(`   File: ${f.file}:${f.line}`);
                console.log(`   Expression: ${f.expression}`);
                console.log(`   Expected: ${f.expected}`);
                console.log(`   Actual:   ${f.actual}`);
                if (f.error) console.log(`   Error: ${f.error}`);
            });
        }

        return report;
    }

    /**
     * Reset results
     */
    reset() {
        this.results = {
            passed: [],
            failed: [],
            skipped: []
        };
    }
}
