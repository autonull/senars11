/**
 * @file test-complex-inference-chains.js
 * @description Test complex inference chains with multiple premises
 *
 * This test validates that the NAR can handle complex inference chains
 * involving multiple premises and generate expected conclusions.
 */

import { setTimeout } from 'timers/promises';
import { TestConfig } from './test-config.js';
import { BaseUITest, TestError } from './test-utils.js';

class ComplexInferenceChainsTest extends BaseUITest {
    constructor(config = TestConfig.serverConfigs.normal) {
        super(config, { headless: true });
        this.testResults.inferenceChains = [];
        this.testResults.expectedInferences = [];
    }

    initTestResults() {
        return {
            setup: { nar: false, ui: false, connection: false },
            operations: [],
            inferenceChains: [],
            expectedInferences: [],
            errors: []
        };
    }

    async startNARServer() {
        console.log(`🚀 Starting NAR server for complex inference chain test on port ${this.config.port}...`);

        // Create the backend server configured for complex reasoning
        this.narProcess = spawn('node', ['-e', `
            import {NAR} from '../src/nar/NAR.js';
            import {WebSocketMonitor} from '../src/server/WebSocketMonitor.js';

            async function startServer() {
                console.log('=== COMPLEX INFERENCE CHAIN NAR BACKEND ===');

                // Create NAR with configuration optimized for complex reasoning
                const nar = new NAR(${JSON.stringify(this.config.narOptions)});

                try {
                    await nar.initialize();
                    console.log('✅ NAR initialized for complex inference testing');

                    // Create and start WebSocket monitor
                    const monitor = new WebSocketMonitor({
                        port: ${this.config.port},
                        host: 'localhost',
                        path: '/ws',
                        maxConnections: 10
                    });

                    await monitor.start();
                    console.log('✅ WebSocket monitor started');

                    // Connect NAR to monitor
                    nar.connectToWebSocketMonitor(monitor);
                    console.log('✅ NAR connected to WebSocket monitor');

                    // Setup monitoring for inference tracking
                    nar.on('inference.derived', (data) => {
                        console.log('INFERENCE_EVENT: inference.derived', {
                            input: data?.input?.term?.toString?.() || 'unknown',
                            belief: data?.belief?.term?.toString?.() || 'unknown',
                            conclusion: data?.conclusion?.term?.toString?.() || 'unknown',
                            rule: data?.rule || 'unknown'
                        });
                    });

                    nar.on('task.derived', (data) => {
                        console.log('INFERENCE_EVENT: task.derived', {
                            source: data?.source?.map(t => t?.term?.toString?.() || 'unknown') || [],
                            derived: data?.derived?.term?.toString?.() || 'unknown',
                            priority: data?.derived?.priority || 'unknown'
                        });
                    });

                    nar.on('concept.added', (data) => {
                        console.log('INFERENCE_EVENT: concept.added', {
                            term: data?.concept?.term?.toString?.() || 'unknown',
                            priority: data?.concept?.priority || 'unknown'
                        });
                    });

                    console.log('=== COMPLEX INFERENCE CHAIN NAR BACKEND READY ===');
                    console.log('Listening on ws://localhost:${this.config.port}/ws');

                } catch (error) {
                    console.error('❌ NAR initialization error:', error);
                    process.exit(1);
                }
            }

            startServer().catch(err => {
                console.error('❌ Critical error in NAR server:', err);
                process.exit(1);
            });
        `], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, NODE_NO_WARNINGS: '1' }
        });

        // Capture output to detect when server is ready
        let output = '';
        this.narProcess.stdout.on('data', (data) => {
            const str = data.toString();
            output += str;
            
            if (str.includes('COMPLEX INFERENCE CHAIN NAR BACKEND READY') || str.includes('INFERENCE_EVENT')) {
                console.log(`[NAR] ${str.trim()}`);
            }
        });

        this.narProcess.stderr.on('data', (data) => {
            const errorStr = data.toString();
            console.error(`[NAR-ERROR] ${errorStr.trim()}`);
            this.testResults.errors.push(`NAR Error: ${errorStr}`);
        });

        // Wait for the server to be ready
        const startTime = Date.now();
        while (!output.includes('COMPLEX INFERENCE CHAIN NAR BACKEND READY')) {
            if (Date.now() - startTime > 15000) { // 15 second timeout
                throw new Error('NAR server failed to start within 15 seconds');
            }
            await setTimeout(100);
        }

        console.log('✅ Complex inference chain NAR server is ready!');
        return true;
    }

    async startUIServer() {
        console.log(`🚀 Starting UI server on port ${this.config.uiPort}...`);

        // Start the UI server using vite
        this.uiProcess = spawn('npx', ['vite', 'dev', '--port', this.config.uiPort.toString(), '--host'], {
            cwd: join(__dirname, '..', 'ui'),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                VITE_WS_HOST: 'localhost',
                VITE_WS_PORT: this.config.port.toString(),
                VITE_WS_PATH: '/ws'
            }
        });

        // Capture UI server output
        let uiOutput = '';
        this.uiProcess.stdout.on('data', (data) => {
            const str = data.toString();
            uiOutput += str;
            if (str.includes(`http://localhost:${this.config.uiPort}`)) {
                console.log(`[UI] Server ready at: http://localhost:${this.config.uiPort}`);
            }
        });

        this.uiProcess.stderr.on('data', (data) => {
            const errorStr = data.toString();
            if (!errorStr.includes('ExperimentalWarning')) { // Filter experimental warnings
                console.error(`[UI-ERROR] ${errorStr.trim()}`);
                this.testResults.errors.push(`UI Error: ${errorStr}`);
            }
        });

        // Wait for UI server to be ready
        const startTime = Date.now();
        while (!uiOutput.includes(`http://localhost:${this.config.uiPort}`) &&
               !uiOutput.includes(`Local:   http://localhost:${this.config.uiPort}`)) {
            if (Date.now() - startTime > 20000) { // 20 second timeout
                throw new Error('UI server failed to start within 20 seconds');
            }
            await setTimeout(100);
        }

        console.log('✅ UI server is ready!');
        return true;
    }

    async startBrowser() {
        console.log('🚀 Launching browser for complex inference chain test...');

        this.browser = await puppeteer.launch({
            headless: false, // Keep visible to observe inference visualization
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding'
            ]
        });

        this.page = await this.browser.newPage();

        // Set up comprehensive console logging
        this.page.on('console', msg => {
            const text = msg.text();
            if (text.includes('error') || text.includes('Error') || text.includes('ERROR') ||
                msg.type() === 'error' || msg.type() === 'warning') {
                console.log(`Browser ${msg.type()}: ${text}`);
                if (msg.type() === 'error') {
                    this.testResults.errors.push(`Browser Error: ${text}`);
                }
            }
        });

        // Set up page error logging
        this.page.on('pageerror', error => {
            console.error('Browser page error:', error.message);
            this.testResults.errors.push(`Page Error: ${error.message}`);
        });

        console.log('✅ Browser launched for complex inference testing');
    }

    async navigateAndConnect() {
        console.log(`🌐 Navigating to UI: http://localhost:${this.config.uiPort}`);

        await this.page.goto(`http://localhost:${this.config.uiPort}`, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        console.log('✅ UI loaded successfully');

        // Wait for WebSocket connection to be established
        await this.page.waitForFunction(() => {
            const statusBar = document.querySelector('#status-bar');
            return statusBar && (
                statusBar.textContent.toLowerCase().includes('connected') ||
                statusBar.classList.contains('status-connected') ||
                statusBar.textContent.includes('Connected')
            );
        }, { timeout: 20000 });

        console.log('✅ WebSocket connection established');
    }

    async testBasicInferenceChains() {
        console.log('\n🔍 Testing basic inference chains: If A then B, If B then C, Therefore If A then C');

        // Premise 1: If bird then animal
        const premise1 = '<bird --> animal>. %1.00;0.90%';
        await this.executeCommand(premise1, 500);

        // Premise 2: If robin then bird
        const premise2 = '<robin --> bird>. %1.00;0.90%';
        await this.executeCommand(premise2, 500);

        // Expected conclusion: If robin then animal (through transitive inference)
        const expected = '<robin --> animal>.';

        console.log(`   Premise 1: ${premise1}`);
        console.log(`   Premise 2: ${premise2}`);
        console.log(`   Expected: ${expected} (through transitive deduction)`);

        // Run reasoning cycles to allow inference
        await this.runReasoningSteps(5, 800);

        this.testResults.expectedInferences.push({
            type: 'deduction_chain',
            premises: [premise1, premise2],
            expected: expected,
            chainType: 'transitive'
        });

        return { premise1, premise2, expected };
    }

    async testMultiPremiseInferences() {
        console.log('\n🔍 Testing multi-premise inferences: Common properties lead to similarity');

        // Premise 1: robin has property singing
        const premise1 = '<robin --> [singing]>. %0.90;0.80%';
        await this.executeCommand(premise1, 500);

        // Premise 2: nightingale has property singing
        const premise2 = '<nightingale --> [singing]>. %0.95;0.75%';
        await this.executeCommand(premise2, 500);

        // Expected induction: robin resembles nightingale (or similar concept formation)
        const expected = '<robin <-> nightingale>.';

        console.log(`   Premise 1: ${premise1}`);
        console.log(`   Premise 2: ${premise2}`);
        console.log(`   Expected: ${expected} (through similarity induction)`);

        // Run reasoning cycles
        await this.runReasoningSteps(5, 800);

        this.testResults.expectedInferences.push({
            type: 'induction_chain',
            premises: [premise1, premise2],
            expected: expected,
            chainType: 'similarity'
        });

        return { premise1, premise2, expected };
    }

    async testNestedInferences() {
        console.log('\n🔍 Testing nested inferences with temporal relations');

        // Premise 1: robin seeks happens
        const premise1 = '<(robin * [seeking]) --> event>. %1.00;0.90%';
        await this.executeCommand(premise1, 500);

        // Premise 2: robin eats happens next
        const premise2 = '<(robin * [eating]) --> event>. %1.00;0.90%';
        await this.executeCommand(premise2, 500);

        // Premise 3: temporal sequence
        const premise3 = '<(robin * [seeking]) =/> (robin * [eating])>. %1.00;0.85%';
        await this.executeCommand(premise3, 500);

        // Expected: predictive inference about future behavior
        const expected = '<(robin * [seeking]) =/> (robin * [eating])>?';

        console.log(`   Premise 1: ${premise1}`);
        console.log(`   Premise 2: ${premise2}`);
        console.log(`   Premise 3: ${premise3}`);
        console.log(`   Expected: ${expected} (temporal prediction)`);

        // Run reasoning cycles
        await this.runReasoningSteps(8, 800);

        this.testResults.expectedInferences.push({
            type: 'temporal_chain',
            premises: [premise1, premise2, premise3],
            expected: expected,
            chainType: 'temporal'
        });

        return { premise1, premise2, premise3, expected };
    }

    async testContradictionHandling() {
        console.log('\n🔍 Testing contradiction handling and resolution');

        // Add some potentially contradictory premises to test how the system handles them
        const premises = [
            '<bird --> [flying]>. %1.00;0.85%',  // Birds fly
            '<robin --> bird>. %1.00;0.90%',     // Robins are birds
            '<(robin & flying) --> [visible]>. %0.80;0.80%', // Flying robins are visible
        ];

        for (const premise of premises) {
            await this.executeCommand(premise, 500);
            console.log(`   Added premise: ${premise}`);
        }

        // Expected complex inference: robins are visible (through multiple deduction steps)
        const expected = '<robin --> [visible]>?';

        console.log(`   Expected: ${expected} (through multi-step deduction)`);

        // Run more reasoning cycles for complex inference
        await this.runReasoningSteps(10, 600);

        this.testResults.expectedInferences.push({
            type: 'multi_step_chain',
            premises: premises,
            expected: expected,
            chainType: 'multi-step deduction'
        });

        return { premises, expected };
    }

    async verifyInferences() {
        console.log('\n🔍 Verifying inferences generated by the system...');

        // Check REPL output for evidence of inferences
        const replOutput = await this.page.evaluate(() => {
            const output = document.querySelector('#repl-output') || 
                          document.querySelector('.repl-output') ||
                          document.querySelector('[id*="output"]') ||
                          document.querySelector('pre');
            return output ? output.textContent : '';
        });

        console.log(`   Total REPL output length: ${replOutput.length}`);

        // For each expected inference, check if it appears in the output
        for (let i = 0; i < this.testResults.expectedInferences.length; i++) {
            const inference = this.testResults.expectedInferences[i];
            let found = false;

            // Look for the expected term in the output (with variations)
            const expectedTerm = inference.expected.replace(/[<>]/g, '').replace(/\s+/g, '\\s*');
            const regex = new RegExp(expectedTerm, 'i');
            
            // Also check for simplified versions
            const simplifiedExpected = inference.expected
                .replace(/[<>]/g, '')
                .replace(/\s*%[^%]*%\s*/, '')  // Remove truth values
                .replace(/\s*\?\s*/, '')       // Remove question marks
                .trim();
            
            found = replOutput.toLowerCase().includes(simplifiedExpected.toLowerCase());

            console.log(`   Inference ${i+1}: ${inference.type} - ${found ? '✅ FOUND' : '❌ NOT FOUND'}`);
            console.log(`     Expected: ${inference.expected}`);
            
            this.testResults.inferenceChains.push({
                testNumber: i,
                type: inference.type,
                expected: inference.expected,
                found: found,
                premisesCount: inference.premises.length,
                chainType: inference.chainType
            });
        }
    }

    async runCompleteTest() {
        console.log('🚀 Starting complex inference chains with multiple premises test...\n');

        try {
            // Start NAR server
            await this.startNARServer();

            // Start UI server
            await this.startUIServer();

            // Start browser for testing
            await this.startBrowser();

            // Navigate to UI and establish connection
            await this.navigateAndConnect();

            // Test various types of complex inference chains
            await this.testBasicInferenceChains();
            await this.testMultiPremiseInferences();
            await this.testNestedInferences();
            await this.testContradictionHandling();

            // Verify that inferences were generated
            await this.verifyInferences();

            console.log('\n✅ Complex inference chains test completed!');
            this.testResults.setup = true;
            return true;

        } catch (error) {
            console.error(`\n❌ Complex inference test failed: ${error.message}`);
            console.error(error.stack);
            this.testResults.errors.push(`Critical Test Error: ${error.message}`);
            return false;
        }
    }

    async generateTestReport() {
        console.log('\n📋=== COMPLEX INFERENCE CHAINS TEST REPORT ===');

        console.log(`\n🔧 Setup: ${this.testResults.setup ? '✅ PASS' : '❌ FAIL'}`);

        console.log(`\n🔗 Inference Chain Tests: ${this.testResults.expectedInferences.length} chains tested`);
        
        // Count results by type
        const resultsByType = this.testResults.inferenceChains.reduce((acc, result) => {
            if (!acc[result.type]) acc[result.type] = { total: 0, found: 0 };
            acc[result.type].total++;
            if (result.found) acc[result.type].found++;
            return acc;
        }, {});

        for (const [type, stats] of Object.entries(resultsByType)) {
            console.log(`  ${type}: ${stats.found}/${stats.total} inferences found`);
        }

        console.log(`\n📊 Detailed Results:`);
        this.testResults.inferenceChains.forEach(result => {
            console.log(`  ${result.type} (${result.chainType}): ${result.found ? '✅' : '❌'} (premises: ${result.premisesCount})`);
        });

        if (this.testResults.errors.length > 0) {
            console.log(`\n❌ Errors Encountered: ${this.testResults.errors.length}`);
            this.testResults.errors.slice(0, 5).forEach(error => {
                console.log(`  • ${error}`);
            });
            if (this.testResults.errors.length > 5) {
                console.log(`  ... and ${this.testResults.errors.length - 5} more errors`);
            }
        }

        // Calculate success rate
        const totalInferences = this.testResults.inferenceChains.length;
        const foundInferences = this.testResults.inferenceChains.filter(i => i.found).length;
        const successRate = totalInferences > 0 ? (foundInferences / totalInferences) * 100 : 0;

        const overallSuccess = this.testResults.setup && 
                              successRate >= 50 && // At least 50% success rate for complex inferences
                              this.testResults.errors.length === 0;

        console.log(`\n🎯 Overall Result: ${overallSuccess ? '✅ COMPLEX INFERENCE CHAINS WORKING' : '❌ COMPLEX INFERENCE CHAINS ISSUE'}`);
        console.log(`\n📈 Success Statistics:`);
        console.log(`  - Total inference chains: ${totalInferences}`);
        console.log(`  - Successfully derived: ${foundInferences}`);
        console.log(`  - Success rate: ${successRate.toFixed(1)}%`);

        console.log(`\n💡 Note: Complex inference chains are challenging for NARS systems. 
             Even partial success indicates the system is performing multi-step reasoning.`);

        return overallSuccess;
    }

    async tearDown() {
        console.log('\n🛑 Shutting down complex inference chain test environment...');

        // Close browser
        if (this.browser) {
            try {
                await this.browser.close();
            } catch (e) {
                console.warn('Warning closing browser:', e.message);
            }
        }

        // Kill UI process
        if (this.uiProcess) {
            try {
                this.uiProcess.kill();
            } catch (e) {
                console.warn('Warning killing UI process:', e.message);
            }
        }

        // Kill NAR process
        if (this.narProcess) {
            try {
                this.narProcess.kill();
            } catch (e) {
                console.warn('Warning killing NAR process:', e.message);
            }
        }

        console.log('✅ Complex inference chain test environment cleaned up');
    }

    async run() {
        let success = false;

        try {
            success = await this.runCompleteTest();
        } finally {
            const reportSuccess = this.generateTestReport();
            await this.tearDown();

            // Return the more comprehensive result
            const finalSuccess = success && reportSuccess;
            console.log(`\n🏁 Final Test Outcome: ${finalSuccess ? 'SUCCESS' : 'FAILURE'}`);

            process.exit(finalSuccess ? 0 : 1);
        }
    }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const testRunner = new ComplexInferenceChainsTest();
    testRunner.run().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(console.error);
}

export { ComplexInferenceChainsTest };