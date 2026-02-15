/**
 * Message categories for REPL filtering
 */
export const MESSAGE_CATEGORIES = {
    reasoning: {
        id: 'reasoning',
        label: 'Reasoning',
        icon: '🧠',
        color: '#00d4ff',
        defaultVisible: true
    },
    'lm-call': {
        id: 'lm-call',
        label: 'LM Call',
        icon: '🤖',
        color: '#bb86fc',
        defaultVisible: true
    },
    system: {
        id: 'system',
        label: 'System',
        icon: '⚙️',
        color: '#888',
        defaultVisible: true
    },
    debug: {
        id: 'debug',
        label: 'Debug',
        icon: '🐛',
        color: '#666',
        defaultVisible: false
    },
    'user-input': {
        id: 'user-input',
        label: 'User Input',
        icon: '💬',
        color: '#00ff88',
        defaultVisible: true
    },
    result: {
        id: 'result',
        label: 'Result',
        icon: '✨',
        color: '#ffbb00',
        defaultVisible: true
    },
    metric: {
        id: 'metric',
        label: 'Metrics',
        icon: '📊',
        color: '#999',
        defaultVisible: true
    },
    derivation: {
        id: 'derivation',
        label: 'Derivation',
        icon: '🔗',
        color: '#ff6b9d',
        defaultVisible: true
    },
    unknown: {
        id: 'unknown',
        label: 'Other',
        icon: '❓',
        color: '#666',
        defaultVisible: true
    }
};

/**
 * Categorize a message based on its type
 */
export function categorizeMessage(message) {
    const type = message.type || 'unknown';

    // Map message types to categories
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
        this.visibilityMap = new Map();
        this.searchTerm = '';

        // Initialize with defaults
        Object.values(MESSAGE_CATEGORIES).forEach(cat => {
            this.visibilityMap.set(cat.id, cat.defaultVisible);
        });

        // Load saved filters
        this.loadFilters();
    }

    toggleCategory(categoryId) {
        const current = this.visibilityMap.get(categoryId);
        this.visibilityMap.set(categoryId, !current);
        this.saveFilters();
    }

    setCategoryVisible(categoryId, visible) {
        this.visibilityMap.set(categoryId, visible);
        this.saveFilters();
    }

    isCategoryVisible(categoryId) {
        return this.visibilityMap.get(categoryId) !== false;
    }

    setSearchTerm(term) {
        this.searchTerm = term.toLowerCase();
    }

    shouldShowMessage(message) {
        const category = categorizeMessage(message);

        // Check category visibility
        if (!this.isCategoryVisible(category)) {
            return false;
        }

        // Check search term
        if (this.searchTerm) {
            const content = message.content || message.payload?.result || JSON.stringify(message.payload) || '';
            if (!content.toLowerCase().includes(this.searchTerm)) {
                return false;
            }
        }

        return true;
    }

    saveFilters() {
        const filters = Object.fromEntries(this.visibilityMap);
        localStorage.setItem('senars-message-filters', JSON.stringify(filters));
    }

    loadFilters() {
        const saved = localStorage.getItem('senars-message-filters');
        if (saved) {
            try {
                const filters = JSON.parse(saved);
                Object.entries(filters).forEach(([cat, visible]) => {
                    this.visibilityMap.set(cat, visible);
                });
            } catch (e) {
                console.error('Failed to load filters:', e);
            }
        }
    }

    getAllCategories() {
        return Object.values(MESSAGE_CATEGORIES);
    }
}
