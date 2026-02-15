export const GraphConfig = {
    DEFAULT_NODE_WEIGHT: 50,
    TASK_NODE_WEIGHT: 30,
    QUESTION_NODE_WEIGHT: 40,

    COLORS: {
        CONCEPT: '#00bcd4',   // Cyan
        TASK: '#ffcc00',      // Amber
        QUESTION: '#aa00ff',  // Purple
        EDGE: '#555555',      // Grey
        HIGHLIGHT: '#00ff9d', // Neon Green
        DIM: '#222222',       // Dark Grey
        INHERITANCE: '#00bcd4',
        SIMILARITY: '#2196f3',
        IMPLICATION: '#ff4444', // Red
        TEXT: '#e0e0e0'
    },

    OVERRIDES: {},

    load() {
        try {
            const saved = localStorage.getItem('senars-graph-config');
            if (saved) {
                const config = JSON.parse(saved);
                if (config.COLORS) Object.assign(this.COLORS, config.COLORS);
                if (config.OVERRIDES) Object.assign(this.OVERRIDES, config.OVERRIDES);
            }
        } catch (e) {
            console.error('Failed to load graph config', e);
        }
    },

    save() {
        try {
            const config = {
                COLORS: this.COLORS,
                OVERRIDES: this.OVERRIDES
            };
            localStorage.setItem('senars-graph-config', JSON.stringify(config));
        } catch (e) {
            console.error('Failed to save graph config', e);
        }
    },

    getGraphStyle() {
        const c = this.COLORS;
        const isHighContrast = document.body.classList.contains('high-contrast');

        if (isHighContrast) {
            // High contrast overrides (temporary, not persisted to base colors)
            const contrastColors = { ...c,
                CONCEPT: '#00ffff', TASK: '#ffff00', QUESTION: '#ff00ff',
                EDGE: '#ffffff', TEXT: '#ffffff'
            };
             // Helper to use correct color map
             const getC = (k) => contrastColors[k] || c[k];

             // ... construct style using getC ...
             // For simplicity, we just mutate c clone
             Object.assign(c, contrastColors);
        }

        return [
            {
                selector: 'node',
                style: {
                    'background-color': c.CONCEPT,
                    'label': (ele) => ele.data('label') || ele.data('term') || ele.id(),
                    'color': c.TEXT,
                    'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 5,
                    'font-family': 'JetBrains Mono, monospace',
                    'font-size': '12px', 'text-transform': 'uppercase', 'font-weight': 'normal',
                    'text-background-color': '#0a0a0c', 'text-background-opacity': 0.8, 'text-background-padding': 3,
                    'width': 'mapData(weight, 0, 100, 20, 80)',
                    'height': 'mapData(weight, 0, 100, 20, 80)',
                    'border-width': 'mapData(weight, 50, 100, 1, 3)', 'border-color': c.CONCEPT,
                    'ghost': 'yes', 'ghost-offset-x': 0, 'ghost-offset-y': 0, 'ghost-opacity': 0.5,
                    'transition-property': 'background-color, border-color, width, height, opacity',
                    'transition-duration': '0.3s'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 1, 'line-color': c.EDGE, 'target-arrow-color': c.EDGE,
                    'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'arrow-scale': 0.8, 'opacity': 0.6
                }
            },
            {
                selector: 'node[type = "concept"]',
                style: {
                    'background-color': `mapData(taskCount, 0, 20, ${c.CONCEPT}, #ff00ff)`,
                    'border-color': c.CONCEPT
                }
            },
            // High priority concepts get a distinct look (simulating "prominence" in bag)
            {
                selector: 'node[weight >= 80]',
                style: {
                    'border-color': '#ffffff',
                    'shadow-blur': 10,
                    'shadow-color': c.CONCEPT,
                    'z-index': 10
                }
            },
            {selector: 'node[type = "task"]', style: {'background-color': c.TASK, 'border-color': c.TASK, 'shape': 'rectangle'}},
            {selector: 'node[type = "question"]', style: {'background-color': c.QUESTION, 'border-color': c.QUESTION, 'shape': 'diamond'}},

            { selector: 'edge[type = "inheritance"]', style: {'line-color': c.INHERITANCE, 'target-arrow-color': c.INHERITANCE} },
            { selector: 'edge[type = "similarity"]', style: {'line-color': c.SIMILARITY, 'target-arrow-color': c.SIMILARITY, 'line-style': 'dashed'} },
            { selector: 'edge[type = "implication"]', style: {'line-color': c.IMPLICATION, 'target-arrow-color': c.IMPLICATION} },

            { selector: ':selected', style: {'border-width': 2, 'border-color': '#ffffff', 'overlay-opacity': 0} },
            { selector: '.keyboard-selected', style: {'border-width': 2, 'border-color': c.HIGHLIGHT, 'shadow-blur': 10, 'shadow-color': c.HIGHLIGHT} },

            {
                selector: '.trace-highlight',
                style: {
                    'border-width': 3, 'border-color': c.HIGHLIGHT, 'line-color': c.HIGHLIGHT,
                    'target-arrow-color': c.HIGHLIGHT, 'z-index': 9999, 'opacity': 1, 'width': 3
                }
            },
            { selector: '.trace-dim', style: {'opacity': 0.1, 'z-index': 0, 'label': ''} }
        ];
    },

    getGraphLayout: (layoutName = 'fcose') => {
        const common = { animate: true, padding: 30 };
        const layouts = {
            fcose: {
                name: 'fcose', ...common, animationDuration: 500, refresh: 20, fit: true,
                randomize: false, componentSpacing: 100, nodeRepulsion: 450000,
                idealEdgeLength: 100, edgeElasticity: 0.45, nestingFactor: 0.1,
                gravity: 0.25, numIter: 2500, tile: true, tilingPaddingVertical: 10,
                tilingPaddingHorizontal: 10, ...GraphConfig.OVERRIDES
            },
            grid: { name: 'grid', ...common },
            circle: { name: 'circle', ...common },
            concentric: { name: 'concentric', ...common }
        };
        return layouts[layoutName] ?? layouts.fcose;
    }
};

// Initialize by loading settings
GraphConfig.load();
