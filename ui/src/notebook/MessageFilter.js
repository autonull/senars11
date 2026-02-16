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

const CATEGORY_MATCHERS = [
    { id: 'concept', match: t => t.includes('concept') },
    { id: 'task', match: t => t.includes('task') },
    { id: 'reasoning', match: t => ['reasoning', 'inference', 'derivation'].some(k => t.includes(k)) },
    { id: 'lm-call', match: t => ['lm', 'llm', 'language-model'].some(k => t.includes(k)) },
    { id: 'system', match: t => t === 'system' || ['control', 'agent'].some(k => t.includes(k)) },
    { id: 'debug', match: t => t === 'debug' },
    { id: 'user-input', match: t => t === 'user-input' || t === 'user' },
    { id: 'result', match: t => t === 'result' || ['answer', 'query', 'result'].some(k => t.includes(k)) },
    { id: 'metric', match: t => t === 'metric' || ['performance', 'stats'].some(k => t.includes(k)) },
    { id: 'derivation', match: t => ['derive', 'proof'].some(k => t.includes(k)) }
];

/**
 * Categorize a message based on its type
 */
export function categorizeMessage(message) {
    const type = message.type || 'unknown';
    if (MESSAGE_CATEGORIES[type]) return type;

    const matched = CATEGORY_MATCHERS.find(m => m.match(type));
    return matched ? matched.id : 'unknown';
}

import { ReactiveState } from '../core/ReactiveState.js';
import { STORAGE_KEYS } from '../config/constants.js';

/**
 * Filter manager for REPL messages
 */
export class MessageFilter {
    constructor() {
        // Initialize state with default modes
        const initialModes = {};
        Object.values(MESSAGE_CATEGORIES).forEach(cat => {
            initialModes[cat.id] = cat.defaultMode;
        });

        this.state = new ReactiveState({
            modeMap: initialModes,
            searchTerm: ''
        });

        this.loadFilters();

        // Auto-save on change
        this.state.watch('modeMap', () => this.saveFilters());
    }

    cycleCategoryMode(categoryId) {
        const current = this.state.modeMap[categoryId] || VIEW_MODES.FULL;
        const next = current === VIEW_MODES.FULL ? VIEW_MODES.COMPACT :
                     current === VIEW_MODES.COMPACT ? VIEW_MODES.HIDDEN : VIEW_MODES.FULL;

        this.state.modeMap = { ...this.state.modeMap, [categoryId]: next };
        return next;
    }

    setCategoryMode(categoryId, mode) {
        if (!Object.values(VIEW_MODES).includes(mode)) return;
        this.state.modeMap = { ...this.state.modeMap, [categoryId]: mode };
    }

    getCategoryMode(categoryId) {
        return this.state.modeMap[categoryId] || VIEW_MODES.FULL;
    }

    setSearchTerm(term) {
        this.state.searchTerm = term.toLowerCase();
    }

    get searchTerm() {
        return this.state.searchTerm;
    }

    getMessageViewMode(message) {
        const category = categorizeMessage(message);
        const mode = this.getCategoryMode(category);

        if (this.state.searchTerm) {
            const content = message.content || message.payload?.result || JSON.stringify(message.payload) || '';
            const matches = content.toLowerCase().includes(this.state.searchTerm);

            if (!matches) return VIEW_MODES.HIDDEN;
            if (mode === VIEW_MODES.HIDDEN) return VIEW_MODES.COMPACT;
        }

        return mode;
    }

    saveFilters() {
        try {
            localStorage.setItem(STORAGE_KEYS.MESSAGE_FILTERS, JSON.stringify(this.state.modeMap));
        } catch (e) {
            console.warn('Failed to save filters', e);
        }
    }

    loadFilters() {
        try {
            const savedV2 = localStorage.getItem(STORAGE_KEYS.MESSAGE_FILTERS);
            if (savedV2) {
                const filters = JSON.parse(savedV2);
                this.state.modeMap = { ...this.state.modeMap, ...filters };
                return;
            }
        } catch (e) {
            console.error('Failed to load filters:', e);
        }
    }

    getAllCategories() {
        return Object.values(MESSAGE_CATEGORIES);
    }
}
