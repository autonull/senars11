import {promises as fs} from 'fs';
import {Logger} from '@senars/core';
import {AGENT_EVENTS} from '../agent/constants.js';

class ReasoningTrajectoryLogger {
    constructor(agent) {
        this.agent = agent;
        this.trajectory = [];
        this.isLogging = false;

        const events = [
            [AGENT_EVENTS.LLM_PROMPT, 'llm_prompt'],
            [AGENT_EVENTS.TOOL_CALL, 'tool_call'],
            [AGENT_EVENTS.LLM_RESPONSE, 'lm_response'],
            ['lm.prompt', 'lm_prompt'],
            ['lm.response', 'lm_response'],
            ['lm.failure', 'lm_failure']
        ];

        events.forEach(([evt, type]) =>
            this.agent.eventBus?.on(evt, data => this.logStep(type, data))
        );
    }

    startTrajectory() {
        this.trajectory = [];
        this.isLogging = true;
    }

    logStep(type, data) {
        if (!this.isLogging) {
            return;
        }
        this.trajectory.push({timestamp: Date.now(), type, ...data});
    }

    async endTrajectory(filePath) {
        this.isLogging = false;
        if (!filePath) {
            return this.trajectory;
        }

        try {
            await fs.writeFile(filePath, JSON.stringify(this.trajectory, null, 2));
        } catch (error) {
            Logger.error(`Failed to write trajectory to ${filePath}:`, error);
        }
        return this.trajectory;
    }
}

export {ReasoningTrajectoryLogger};
