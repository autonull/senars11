/**
 * @file test-utils.js
 * @description Shared utilities for UI tests following AGENTS.md guidelines
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Error class for test-specific errors
 */
export class TestError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'TestError';
    this.context = context;
  }
}

/**
 * Error class for NAR server errors
 */
export class NarServerError extends TestError {
  constructor(message, context = {}) {
    super(message, { ...context, type: 'NAR_SERVER_ERROR' });
    this.name = 'NarServerError';
  }
}

/**
 * Error class for UI server errors
 */
export class UIServerError extends TestError {
  constructor(message, context = {}) {
    super(message, { ...context, type: 'UI_SERVER_ERROR' });
    this.name = 'UIServerError';
  }
}

/**
 * Error class for browser-related errors
 */
export class BrowserError extends TestError {
  constructor(message, context = {}) {
    super(message, { ...context, type: 'BROWSER_ERROR' });
    this.name = 'BrowserError';
  }
}

/**
 * Base test class with common functionality
 */
export class BaseUITest {
  constructor(config, uiConfig = {}) {
    this.config = config;
    this.uiConfig = {
      headless: false,
      timeout: 30000,
      retryAttempts: 2,
      ...uiConfig
    };
    this.narProcess = null;
    this.uiProcess = null;
    this.browser = null;
    this.page = null;
    this.testResults = this.initTestResults();
    // Element cache to reduce DOM queries
    this._elementCache = new Map();
  }

  /**
   * Initialize the test results object
   * @returns {Object} Initialized test results
   */
  initTestResults() {
    return {
      setup: { nar: false, ui: false, connection: false },
      operations: [],
      errors: []
    };
  }

  /**
   * Log test messages with consistent formatting
   * @param {string} message - The message to log
   * @param {'info'|'warn'|'error'} level - The log level
   */
  log(message, level = 'info') {
    const icons = { info: '🚀', warn: '⚠️', error: '❌' };
    console.log(`${icons[level] || '📍'} ${message}`);
  }

  /**
   * Start the NAR server process
   * @param {Object} options - Server configuration options
   * @returns {Promise<boolean>} True if successful
   */
  async startNARServer(options = {}) {
    const { port = this.config.port, narOptions = this.config.narOptions } = options;
    
    this.log(`Starting NAR server on port ${port}...`);

    this.narProcess = spawn('node', ['-e', `
      import {NAR} from './src/nar/NAR.js';
      import {WebSocketMonitor} from './src/server/WebSocketMonitor.js';

      async function startServer() {
        console.log('=== NAR BACKEND STARTING ===');

        const nar = new NAR(${JSON.stringify(narOptions)});

        try {
          await nar.initialize();
          console.log('✅ NAR initialized successfully');

          const monitor = new WebSocketMonitor({
            port: ${port},
            host: 'localhost',
            path: '/ws',
            maxConnections: 10
          });

          await monitor.start();
          console.log('✅ WebSocket monitor started');

          nar.connectToWebSocketMonitor(monitor);
          console.log('✅ NAR connected to WebSocket monitor');

          console.log('=== NAR BACKEND READY ===');
          console.log('Listening on ws://localhost:${port}/ws');

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
      cwd: join(__dirname, '../..'), // Navigate up to project root (this makes ./src work from here)
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' }
    });

    let output = '';
    this.narProcess.stdout.on('data', (data) => {
      const str = data.toString();
      output += str;
      if (str.includes('NAR BACKEND READY') || str.includes('ERROR')) {
        console.log(`[NAR] ${str.trim()}`);
      }
    });

    this.narProcess.stderr.on('data', (data) => {
      const errorStr = data.toString();
      console.error(`[NAR-ERROR] ${errorStr.trim()}`);
      this.testResults.errors.push(new NarServerError(errorStr, { process: 'NAR', port }));
    });

    const startTime = Date.now();
    while (!output.includes('NAR BACKEND READY')) {
      if (Date.now() - startTime > 15000) {
        throw new NarServerError('NAR server failed to start within 15 seconds', { port });
      }
      await setTimeout(100);
    }

    this.testResults.setup.nar = true;
    this.log('NAR server is ready and fully functional!');
    return true;
  }

  /**
   * Start the UI server process
   * @param {Object} options - UI server configuration options
   * @returns {Promise<boolean>} True if successful
   */
  async startUIServer(options = {}) {
    const { uiPort = this.config.uiPort } = options;

    this.log(`Starting UI server on port ${uiPort}...`);

    // Install dependencies in UI directory if needed
    try {
      const { execSync } = await import('child_process');
      this.log('Ensuring UI dependencies are installed...');
      execSync('npm ci', { cwd: join(__dirname, '../../ui'), stdio: 'pipe' });
    } catch {
      // If npm ci fails, try npm install
      try {
        const { execSync } = await import('child_process');
        execSync('npm install', { cwd: join(__dirname, '../../ui'), stdio: 'pipe' });
      } catch {
        this.log('Dependency installation issues, continuing anyway...', 'warn');
      }
    }

    this.uiProcess = spawn('npx', ['vite', 'dev', '--port', uiPort.toString(), '--host'], {
      cwd: join(__dirname, '../../ui'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        VITE_WS_HOST: 'localhost',
        VITE_WS_PORT: this.config.port.toString(),
        VITE_WS_PATH: '/ws',
        NODE_ENV: 'development'
      }
    });

    let uiOutput = '';
    this.uiProcess.stdout.on('data', (data) => {
      const str = data.toString();
      uiOutput += str;
      if (str.includes(`http://localhost:${uiPort}`)) {
        console.log(`[UI] Server ready at: http://localhost:${uiPort}`);
      }
    });

    this.uiProcess.stderr.on('data', (data) => {
      const errorStr = data.toString();
      if (!errorStr.includes('ExperimentalWarning')) {
        console.error(`[UI-ERROR] ${errorStr.trim()}`);
        this.testResults.errors.push(new UIServerError(errorStr, { process: 'UI', port: uiPort }));
      }
    });

    const startTime = Date.now();
    while (!uiOutput.includes(`http://localhost:${uiPort}`) &&
           !uiOutput.includes(`Local:   http://localhost:${uiPort}`)) {
      if (Date.now() - startTime > 20000) {
        throw new UIServerError('UI server failed to start within 20 seconds', { port: uiPort });
      }
      await setTimeout(100);
    }

    this.testResults.setup.ui = true;
    this.log('UI server is ready and accepting connections!');
    return true;
  }

  /**
   * Start the browser with comprehensive debugging
   * @returns {Promise<boolean>} True if successful
   */
  async startBrowser() {
    this.log('Launching browser with comprehensive debugging...');

    this.browser = await puppeteer.launch({
      headless: this.uiConfig.headless,
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
          this.testResults.errors.push(new BrowserError(text, { type: msg.type() }));
        }
      }
    });

    // Set up page error logging
    this.page.on('pageerror', error => {
      console.error('Browser page error:', error.message);
      this.testResults.errors.push(new BrowserError(error.message, { type: 'pageerror' }));
    });

    // Set up response logging to catch failures
    this.page.on('response', response => {
      if (response.status() >= 400) {
        console.error(`HTTP ${response.status()} Error: ${response.url()}`);
        this.testResults.errors.push(new BrowserError(`HTTP Error ${response.status()}: ${response.url()}`, {
          type: 'http_error',
          status: response.status()
        }));
      }
    });

    this.log('Browser launched with comprehensive debugging');
    return true;
  }

  /**
   * Navigate to the UI and wait for WebSocket connection
   * @returns {Promise<boolean>} True if successful
   */
  async navigateAndConnect() {
    const uiPort = this.config.uiPort;
    this.log(`Navigating to UI: http://localhost:${uiPort}`);

    await this.page.goto(`http://localhost:${uiPort}`, {
      waitUntil: 'networkidle0',
      timeout: this.uiConfig.timeout
    });

    this.log('UI loaded successfully');

    // Wait for WebSocket connection to be established
    try {
      await this.page.waitForFunction(() => {
        const statusBar = document.querySelector('#status-bar');
        const hasConnectedStatus = statusBar && (
          statusBar.textContent.toLowerCase().includes('connected') ||
          statusBar.classList.contains('status-connected') ||
          statusBar.textContent.includes('Connected')
        );

        return hasConnectedStatus;
      }, { 
        timeout: 20000 
      });

      this.testResults.setup.connection = true;
      this.log('WebSocket connection established successfully');
      return true;
    } catch (error) {
      throw new BrowserError('WebSocket connection failed to establish', { 
        timeout: 20000,
        error: error.message 
      });
    }
  }

  /**
   * Execute a Narsese command in the UI
   * @param {string} command - The command to execute
   * @param {number} waitTime - Time to wait after execution
   * @returns {Promise<boolean>} True if successful
   */
  async executeCommand(command, waitTime = 1000) {
    try {
      // Use a more specific selector to reduce search time and provide fallbacks
      const inputSelector = '#repl-input, .repl-input, [data-testid="repl-input"]';
      await this.page.waitForSelector(inputSelector, { timeout: 5000 });
      await this.page.type(inputSelector.split(',')[0].trim(), command);
      await this.page.keyboard.press('Enter');
      await setTimeout(waitTime);
      return true;
    } catch (error) {
      throw new BrowserError(`Failed to execute command "${command}": ${error.message}`, {
        command,
        error: error.message
      });
    }
  }

  /**
   * Run a series of reasoning steps
   * @param {number} count - Number of steps to run
   * @param {number} waitTime - Time to wait between steps
   * @returns {Promise<boolean>} True if successful
   */
  async runReasoningSteps(count, waitTime = 800) {
    for (let i = 0; i < count; i++) {
      await this.executeCommand('*step', waitTime);
      this.log(`Reasoning step ${i + 1}/${count} completed`);
    }
    return true;
  }

  /**
   * Generate and display a test report
   * @returns {boolean} True if the test passed completely
   */
  generateTestReport() {
    this.log('=== TEST REPORT ===', 'info');

    console.log('\n🔧 Setup Results:');
    console.log(`  NAR Server: ${this.testResults.setup.nar ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  UI Server: ${this.testResults.setup.ui ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  WebSocket Connection: ${this.testResults.setup.connection ? '✅ PASS' : '❌ FAIL'}`);

    if (this.testResults.errors.length > 0) {
      console.log(`\n❌ Errors Encountered: ${this.testResults.errors.length}`);
      this.testResults.errors.slice(0, 5).forEach(error => {
        console.log(`  • ${error.message ?? error}`);
      });
      if (this.testResults.errors.length > 5) {
        console.log(`  ... and ${this.testResults.errors.length - 5} more errors`);
      }
    }

    const overallSuccess = this.testResults.setup.nar &&
                          this.testResults.setup.ui &&
                          this.testResults.setup.connection &&
                          this.testResults.errors.length === 0;

    console.log(`\n🎯 Overall Result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

    // Show configuration used
    if (this.config?.narOptions) {
      console.log(`\n⚙️  Test Configuration:`);
      console.log(`  Concept bag capacity: ${this.config.narOptions.memory.conceptBag?.capacity ?? 'unknown'}`);
      console.log(`  Task bag capacity: ${this.config.narOptions.memory.taskBag?.capacity ?? 'unknown'}`);
      console.log(`  Max tasks per cycle: ${this.config.narOptions.cycle?.maxTasksPerCycle ?? 'unknown'}`);
    }

    return overallSuccess;
  }

  /**
   * Clean up all test resources
   */
  async tearDown() {
    this.log('Shutting down test environment...', 'info');

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {
        this.log(`Warning closing browser: ${e.message}`, 'warn');
      }
    }

    // Kill UI process
    if (this.uiProcess) {
      try {
        this.uiProcess.kill();
      } catch (e) {
        this.log(`Warning killing UI process: ${e.message}`, 'warn');
      }
    }

    // Kill NAR process
    if (this.narProcess) {
      try {
        this.narProcess.kill();
      } catch (e) {
        this.log(`Warning killing NAR process: ${e.message}`, 'warn');
      }
    }

    this.log('Test environment cleaned up');
  }

  /**
   * Wait for specific text to appear in the UI output
   * @param {string} expectedText - The text to wait for
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<boolean>} True if text appears
   */
  async waitForOutput(expectedText, timeout = 10000) {
    try {
      // Use optimized selectors with caching
      const outputSelector = '#repl-output, .repl-output, [data-testid="repl-output"], pre';
      await this.page.waitForSelector(outputSelector, { timeout: 2000 });

      await this.page.waitForFunction(
        (expected) => {
          const output = document.querySelector('#repl-output') ||
                        document.querySelector('.repl-output') ||
                        document.querySelector('[data-testid="repl-output"]') ||
                        document.querySelector('pre');
          return output ? output.textContent.includes(expected) : false;
        },
        { timeout, polling: 500 }, // Poll every 500ms instead of continuously
        expectedText
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract concepts from the UI visualization
   * @returns {Promise<Array>} Array of concept representations
   */
  async extractUIConcepts() {
    return await this.page.evaluate(() => {
      const conceptElements = document.querySelectorAll('.concept, [class*="concept"], .node, [id*="concept"]');
      return Array.from(conceptElements).map(el => ({
        id: el.id,
        className: el.className,
        textContent: el.textContent ? el.textContent.trim() : '',
        isVisible: !el.hidden && el.offsetParent !== null
      }));
    });
  }

  /**
   * Get current REPL output content
   * @returns {Promise<string>} The REPL output text
   */
  async getReplOutput() {
    return await this.page.evaluate(() => {
      const selectors = ['#repl-output', '.repl-output', '[data-testid="repl-output"]', 'pre'];
      let output = null;

      for (const selector of selectors) {
        output = document.querySelector(selector);
        if (output) break;
      }

      return output ? output.textContent : '';
    });
  }

  /**
   * Find an element with caching to improve performance
   * @param {string} selector - The CSS selector to find
   * @param {boolean} useCache - Whether to use caching
   * @returns {Promise<Object>} Element information or null
   */
  async findElement(selector, useCache = true) {
    if (useCache && this._elementCache.has(selector)) {
      const cached = this._elementCache.get(selector);
      // Verify element still exists in DOM
      const stillExists = await this.page.evaluate(sel => !!document.querySelector(sel), selector);
      if (stillExists) {
        return cached;
      } else {
        this._elementCache.delete(selector); // Remove stale cache
      }
    }

    const elementInfo = await this.page.evaluate(sel => {
      const element = document.querySelector(sel);
      if (!element) return null;

      return {
        exists: true,
        tagName: element.tagName,
        id: element.id,
        className: element.className,
        textContent: element.textContent?.substring(0, 1000) || '', // Limit text length
        isVisible: !!(element.offsetParent !== null || element.getClientRects().length > 0)
      };
    }, selector);

    if (useCache && elementInfo) {
      this._elementCache.set(selector, elementInfo);
    }

    return elementInfo;
  }

  /**
   * Run the complete test lifecycle
   * @returns {Promise<boolean>} True if the test was successful
   */
  async run() {
    let success = false;

    try {
      success = await this.runCompleteTest();
    } catch (error) {
      this.testResults.errors.push(error);
    } finally {
      const reportSuccess = this.generateTestReport();
      await this.tearDown();

      // Return the more comprehensive result
      const finalSuccess = success && reportSuccess;
      this.log(`Final Test Outcome: ${finalSuccess ? 'SUCCESS' : 'FAILURE'}`,
               finalSuccess ? 'info' : 'error');

      return finalSuccess;
    }
  }
}

/**
 * Utility function to run a test with different configurations
 * @param {Function} testClass - The test class constructor
 * @param {Object} configs - Configuration options
 */
export async function runWithConfig(testClass, configs) {
  const { serverConfig = null, uiConfig = null, extraArgs = [] } = configs;
  
  const config = serverConfig || {
    port: 8080,
    uiPort: 5173,
    narOptions: {
      lm: { enabled: false },
      memory: {
        conceptBag: { capacity: 1000 },
        taskBag: { capacity: 1000 }
      },
      cycle: {
        maxTasksPerCycle: 10
      }
    }
  };

  const uiCfg = uiConfig || {};
  const testRunner = new testClass(config, uiCfg);
  const success = await testRunner.run();
  
  return success;
}