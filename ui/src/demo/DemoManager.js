import { Config } from '../config/Config.js';

/**
 * DemoManager handles demo sequences and execution
 */
export class DemoManager {
  constructor(commandProcessor, logger) {
    this.commandProcessor = commandProcessor;
    this.logger = logger;
    this.demoDelay = Config.getConstants().DEMO_DELAY;
    this.isRunning = false;

    // Define demo sequences
    this.demos = this._initializeDemos();
    this.descriptions = this._initializeDescriptions();
  }

  /**
   * Initialize demo sequences
   */
  _initializeDemos() {
    return {
      inheritance: [
        '<{cat} --> animal>.',
        '<{lion} --> cat>.',
        '<lion --> animal>?',
        '5'
      ],
      similarity: [
        '<(bird & flyer) <-> (bat & flyer)>.',
        '<bird <-> flyer>?',
        '<bat <-> flyer>?'
      ],
      temporal: [
        '<(sky & dark) =/> (rain & likely)>.',
        '<(clouds & gathering) =/> (sky & dark)>.',
        '<clouds & gathering> ?'
      ]
    };
  }

  /**
   * Initialize demo descriptions
   */
  _initializeDescriptions() {
    return {
      inheritance: 'Demonstrates inheritance relationships in NARS',
      similarity: 'Shows similarity-based reasoning',
      temporal: 'Explores temporal inference capabilities'
    };
  }

  /**
   * Run a specific demo
   */
  async runDemo(demoName) {
    if (!this._validateDemo(demoName)) return false;

    this.isRunning = true;
    const commands = this.demos[demoName];

    this.logger.log(`Running ${demoName} demo`, 'info', '🎬');

    // Execute commands sequentially with delay using async/await pattern
    try {
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        this.commandProcessor.processCommand(cmd);

        // Wait for the delay before executing the next command
        await this._delay(this.demoDelay);
      }
    } catch (error) {
      this.logger.log(`Error running demo: ${error.message}`, 'error', '❌');
    } finally {
      // Reset running status after completion
      setTimeout(() => {
        this.isRunning = false;
      }, this.demoDelay);
    }

    return true;
  }

  /**
   * Validate demo parameters before running
   */
  _validateDemo(demoName) {
    if (!demoName) {
      this.logger.log('Please select a demo', 'warning', '⚠️');
      return false;
    }

    if (this.isRunning) {
      this.logger.log('Demo already running', 'warning', '⚠️');
      return false;
    }

    if (!this.demos[demoName]) {
      this.logger.log(`Unknown demo: ${demoName}`, 'error', '❌');
      return false;
    }

    return true;
  }

  /**
   * Delay helper function for async execution
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get available demo names
   */
  getDemoNames() {
    return Object.keys(this.demos);
  }

  /**
   * Get demo description
   */
  getDemoDescription(demoName) {
    return this.descriptions[demoName] || 'Demo description not available';
  }
}