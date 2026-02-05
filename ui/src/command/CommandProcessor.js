import { EVENTS } from '../config/constants.js';

export class CommandProcessor {
    constructor(connectionManager, notebookLogger, graphManager) {
        this.connection = connectionManager;
        this.logger = notebookLogger;
        this.graphManager = graphManager;
        this.layout = null; // Will be set via setLayout

        this.commands = new Map([
            ['help', { description: 'Show help', fn: (ctx) => this._executeHelp(ctx) }],
            ['clear', { description: 'Clear console', fn: (ctx) => this._executeClear(ctx) }],
            ['viz', { description: 'Visualization test', fn: (ctx) => this._executeViz(ctx) }],
            ['inspect', { description: 'Inspect object', fn: (ctx) => this._executeInspect(ctx) }],
            ['layout', { description: 'Change layout (full-repl, standard)', fn: (ctx) => this._executeLayout(ctx) }],
            ['nodes', { description: 'Count nodes in graph', fn: (ctx) => this._executeNodes(ctx) }]
        ]);
    }

    setLayout(layout) {
        this.layout = layout;
    }

    setGraphManager(graphManager) {
        this.graphManager = graphManager;
    }

    processCommand(text, isSystem = false, mode = 'narsese') {
        if (!text) return;

        if (text.startsWith('/')) {
            this._handleSlashCommand(text);
            return;
        }

        this._handleInputInternal(text, mode);
    }

    _handleSlashCommand(text) {
        const parts = text.slice(1).trim().split(/\s+/);
        const cmdName = parts[0];
        const args = parts.slice(1);

        const command = this.commands.get(cmdName);
        if (command) {
            command.fn({ args, text });
        } else {
            this.logger.log(`Unknown command: /${cmdName}`, 'error');
        }
    }

    _handleInputInternal(text, mode) {
        if (!this.connection?.isConnected()) {
            this.logger.log('Not connected', 'error');
            return;
        }

        const type = (mode === 'agent' || mode === 'metta' || text.startsWith('!'))
            ? 'agent/input'
            : 'narseseInput';
        this.connection.sendMessage(type, { text });
    }

    _executeHelp(ctx) {
        let helpText = 'Available commands:\n';
        for (const [name, cmd] of this.commands) {
            helpText += `- /${name}: ${cmd.description}\n`;
        }
        this.logger.log(helpText, 'info');
        return true;
    }

    _executeClear(ctx) {
        this.logger.clearLogs();
        return true;
    }

    _executeViz(ctx) {
        const type = ctx.args[0];
        if (type === 'graph') {
            this.logger.logWidget('GraphWidget', [
                { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { source: 'a', target: 'b', label: 'rel' }
            ]);
        } else if (type === 'markdown') {
            this.logger.logMarkdown('# Hello\n\n**Bold** text.');
        } else {
            this.logger.log('Usage: /viz <graph|markdown>', 'info');
        }
        return true;
    }

    _executeNodes(ctx) {
        if (this.graphManager) {
            const count = this.graphManager.getNodeCount();
            this.logger.log(`Graph has ${count} nodes`, 'info');
        } else {
            this.logger.log('Graph manager not available', 'error');
        }
        return true;
    }

    _executeInspect(ctx) {
        const term = ctx.args?.[0];
        if (!term) {
            this.logger.log('Usage: /inspect <term>', 'error');
            return false;
        }

        // 1. Dispatch event to select in memory inspector
        document.dispatchEvent(new CustomEvent(EVENTS.CONCEPT_SELECT, {
            detail: { concept: { term } }
        }));

        // 2. Focus in graph if available
        if (this.graphManager) {
            this.graphManager.focusNode(term);
            this.logger.log(`Inspecting ${term}...`, 'info', '🔍');
        } else {
            this.logger.log(`Selected ${term} in Memory Inspector`, 'info');
        }

        return true;
    }

    _executeLayout(ctx) {
        if (!this.layout) {
            this.logger.log('Layout manager not available', 'error');
            return false;
        }

        const mode = ctx.args?.[0];
        if (!mode) {
             this.logger.log('Usage: /layout <full-repl|standard>', 'error');
             return false;
        }

        try {
            this._applyLayoutMode(mode);
        } catch (e) {
            console.error('Layout error', e);
            this.logger.log(`Failed to update layout: ${e.message}`, 'error');
        }
        return true;
    }

    _applyLayoutMode(mode) {
        const { notebookItem, sidebarItem } = this._findLayoutComponents();
        if (!notebookItem || !sidebarItem) {
             throw new Error('Could not find notebook or sidebar components');
        }

        const setWidth = (item, w) => {
            if (item.config) item.config.width = w;
            else item.width = w;
        };

        if (mode === 'full-notebook' || mode === 'full-repl' || mode === 'collapse-sidebar') {
            setWidth(notebookItem, 100);
            setWidth(sidebarItem, 0);
            this.layout.updateSize();
            this.logger.log('Layout: Full Notebook', 'info', '🖥️');
        } else if (mode === 'standard') {
            setWidth(notebookItem, 70);
            setWidth(sidebarItem, 30);
            this.layout.updateSize();
            this.logger.log('Layout: Standard', 'info', '🖥️');
        } else {
            throw new Error(`Unknown layout mode: ${mode}`);
        }
    }

    _findLayoutComponents() {
        const root = this.layout.root;
        if (!root) return {};

        const findItem = (item, name) => {
            if (item.componentName === name) return item;
            if (item.contentItems) {
                for (const c of item.contentItems) {
                    const found = findItem(c, name);
                    if (found) return found;
                }
            }
            return null;
        };

        const notebookItem = findItem(root, 'notebookComponent');
        if (!notebookItem) return {};

        let currentItem = notebookItem;
        let row = null;

        if (currentItem?.parent?.type === 'stack') {
            currentItem = currentItem.parent;
        }

        if (currentItem?.parent?.type === 'row') {
            row = currentItem.parent;
        }

        if (row) {
             const itemIndex = row.contentItems.indexOf(currentItem);
             const sidebarIndex = itemIndex === 0 ? 1 : 0;
             const sidebarItem = row.contentItems[sidebarIndex];
             return { notebookItem: currentItem, sidebarItem };
        }

        return {};
    }
}
