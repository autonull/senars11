import { categorizeMessage } from '../notebook/MessageFilter.js';

export class MessageRouter {
    constructor(app) {
        this.app = app;
    }

    handleMessage(message) {
        console.log('[MessageRouter] Received:', message);
        this.app.messageCount++;
        this.app.updateStats();

        // 1. LM Activities
        this._handleLMActivity(message);

        // 2. Notebook Handling
        this._handleNotebook(message);

        // 3. Components Updates
        this._handleComponents(message);
    }

    _handleLMActivity(message) {
        const indicator = this.app.lmActivityIndicator;
        if (!indicator) return;

        if (message.type === 'lm:prompt:start') indicator.show();
        if (message.type === 'lm:prompt:complete') indicator.hide();
        if (message.type === 'lm:error') indicator.showError(message.payload?.error);
    }

    _handleNotebook(message) {
        const notebook = this.app.getNotebook();
        if (!notebook) return;

        switch (message.type) {
            case 'visualization':
                this._handleVisualization(notebook, message.payload);
                break;
            case 'ui-command':
                this._handleUICommand(message.payload);
                break;
            case 'agent/prompt':
                this._handleAgentPrompt(notebook, message.payload);
                break;
            default:
                this._logGenericMessage(message);
        }
    }

    _handleVisualization(notebook, payload) {
        const { type, data, content } = payload;
        if (type === 'markdown') {
            notebook.createMarkdownCell(content || data);
        } else if (type === 'graph' || type === 'chart') {
            const widgetType = type === 'graph' ? 'GraphWidget' : 'ChartWidget';
            notebook.createWidgetCell(widgetType, data);
        }
    }

    _handleUICommand(payload) {
        const { command, args } = payload;
        const fullCommand = `/${command} ${args}`;
        this.app.logger.log(`System requested UI Command: ${fullCommand}`, 'system');
        this.app.commandProcessor?.processCommand(fullCommand, true);
    }

    _handleAgentPrompt(notebook, payload) {
        const { question, id } = payload;
        notebook.createPromptCell(question, (response) => {
            this.app.connection?.sendMessage('agent/response', { id, response });
        });
    }

    _logGenericMessage(message) {
        const category = categorizeMessage(message);

        if (category !== 'unknown' && category !== 'metric') {
            let content = message.content || message.payload;
            if (message.payload?.answer) content = message.payload.answer;

            if (content && typeof content === 'object') {
                content = JSON.stringify(content);
            }

            if (content) {
                this.app.logger.log(content, message.type || category);
            }
        }
    }

    _handleComponents(message) {
        try {
            const graphComp = this.app.components.get('graph');
            if (graphComp) {
                if (message.type === 'reasoning:concept') graphComp.graphManager?.updateGraph(message);
                if (message.type === 'memory:focus:promote') graphComp.graphManager?.animateGlow(message.payload?.id || message.payload?.nodeId, 1.0);
                if (message.type === 'concept.created') graphComp.graphManager?.animateFadeIn(message.payload?.id);
                graphComp.update(message);
            }

            const memComp = this.app.components.get('memory');
            if (message.type === 'memorySnapshot') memComp?.update(message.payload);

            const derComp = this.app.components.get('derivation');
            if (message.type === 'reasoning:derivation') {
                derComp?.addDerivation(message.payload);
                graphComp?.graphManager?.handleDerivation?.(message);
            }

            const metricsComp = this.app.components.get('metrics');
            if (message.type === 'metrics:update' || message.type === 'metrics.updated') {
                metricsComp?.update(message.payload);
            }

            if (message.payload?.cycle) {
                this.app.cycleCount = message.payload.cycle;
                this.app.updateStats();
            }

        } catch (e) {
            console.error('Error updating components:', e);
        }
    }
}
