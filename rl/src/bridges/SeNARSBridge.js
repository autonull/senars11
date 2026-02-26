/**
 * SeNARS Bridge
 * Integration layer for SeNARS reasoning engine
 */
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    cyclesPerStep: 1,
    maxQuestions: 10,
    maxGoals: 10,
    autoStart: true
};

export class SeNARSBridge {
    constructor(agent, config = {}) {
        this.agent = agent;
        this.config = mergeConfig(DEFAULTS, config);
        this.senars = null;
        this.mettaBridge = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        const { SeNARS } = await import('@senars/core');
        this.senars = new SeNARS(this.config);
        await this.senars.start();

        if (this.agent?.metta) {
            const { SeNARSBridge: MettaToSeNARSBridge } = await import('@senars/metta');
            this.mettaBridge = new MettaToSeNARSBridge(this.senars.nar, this.agent.metta);
            this.mettaBridge.registerPrimitives(this.agent.metta.ground);
        }

        this.initialized = true;
    }

    async input(narsese) {
        await this.ensureInitialized();
        return this.senars.nar.input(narsese);
    }

    async ask(question, options = {}) {
        await this.ensureInitialized();
        return this.senars.ask(question, { maxQuestions: this.config.maxQuestions, ...options });
    }

    async achieve(goal, options = {}) {
        await this.ensureInitialized();
        return this.senars.achieve(goal, { maxGoals: this.config.maxGoals, ...options });
    }

    async runCycles(count) {
        await this.ensureInitialized();
        return this.senars.runCycles(count ?? this.config.cyclesPerStep);
    }

    async ensureInitialized() {
        if (!this.initialized) await this.initialize();
    }

    reset() {
        this.senars?.reset();
    }

    async close() {
        await this.senars?.dispose();
    }
}
