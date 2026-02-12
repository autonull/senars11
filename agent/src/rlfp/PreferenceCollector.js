import fs from 'fs';
import {Logger} from '../../../core/src/util/Logger.js';

class PreferenceCollector {
    constructor() {
        this.preferences = [];
    }

    async collectPreference(pathA, pathB) {
        let trajectoryA, trajectoryB;
        try {
            trajectoryA = await this.loadTrajectory(pathA);
            trajectoryB = await this.loadTrajectory(pathB);
        } catch (e) {
            Logger.error("Error loading trajectories:", e.message);
            return null;
        }

        Logger.info('\n==========================================');
        Logger.info('=== Trajectory A ===');
        Logger.info(this._formatTrajectory(trajectoryA));
        Logger.info('\n=== Trajectory B ===');
        Logger.info(this._formatTrajectory(trajectoryB));
        Logger.info('==========================================\n');

        // Dynamic import to avoid loading inquirer in browser environments
        const inquirer = (await import('inquirer')).default;

        const {preference} = await inquirer.prompt([{
            type: 'list',
            name: 'preference',
            message: 'Which trajectory do you prefer?',
            choices: [
                {name: 'Trajectory A', value: 'A'},
                {name: 'Trajectory B', value: 'B'},
                {name: 'Skip / Neither', value: 'SKIP'}
            ]
        }]);

        if (preference === 'SKIP') return null;

        const data = {
            trajectoryA,
            trajectoryB,
            preference,
            timestamp: Date.now(),
            files: {A: pathA, B: pathB}
        };

        this.preferences.push(data);
        return data;
    }

    /**
     * Programmatically add a preference (e.g. from UI)
     */
    addPreference(preferenceData) {
        this.preferences.push({
            ...preferenceData,
            timestamp: Date.now()
        });
    }

    async loadTrajectory(path) {
        return JSON.parse(fs.readFileSync(path, 'utf-8'));
    }

    _formatTrajectory(traj) {
        if (!Array.isArray(traj)) return "Invalid trajectory";

        return traj.map(step => {
            const ts = step.timestamp ? new Date(step.timestamp).toISOString().split('T')[1].split('.')[0] : '';
            let content = JSON.stringify(step);

            if (step.type === 'llm_prompt') {
                const msg = step.messages?.[0]?.content || step.messages || '';
                const txt = typeof msg === 'string' ? msg.slice(0, 100) : JSON.stringify(msg);
                content = `LLM Prompt: "${txt.replace(/\n/g, ' ')}..."`;
            } else if (step.type === 'tool_call') {
                content = `Tool: ${step.name}(${JSON.stringify(step.args)})`;
            } else if (step.type === 'lm_response') {
                content = `Response: ${JSON.stringify(step.content || step)}`;
            }
            return `${ts} [${step.type}] ${content}`;
        }).join('\n');
    }

    savePreferences(path) {
        fs.writeFileSync(path, JSON.stringify(this.preferences, null, 2));
    }
}

export {PreferenceCollector};
