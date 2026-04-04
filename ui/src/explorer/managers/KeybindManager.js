import { ShortcutsModal } from '../../components/ShortcutsModal.js';

export class KeybindManager {
    constructor(app, commandRegistry) {
        this.app = app;
        this.commandRegistry = commandRegistry;
    }

    initialize() {
        document.addEventListener('keydown', (e) => this._handleKeydown(e));
    }

    _handleKeydown(e) {
        // Shortcuts valid even when focused in input
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            this.app.toggleWidget('layers');
            this.app.toggleWidget('inspector');
            return;
        }

        if (e.key === 'F1') {
            e.preventDefault();
            this.app.commandPalette.toggle();
            return;
        }

        // Ignore subsequent shortcuts if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

        const keyActions = {
            'Escape': () => this.app.graph.goBack?.(),
            'Delete': () => this.commandRegistry.handleDelete(),
            'Backspace': () => this.commandRegistry.handleDelete(),
            '?': () => new ShortcutsModal().show(),
            ' ': () => { e.preventDefault(); this.app.toggleReasoner(!this.app.isReasonerRunning); }
        };

        if (keyActions[e.key]) { keyActions[e.key](); return; }

        const ctrlActions = {
            'l': () => { e.preventDefault(); document.getElementById('log-content').innerHTML = ''; this.app.log('Log cleared', 'system'); },
            'g': () => { e.preventDefault(); document.getElementById('search-input')?.focus(); },
            's': () => { e.preventDefault(); this.app.fileManager.handleSaveJSON(); },
            'o': () => { e.preventDefault(); this.app.fileManager.handleLoadJSON(); }
        };

        if ((e.ctrlKey || e.metaKey) && ctrlActions[e.key]) { ctrlActions[e.key](); return; }

        if (e.shiftKey && e.key === 'S') {
            e.preventDefault();
            this.app.stepReasoner(10);
            this.app.log('Stepping 10 cycles...', 'system');
        } else if (e.altKey && e.key === 's') {
            e.preventDefault();
            this.app.stepReasoner(50);
            this.app.log('Stepping 50 cycles...', 'system');
        }
    }
}
