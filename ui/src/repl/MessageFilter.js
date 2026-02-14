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
    reasoning: { id: 'reasoning', label: 'Reasoning', icon: '🧠', color: '#00d4ff', defaultMode: VIEW_MODES.FULL },
    'lm-call': { id: 'lm-call', label: 'LM Call', icon: '🤖', color: '#bb86fc', defaultMode: VIEW_MODES.COMPACT },
    system: { id: 'system', label: 'System', icon: '⚙️', color: '#888', defaultMode: VIEW_MODES.FULL },
    debug: { id: 'debug', label: 'Debug', icon: '🐛', color: '#666', defaultMode: VIEW_MODES.HIDDEN },
    'user-input': { id: 'user-input', label: 'User Input', icon: '💬', color: '#00ff88', defaultMode: VIEW_MODES.COMPACT },
    result: { id: 'result', label: 'Result', icon: '✨', color: '#ffbb00', defaultMode: VIEW_MODES.FULL },
    metric: { id: 'metric', label: 'Metrics', icon: '📊', color: '#999', defaultMode: VIEW_MODES.COMPACT },
    derivation: { id: 'derivation', label: 'Derivation', icon: '🔗', color: '#ff6b9d', defaultMode: VIEW_MODES.FULL },
    concept: { id: 'concept', label: 'Concept', icon: '🧠', color: '#00d4ff', defaultMode: VIEW_MODES.FULL },
    task: { id: 'task', label: 'Task', icon: '📝', color: '#ffcc00', defaultMode: VIEW_MODES.FULL },
    unknown: { id: 'unknown', label: 'Other', icon: '❓', color: '#666', defaultMode: VIEW_MODES.FULL }
};

/**
 * Register a new message category dynamically
 */
export function registerMessageCategory(id, config) {
    if (MESSAGE_CATEGORIES[id]) {
        console.warn(`Category ${id} already exists, overwriting.`);
    }
    MESSAGE_CATEGORIES[id] = {
        id,
        label: config.label || id,
        icon: config.icon || '📦',
        color: config.color || '#888',
        defaultMode: config.defaultMode || VIEW_MODES.FULL
    };
}

/**
 * Categorize a message based on its type
 */
export function categorizeMessage(message) {
    const type = message.type || 'unknown';

    if (MESSAGE_CATEGORIES[type]) return type;

    if (type.includes('concept')) return 'concept';
    if (type.includes('task')) return 'task';
    if (['reasoning', 'inference', 'derivation'].some(t => type.includes(t))) return 'reasoning';
    if (['lm', 'llm', 'language-model'].some(t => type.includes(t))) return 'lm-call';
    if (type === 'system' || ['control', 'agent'].some(t => type.includes(t))) return 'system';
    if (type === 'debug') return 'debug';
    if (type === 'user-input' || type === 'user') return 'user-input';
    if (type === 'result' || ['answer', 'query'].some(t => type.includes(t))) return 'result';
    if (type === 'metric' || ['performance', 'stats'].some(t => type.includes(t))) return 'metric';
    if (['derive', 'proof'].some(t => type.includes(t))) return 'derivation';

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

        this.loadFilters();
    }

    cycleCategoryMode(categoryId) {
        const current = this.modeMap.get(categoryId) || VIEW_MODES.FULL;
        const next = current === VIEW_MODES.FULL ? VIEW_MODES.COMPACT :
                     current === VIEW_MODES.COMPACT ? VIEW_MODES.HIDDEN : VIEW_MODES.FULL;

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
        const mode = this.getCategoryMode(category);

        if (this.searchTerm) {
            const content = message.content || message.payload?.result || JSON.stringify(message.payload) || '';
            const matches = content.toLowerCase().includes(this.searchTerm);

            if (!matches) return VIEW_MODES.HIDDEN;
            if (mode === VIEW_MODES.HIDDEN) return VIEW_MODES.COMPACT;
        }

        return mode;
    }

    saveFilters() {
        try {
            const filters = Object.fromEntries(this.modeMap);
            localStorage.setItem('senars-message-filters-v2', JSON.stringify(filters));
        } catch (e) {
            console.warn('Failed to save filters', e);
        }
    }

    loadFilters() {
        try {
            const savedV2 = localStorage.getItem('senars-message-filters-v2');
            if (savedV2) {
                const filters = JSON.parse(savedV2);
                Object.entries(filters).forEach(([cat, mode]) => this.modeMap.set(cat, mode));
                return;
            }

            // Fallback to v1
            const savedV1 = localStorage.getItem('senars-message-filters');
            if (savedV1) {
                const filters = JSON.parse(savedV1);
                Object.entries(filters).forEach(([cat, visible]) => {
                    this.modeMap.set(cat, visible ? VIEW_MODES.FULL : VIEW_MODES.HIDDEN);
                });
            }
        } catch (e) {
            console.error('Failed to load filters:', e);
        }
    }

    getAllCategories() {
        return Object.values(MESSAGE_CATEGORIES);
    }
}
