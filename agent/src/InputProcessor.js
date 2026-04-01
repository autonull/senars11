import {handleError, logError} from '@senars/core';
import {AGENT_EVENTS} from './constants.js';

export class InputProcessor {
    constructor(agent) {
        this.agent = agent;
    }

    async processInput(input) {
        const trimmed = input.trim();

        if (!trimmed) return this.agent.executeCommand('next');
        if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) return '';

        if (this.agent.runState.isRunning) {
            this.agent._stopRun();
        }

        this.agent.sessionState.history.push(trimmed);

        if (trimmed.startsWith('/')) {
            const [command, ...args] = trimmed.slice(1).split(' ');
            return this.agent.executeCommand(command, ...args);
        }

        const [command, ...args] = trimmed.split(' ');
        if (this.agent.commandRegistry.get(command)) {
            return this.agent.executeCommand(command, ...args);
        }

        return this._processAgentInput(trimmed);
    }

    async _processAgentInput(input) {
        try {
            return await this.agent.agentStreamer.accumulateStreamResponse(input);
        } catch (error) {
            logError(error, 'LM processing');
            return this._handleProcessingError(input, error);
        }
    }

    async _handleProcessingError(input, lmError) {
        const shouldTryNarsese = !this.agent.inputProcessingConfig.checkNarseseSyntax || this._isPotentialNarsese(input);

        if (this.agent.inputProcessingConfig.enableNarseseFallback && shouldTryNarsese) {
            try {
                return await this.processNarsese(input);
            } catch (narseseError) {
                logError(narseseError, 'Narsese processing');
                return `💭 Agent processed: Input "${input}" may not be valid Narsese. LM Error: ${lmError.message}`;
            }
        }
        return handleError(lmError, 'Agent processing');
    }

    async processNarsese(input) {
        const taskId = this.agent.inputQueue.addTask(input, 0.5, {
            type: 'user_input',
            source: 'narsese',
            timestamp: Date.now()
        });

        try {
            const startTime = Date.now();
            const result = await this.agent.input(input);
            const duration = Date.now() - startTime;

            if (result !== false && result !== null) {
                this.agent.inputQueue.updatePriorityById(taskId, 0.8);
                this.agent.emit(AGENT_EVENTS.NARSESE_PROCESSED, {
                    input, result, duration, taskId, beliefs: this.agent.getBeliefs?.() ?? []
                });
                return `✅ Input processed successfully (${duration}ms)`;
            }

            const task = this.agent.inputQueue.getTaskById(taskId);
            if (task) task.metadata.status = 'duplicate/failed';
            return '❌ Failed to process input (possibly duplicate or invalid)';
        } catch (error) {
            this._handleNarseseError(input, error, taskId);
            return `❌ Error: ${error.message}`;
        }
    }

    _handleNarseseError(input, error, taskId) {
        const task = this.agent.inputQueue.getTaskById(taskId);
        if (task) {
            task.metadata.error = true;
            task.metadata.errorTime = Date.now();
            this.agent.inputQueue.updatePriorityById(taskId, 0.1);
        }
        this.agent.emit(AGENT_EVENTS.NARSESE_ERROR, {input, error: error.message, taskId});
    }

    _isPotentialNarsese(input) {
        // More robust detection including ( ) syntax and various copulas
        const patterns = [
            // Statement with standard copulas and brackets/parens
            // Looks for ( ... --> ... ) or < ... --> ... >
            /[<(\[]\s*[\w\s\-'"()[\]]+\s*(?:-->|<->|==>|<=>|=\/>|=\|)\s*[\w\s\-'"()[\]]+\s*[>)\].!]/,

            // Explicit Operation
            /\^[\w\s\-]+/,

            // Explicit goal/question/belief punctuation at end
            /[>)]\s*[!?.]$/,

            // Truth values
            /%[\d.]*(?:;[\d.]*)?%/,

            // Legacy patterns for safety
            /<[\w\s\-'"()[\]]*\s*\^[\w\s\-'"()[\]]*>/,

            // Simple atomic term with punctuation: e.g. "a." or "word?" or "term!"
            /^[\w\-]+\s*[.!?]$/
        ];

        // Also check if it looks like a simple term followed by punctuation
        // e.g. (bird --> flyer).
        if (input.includes('-->') || input.includes('<->') || input.includes('==>')) {
            return true;
        }

        return patterns.some(p => p.test(input));
    }
}
