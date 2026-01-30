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
            Object.assign(c, {
                CONCEPT: '#00ffff', TASK: '#ffff00', QUESTION: '#ff00ff',
                EDGE: '#ffffff', TEXT: '#ffffff'
            });
        }

        return [
            // --- Core Node Style ---
            {
                selector: 'node',
                style: {
                    'label': (ele) => ele.data('label') || ele.data('term') || ele.id(),
                    'color': c.TEXT,
                    'text-valign': 'bottom',
                    'text-halign': 'center',
                    'text-margin-y': 6,
                    'font-family': 'JetBrains Mono, monospace',
                    'font-size': '12px',
                    'font-weight': 'normal',
                    'text-background-color': '#0a0a0c',
                    'text-background-opacity': 0.7,
                    'text-background-padding': 2,
                    'text-background-shape': 'roundrectangle',
                    'width': 'mapData(weight, 0, 100, 20, 80)',
                    'height': 'mapData(weight, 0, 100, 20, 80)',
                    'border-width': 0,
                    'transition-property': 'background-color, border-color, width, height, opacity',
                    'transition-duration': '0.2s'
                }
            },

            // --- Node Types ---
            {
                selector: 'node[type = "concept"]',
                style: {
                    'background-color': c.CONCEPT,
                    'background-opacity': 0.8,
                    'border-width': 1,
                    'border-color': 'rgba(255,255,255,0.3)'
                }
            },
            {
                selector: 'node[type = "task"]',
                style: {
                    'shape': 'round-rectangle',
                    'background-color': c.TASK,
                    'border-width': 0,
                    'text-valign': 'center'
                }
            },
            {
                selector: 'node[type = "question"]',
                style: {
                    'shape': 'diamond',
                    'background-color': c.QUESTION,
                    'border-width': 0
                }
            },

            // --- Priority Visuals ---
            {
                selector: 'node[weight >= 80]',
                style: {
                    'border-width': 2,
                    'border-color': '#fff',
                    'shadow-blur': 15,
                    'shadow-color': (ele) => ele.style('background-color'),
                    'shadow-opacity': 0.5,
                    'z-index': 10
                }
            },

            // --- Edges ---
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': c.EDGE,
                    'target-arrow-color': c.EDGE,
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'arrow-scale': 0.8,
                    'opacity': 0.4
                }
            },
            { selector: 'edge[type = "inheritance"]', style: {'line-color': c.INHERITANCE, 'target-arrow-color': c.INHERITANCE} },
            { selector: 'edge[type = "similarity"]', style: {'line-color': c.SIMILARITY, 'target-arrow-color': c.SIMILARITY, 'line-style': 'dashed'} },
            { selector: 'edge[type = "implication"]', style: {'line-color': c.IMPLICATION, 'target-arrow-color': c.IMPLICATION} },

            // --- Interactions ---
            {
                selector: ':selected',
                style: {
                    'border-width': 3,
                    'border-color': '#ffffff',
                    'shadow-blur': 20,
                    'shadow-color': '#ffffff',
                    'overlay-opacity': 0
                }
            },
            {
                selector: '.keyboard-selected',
                style: {
                    'border-width': 3,
                    'border-color': c.HIGHLIGHT,
                    'shadow-blur': 20,
                    'shadow-color': c.HIGHLIGHT
                }
            },
            {
                selector: '.hovered',
                style: {
                    'border-width': 2,
                    'border-color': '#fff',
                    'z-index': 100
                }
            },
            {
                selector: '.neighbor',
                style: {
                    'text-background-opacity': 1,
                    'text-background-color': '#000',
                    'color': '#fff',
                    'z-index': 99
                }
            },
            {
                selector: '.neighbor-edge',
                style: {
                    'line-color': '#fff',
                    'target-arrow-color': '#fff',
                    'width': 3,
                    'opacity': 0.8,
                    'z-index': 99
                }
            },
            {
                selector: '.trace-highlight',
                style: {
                    'border-width': 4,
                    'border-color': c.HIGHLIGHT,
                    'line-color': c.HIGHLIGHT,
                    'target-arrow-color': c.HIGHLIGHT,
                    'z-index': 9999,
                    'opacity': 1,
                    'width': 4,
                    'shadow-blur': 10,
                    'shadow-color': c.HIGHLIGHT
                }
            },
            { selector: '.trace-dim', style: {'opacity': 0.05, 'z-index': 0, 'label': ''} }
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

GraphConfig.load();
