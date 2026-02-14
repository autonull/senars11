/**
 * View modes for log messages
 */
export const VIEW_MODES = {
    FULL: 'full',
    COMPACT: 'compact',
    HIDDEN: 'hidden'
};

/**
 * Message categories for REPL filtering
 */
export const MESSAGE_CATEGORIES = {
    reasoning: {
        id: 'reasoning',
        label: 'Reasoning',
        icon: '🧠',
        color: '#00d4ff',
        defaultMode: VIEW_MODES.FULL
    },
    'lm-call': {
        id: 'lm-call',
        label: 'LM Call',
        icon: '🤖',
        color: '#bb86fc',
        defaultMode: VIEW_MODES.COMPACT
    },
    system: {
        id: 'system',
        label: 'System',
        icon: '⚙️',
        color: '#888',
        defaultMode: VIEW_MODES.FULL
    },
    debug: {
        id: 'debug',
        label: 'Debug',
        icon: '🐛',
        color: '#666',
        defaultMode: VIEW_MODES.HIDDEN
    },
    'user-input': {
        id: 'user-input',
        label: 'User Input',
        icon: '💬',
        color: '#00ff88',
        defaultMode: VIEW_MODES.COMPACT
    },
    result: {
        id: 'result',
        label: 'Result',
        icon: '✨',
        color: '#ffbb00',
        defaultMode: VIEW_MODES.FULL
    },
    metric: {
        id: 'metric',
        label: 'Metrics',
        icon: '📊',
        color: '#999',
        defaultMode: VIEW_MODES.COMPACT
    },
    derivation: {
        id: 'derivation',
        label: 'Derivation',
        icon: '🔗',
        color: '#ff6b9d',
        defaultMode: VIEW_MODES.FULL
    },
    concept: {
        id: 'concept',
        label: 'Concept',
        icon: '🧠',
        color: '#00d4ff',
        defaultMode: VIEW_MODES.FULL
    },
    task: {
        id: 'task',
        label: 'Task',
        icon: '📝',
        color: '#ffcc00',
        defaultMode: VIEW_MODES.FULL
    },
    unknown: {
        id: 'unknown',
        label: 'Other',
        icon: '❓',
        color: '#666',
        defaultMode: VIEW_MODES.FULL
    }
};

/**
 * Categorize a message based on its type
 */
export function categorizeMessage(message) {
    const type = message.type || 'unknown';

    // Map message types to categories
    if (type.includes('concept')) {
        return 'concept';
    }
    if (type.includes('task')) {
        return 'task';
    }
    if (type.includes('reasoning') || type.includes('inference') || type.includes('derivation')) {
        return 'reasoning';
    }
    if (type.includes('lm') || type.includes('llm') || type.includes('language-model')) {
        return 'lm-call';
    }
    if (type === 'system' || type.includes('control') || type.includes('agent')) {
        return 'system';
    }
    if (type === 'debug') {
        return 'debug';
    }
    if (type === 'user-input' || type === 'user') {
        return 'user-input';
    }
    if (type === 'result' || type.includes('answer') || type.includes('query')) {
        return 'result';
    }
    if (type === 'metric' || type.includes('performance') || type.includes('stats')) {
        return 'metric';
    }
    if (type.includes('derive') || type.includes('proof')) {
        return 'derivation';
    }

    return 'unknown';
}

/**
 * Filter manager for REPL messages
 */
export class MessageFilter {
    constructor() {
        this.modeMap = new Map();
        this.searchTerm = '';

        // Initialize with defaults
        Object.values(MESSAGE_CATEGORIES).forEach(cat => {
            this.modeMap.set(cat.id, cat.defaultMode);
        });

        // Load saved filters
        this.loadFilters();
    }

    cycleCategoryMode(categoryId) {
        const current = this.modeMap.get(categoryId) || VIEW_MODES.FULL;
        let next;

        switch (current) {
            case VIEW_MODES.FULL:
                next = VIEW_MODES.COMPACT;
                break;
            case VIEW_MODES.COMPACT:
                next = VIEW_MODES.HIDDEN;
                break;
            case VIEW_MODES.HIDDEN:
                next = VIEW_MODES.FULL;
                break;
            default:
                next = VIEW_MODES.FULL;
        }

        this.modeMap.set(categoryId, next);
        this.saveFilters();
        return next;
    }

    setCategoryMode(categoryId, mode) {
        if (!Object.values(VIEW_MODES).includes(mode)) return;
        this.modeMap.set(categoryId, mode);
        this.saveFilters();
    }

    getCategoryMode(categoryId) {
        return this.modeMap.get(categoryId) || VIEW_MODES.FULL;
    }

    setSearchTerm(term) {
        this.searchTerm = term.toLowerCase();
    }

    getMessageViewMode(message) {
        const category = categorizeMessage(message);
        let mode = this.getCategoryMode(category);

        // If search term is present and matches, force at least COMPACT if it was HIDDEN
        // Or if it doesn't match, maybe hide it?
        // Requirement says: "Text search across all messages"
        if (this.searchTerm) {
            const content = message.content || message.payload?.result || JSON.stringify(message.payload) || '';
            const matches = content.toLowerCase().includes(this.searchTerm);

            if (!matches) {
                return VIEW_MODES.HIDDEN;
            } else if (mode === VIEW_MODES.HIDDEN) {
                // If it matches search but category is hidden, show it as compact or full?
                // Usually search overrides category filter.
                return VIEW_MODES.COMPACT;
            }
        }

        return mode;
    }

    // Deprecated, use getMessageViewMode
    shouldShowMessage(message) {
        return this.getMessageViewMode(message) !== VIEW_MODES.HIDDEN;
    }

    saveFilters() {
        const filters = Object.fromEntries(this.modeMap);
        localStorage.setItem('senars-message-filters-v2', JSON.stringify(filters));
    }

    loadFilters() {
        // Try v2 first
        const savedV2 = localStorage.getItem('senars-message-filters-v2');
        if (savedV2) {
            try {
                const filters = JSON.parse(savedV2);
                Object.entries(filters).forEach(([cat, mode]) => {
                    this.modeMap.set(cat, mode);
                });
                return;
            } catch (e) {
                console.error('Failed to load v2 filters:', e);
            }
        }

        // Fallback to v1 (convert boolean to FULL/HIDDEN)
        const savedV1 = localStorage.getItem('senars-message-filters');
        if (savedV1) {
            try {
                const filters = JSON.parse(savedV1);
                Object.entries(filters).forEach(([cat, visible]) => {
                    this.modeMap.set(cat, visible ? VIEW_MODES.FULL : VIEW_MODES.HIDDEN);
                });
            } catch (e) {
                console.error('Failed to load v1 filters:', e);
            }
        }
    }

    getAllCategories() {
        return Object.values(MESSAGE_CATEGORIES);
    }
}
