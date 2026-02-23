import { SeNARS } from '@senars/core';
import { SeNARSBridge as MettaToSeNARSBridge } from '@senars/metta';
import { mergeConfig } from '../utils/ConfigHelper.js';

const BRIDGE_DEFAULTS = {
    cyclesPerStep: 1,
    maxQuestions: 10,
    maxGoals: 10,
    autoStart: true
};

export class SeNARSBridge {
    constructor(agent, config = {}) {
        this.agent = agent;
        this.config = mergeConfig(BRIDGE_DEFAULTS, config);
        this.senars = new SeNARS(this.config);
        this.mettaBridge = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        await this.senars.start();

        if (this.agent?.metta && MettaToSeNARSBridge) {
            this.mettaBridge = new MettaToSeNARSBridge(this.senars.nar, this.agent.metta);
            if (this.agent.metta.ground) {
                this.mettaBridge.registerPrimitives(this.agent.metta.ground);
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
        this.senars.reset();
    }

    async close() {
        if (this.senars) await this.senars.dispose();
    }
}
