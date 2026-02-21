
import { SeNARS } from '@senars/core';
import { SeNARSBridge as MettaBridge } from '@senars/metta';

/**
 * SeNARS Bridge for RL Agent.
 * Integrates SeNARS reasoning engine and connects it to the agent's MeTTa interpreter.
 */
export class SeNARSBridge {
    constructor(agent, config = {}) {
        this.agent = agent;
        this.config = config;
        this.senars = new SeNARS(config);
        this.mettaBridge = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        // Start SeNARS (initializes NAR internally)
        await this.senars.start();

        // Connect Metta Bridge if agent has MeTTa interpreter
        if (this.agent && this.agent.metta) {
             // Pass the internal NAR instance to MettaBridge
             this.mettaBridge = new MettaBridge(this.senars.nar, this.agent.metta);

             // Register primitives like &nars-derive, &get-sti, etc.
             if (this.agent.metta.ground) {
                 this.mettaBridge.registerPrimitives(this.agent.metta.ground);
             }
        }

        this.initialized = true;
    }

    /**
     * Input a Narsese statement (belief or event).
     * @param {string} narsese
     */
    async input(narsese) {
        await this.ensureInitialized();
        return this.senars.nar.input(narsese);
    }

    /**
     * Ask a question (returns answer).
     * @param {string} question Narsese question
     * @param {Object} options
     */
    async ask(question, options = {}) {
        await this.ensureInitialized();
        return this.senars.ask(question, options);
    }

    /**
     * Try to achieve a goal.
     * @param {string} goal Narsese goal
     * @param {Object} options
     */
    async achieve(goal, options = {}) {
        await this.ensureInitialized();
        return this.senars.achieve(goal, options);
    }

    /**
     * Run reasoning cycles.
     * @param {number} count
     */
    async runCycles(count) {
        await this.ensureInitialized();
        return this.senars.runCycles(count);
    }

    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    /**
     * Reset the reasoning engine.
     */
    reset() {
        this.senars.reset();
    }
}
