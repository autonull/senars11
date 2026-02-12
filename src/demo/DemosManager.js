/**
 * DemosManager - handles the demo content and execution logic
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import {FileSystemDemoSource} from './FileSystemDemoSource.js';
import {BuiltinDemoSource} from './BuiltinDemoSource.js';
import {ProcessDemoRunner} from './ProcessDemoRunner.js';

export class DemosManager {
    constructor() {
        this.sources = [
            new BuiltinDemoSource(),
            new FileSystemDemoSource()
        ];
        this.processRunner = new ProcessDemoRunner();
        this.demos = new Map();
        this.currentRunningDemoId = null;
    }

    async initialize() {
        this.demos.clear();

        for (const source of this.sources) {
            try {
                const demos = await source.getDemos();
                for (const demo of demos) {
                    this.demos.set(demo.id, {
                        ...demo,
                        source // Attach source to demo object for later use
                    });
                }
            } catch (error) {
                console.error(`Error loading demos from source ${source.constructor.name}:`, error);
            }
        }
    }

    getAvailableDemos() {
        return Array.from(this.demos.values()).map(demo => ({
            id: demo.id,
            name: demo.name,
            description: demo.description,
            stepDelay: demo.stepDelay || 1000,
            handler: (nar, sendDemoStep, waitIfNotPaused, params) =>
                this.runDemo(demo.id, nar, sendDemoStep, waitIfNotPaused, params),
            type: demo.type,
            parameters: demo.parameters
        }));
    }

    async runDemo(demoId, nar, sendDemoStep, waitIfNotPaused, params = {}) {
        const demo = this.demos.get(demoId);
        if (!demo) throw new Error(`Demo ${demoId} not found`);

        this.currentRunningDemoId = demoId;

        try {
            if (demo.type === 'process') {
                await this.runProcessDemo(demo, sendDemoStep);
            } else {
                const steps = await demo.source.loadDemoSteps(demo.path);
                await this._executeDemoSteps(nar, sendDemoStep, waitIfNotPaused, demoId, steps, params);
            }
        } finally {
            this.currentRunningDemoId = null;
        }
    }

    async runProcessDemo(demo, sendDemoStep) {
        return new Promise((resolve, reject) => {
            this.processRunner.start(demo.path,
                (text, type) => sendDemoStep(demo.id, 0, text),
                (code) => (code === 0 || code === null) ? resolve() : reject(new Error(`Exit code ${code}`))
            );
        });
    }

    async runCustomDemo(code, type, sendDemoStep, waitIfNotPaused, nar) {
        this.currentRunningDemoId = 'custom';
        try {
            if (type === 'process') {
                const tempPath = path.join(os.tmpdir(), `senars_custom_${Date.now()}.js`);
                await fs.promises.writeFile(tempPath, code);
                try {
                    await this.runProcessDemo({path: tempPath, id: 'custom'}, sendDemoStep);
                } finally {
                    await fs.promises.unlink(tempPath).catch(() => {
                    });
                }
            } else {
                // Helper to parse steps
                const parser = new FileSystemDemoSource();
                await this._executeDemoSteps(nar, sendDemoStep, waitIfNotPaused, 'custom', parser.parseSteps(code));
            }
        } finally {
            this.currentRunningDemoId = null;
        }
    }

    stopCurrentDemo() {
        this.processRunner.stop();
        this.currentRunningDemoId = null;
    }

    async _executeDemoSteps(nar, sendDemoStep, waitIfNotPaused, demoId, steps, params = {}) {
        const stepDelay = params.stepDelay || 1000;

        for (const [index, step] of steps.entries()) {
            await sendDemoStep(demoId, index + 1, step.description);
            if (step.input && nar) await this._executeInputSafely(nar, demoId, index + 1, step.input, sendDemoStep);
            if (index < steps.length - 1) await waitIfNotPaused(stepDelay);
        }
    }

    async _executeInputSafely(nar, demoId, step, input, sendDemoStep) {
        try {
            if (input.startsWith('/')) {
                const parts = input.substring(1).split(/\s+/);
                const cmd = parts[0];
                const args = parts.slice(1);

                // Try executeCommand if available (Agent usually has it via mixins or directly)
                if (typeof nar.executeCommand === 'function') {
                    await nar.executeCommand(cmd, ...args);
                } else {
                    console.warn(`Command execution not supported by this NAR instance: ${cmd}`);
                }
            } else {
                await nar.input(input);
            }
        } catch (error) {
            console.error(`Step ${step} error:`, error);
            sendDemoStep?.(demoId, step, `Error: ${error.message}`);
        }
    }

    async getDemoSource(demoId) {
        const demo = this.demos.get(demoId);
        if (demo && demo.source && demo.source.getFileContent) {
            return await demo.source.getFileContent(demo.path);
        }
        return '// Source not available';
    }
}
