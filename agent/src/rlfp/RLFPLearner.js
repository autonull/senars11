import fs from 'fs';
import {Logger} from '@senars/core';

class RLFPLearner {
    constructor(agent) {
        this.agent = agent;
        this.outputFile = 'rlfp_training_data.jsonl';
    }

    updateModel(preferences) {
        const prefs = Array.isArray(preferences) ? preferences : [preferences];
        const validPrefs = prefs.filter(p => p?.preference && p.preference !== 'SKIP');

        if (!validPrefs.length) {
            return;
        }

        Logger.info(`RLFPLearner: Processing ${validPrefs.length} preference(s)...`);

        let count = 0;
        for (const pref of validPrefs) {
            const entry = this._prepareTrainingEntry(pref);
            if (entry) {
                this._appendToFile(entry);
                count++;
            }
        }

        Logger.info(`RLFPLearner: Appended ${count} examples to ${this.outputFile}`);
    }

    _prepareTrainingEntry(pref) {
        const promptStep = pref.trajectoryA.find(s => s.type === 'llm_prompt');
        const prompt = promptStep?.messages || "unknown_prompt";

        const [chosen, rejected] = pref.preference === 'A'
            ? [pref.trajectoryA, pref.trajectoryB]
            : [pref.trajectoryB, pref.trajectoryA];

        return {
            timestamp: Date.now(),
            prompt,
            chosen: this._extractCompletion(chosen),
            rejected: this._extractCompletion(rejected),
            full_chosen_trajectory: chosen,
            full_rejected_trajectory: rejected
        };
    }

    _extractCompletion(trajectory) {
        return trajectory
            .filter(s => s.type !== 'llm_prompt')
            .map(s => {
                if (s.type === 'tool_call') {
                    return `<tool_call>${s.name}(${JSON.stringify(s.args)})</tool_call>`;
                }
                if (s.type === 'lm_response') {
                    return s.content;
                }
                return JSON.stringify(s);
            })
            .join('\n');
    }

    _appendToFile(entry) {
        try {
            fs.appendFileSync(this.outputFile, `${JSON.stringify(entry)}\n`);
        } catch (error) {
            Logger.error(`RLFPLearner write error: ${error.message}`);
        }
    }
}

export {RLFPLearner};
