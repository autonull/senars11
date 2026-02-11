import { expect } from '@playwright/test';
import { NarPage } from './NarPage.js';
import { TaskMatch } from '../../../../src/testing/TaskMatch.js';
import { NarseseParser } from '../../../../src/parser/NarseseParser.js';
import { TermFactory } from '../../../../src/term/TermFactory.js';

/**
 * TestNARPlaywright - A fluent API for testing SeNARS via Playwright.
 * Designed for strict Narsese compliance and AI-assisted TDD.
 */
export class TestNARPlaywright {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {NarPage} [narPage]
     */
    constructor(page, narPage = null) {
        this.page = page;
        this.narPage = narPage || new NarPage(page);
        this.operations = [];
        this.termFactory = new TermFactory();
        this.parser = new NarseseParser(this.termFactory);
    }

    /**
     * Queues an input command.
     * @param {string} termStr - The Narsese string (e.g., "<cat --> animal>.").
     * @param {number} [freq] - Optional frequency.
     * @param {number} [conf] - Optional confidence.
     * @returns {TestNARPlaywright}
     */
    input(termStr, freq, conf) {
        this._validateNarsese(termStr);
        this.operations.push({ type: 'input', termStr, freq, conf });
        return this;
    }

    /**
     * Queues a wait for a number of cycles (simulated by timeout).
     * @param {number} cycles
     * @returns {TestNARPlaywright}
     */
    run(cycles = 1) {
        this.operations.push({ type: 'run', cycles });
        return this;
    }

    /**
     * Queues a step command (clicking the step button).
     * @param {number} count
     * @returns {TestNARPlaywright}
     */
    step(count = 1) {
        this.operations.push({ type: 'step', count });
        return this;
    }

    /**
     * Queues an expectation for a term to exist in logs.
     * @param {string|TaskMatch} term - The term string or matcher.
     * @returns {TestNARPlaywright}
     */
    expect(term) {
        const matcher = term instanceof TaskMatch ? term : new TaskMatch(term);
        this.operations.push({ type: 'expect', matcher, shouldExist: true });
        return this;
    }

    /**
     * Queues an expectation for a term NOT to exist in logs.
     * @param {string|TaskMatch} term
     * @returns {TestNARPlaywright}
     */
    expectNot(term) {
        const matcher = term instanceof TaskMatch ? term : new TaskMatch(term);
        this.operations.push({ type: 'expect', matcher, shouldExist: false });
        return this;
    }

    /**
     * Queues an expectation for a node to exist in the graph.
     * @param {string} nodeName
     * @returns {TestNARPlaywright}
     */
    expectGraph(nodeName) {
        this.operations.push({ type: 'expectGraph', nodeName, shouldExist: true });
        return this;
    }

    /**
     * Executes all queued operations in order.
     */
    async execute() {
        for (const op of this.operations) {
            switch (op.type) {
                case 'input':
                    await this._handleInput(op);
                    break;
                case 'run':
                    await this.page.waitForTimeout(op.cycles * 50);
                    break;
                case 'step':
                    for (let i = 0; i < op.count; i++) {
                        await this.page.click('#btn-step');
                        await this.page.waitForTimeout(50);
                    }
                    break;
                case 'expect':
                    await this._checkExpectation(op);
                    break;
                case 'expectGraph':
                    await this._checkGraphExpectation(op);
                    break;
            }
        }
        this.operations = [];
    }

    async _handleInput(op) {
        let input = op.termStr;
        if (op.freq !== undefined && op.conf !== undefined) {
            const lastChar = input.trim().slice(-1);
            if (!['.', '!', '?', '@'].includes(lastChar)) {
                input += '.';
            }
            input += ` %${op.freq};${op.conf}%`;
        }
        await this.narPage.sendCommand(input);
        await this.page.waitForTimeout(100);
    }

    async _checkExpectation(op) {
        await expect(async () => {
            const logsText = await this.narPage.logsContainer.innerText();
            const found = await this._findInLogs(logsText, op.matcher);

            if (op.shouldExist && !found) {
                throw new Error(`Expected term not found: ${op.matcher.termFilter}`);
            }
            if (!op.shouldExist && found) {
                throw new Error(`Unexpected term found: ${op.matcher.termFilter}`);
            }
        }).toPass({ timeout: 10000, intervals: [500] });
    }

    async _findInLogs(logsText, matcher) {
        const lines = logsText.split('\n');
        for (const line of lines) {
            const match = line.match(/[<()].*[>).?!%]/);
            if (!match) continue;

            const narsese = match[0];

            try {
                const parsed = this.parser.parse(narsese);
                const taskMock = {
                    term: parsed.term,
                    type: parsed.type || 'BELIEF',
                    truth: parsed.truth
                };

                if (await matcher.matches(taskMock)) return true;
            } catch (e) {
                // If parsing fails (e.g. partial output), fall back to simple string inclusion
                if (narsese.includes(matcher.termFilter)) return true;
            }
        }
        return false;
    }

    async _checkGraphExpectation(op) {
        await this.narPage.sendCommand('/nodes');
        await this.narPage.expectLog(op.nodeName);
    }

    _validateNarsese(termStr) {
        if (!termStr) return;
        // Only validate if it looks like Narsese (starts with < or ()
        if (termStr.trim().startsWith('<') || termStr.trim().startsWith('(')) {
            try {
                this.parser.parse(termStr);
            } catch (e) {
                // If it fails, it might be because of missing punctuation which _handleInput adds
                // Try adding a dot and parsing again
                try {
                    this.parser.parse(termStr + '.');
                } catch (e2) {
                    throw new Error(`Invalid Narsese input: "${termStr}". Parser error: ${e.message}`);
                }
            }
        }
    }
}
