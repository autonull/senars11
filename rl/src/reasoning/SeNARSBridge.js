
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

        await this.senars.start();

        // Check if MettaBridge is actually imported
        if (this.agent?.metta) {
             // Fallback for weird module resolution issue in test
             // If MettaBridge is undefined, it means the import failed.

             // Dynamic import as last resort
             let Bridge = MettaBridge;

             // If MettaBridge is undefined, try manual import
             // This is a hack for Jest + ESM issues with circular deps or index exports
             if (!Bridge) {
                 try {
                     const mod = await import('../../../metta/src/SeNARSBridge.js');
                     Bridge = mod.default || mod.SeNARSBridge;
                 } catch (e) {
                     // console.error("Could not load SeNARSBridge", e);
                 }
             }

             if (Bridge) {
                 this.mettaBridge = new Bridge(this.senars.nar, this.agent.metta);
                 if (this.agent.metta.ground) {
                     this.mettaBridge.registerPrimitives(this.agent.metta.ground);
                 }
             }
        }

        this.initialized = true;
    }

    async input(narsese) {
        await this.ensureInitialized();
        return this.senars.nar.input(narsese);
    }

    async ask(question, options = {}) {
        await this.ensureInitialized();
        return this.senars.ask(question, options);
    }

    async achieve(goal, options = {}) {
        await this.ensureInitialized();
        return this.senars.achieve(goal, options);
    }

    async runCycles(count) {
        await this.ensureInitialized();
        return this.senars.runCycles(count);
    }

    async ensureInitialized() {
        if (!this.initialized) await this.initialize();
    }

    reset() {
        this.senars.reset();
    }
}
