/**
 * @file ExplorerStyles.js
 * @description Graph style definitions for the SeNARS Explorer.
 * Follows "Fighter Jet HUD" / Tactical aesthetic.
 */

export const getTacticalStyle = (mappings, getColorFromHash) => {

    const getSize = (ele) => {
        const mode = mappings.size;
        if (mode === 'fixed') return 40;

        const label = ele.data('label') || '';
        const priority = ele.data('priority') || 0;

        // Base size logic
        let size = 40 + (priority * 40);

        if (mode === 'complexity') {
            size = Math.min(40 + (label.length * 2), 100);
        }

        return size;
    };

    const getColor = (ele, prop = 'background') => {
        const mode = mappings.color;
        const type = ele.data('type');
        const priority = ele.data('priority') || 0;
        const label = ele.data('label') || '';

        if (mode === 'type') {
            let base = [0, 255, 157]; // Default Green (Concept/Belief)
            const t = (type || '').toLowerCase();
            if (t.includes('goal')) base = [255, 204, 0]; // Amber
            else if (t.includes('question') || t.includes('quest')) base = [0, 212, 255]; // Blue
            else if (t === 'task') base = [200, 200, 200]; // Generic

            const alpha = prop === 'background' ? (0.6 + (priority * 0.4)) : 1;
            return `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${alpha})`;
        }

        if (mode === 'priority') {
            // Heatmap style: Low (Blue) -> High (Red)
            const hue = 240 - (priority * 240);
            const lightness = 30 + (priority * 40); // 30% to 70%
            const alpha = prop === 'background' ? (0.6 + (priority * 0.4)) : 1;
            return `hsla(${hue}, 80%, ${lightness}%, ${alpha})`;
        }

        // Default: hash
        const { hue } = getColorFromHash(label);
        // Vary lightness by priority: High priority = brighter/more intense
        const lightness = 30 + (priority * 40); // 30% to 70%
        const alpha = prop === 'background' ? (0.6 + (priority * 0.4)) : 1;
        return `hsla(${hue}, 70%, ${lightness}%, ${alpha})`;
    };

    return [
        {
            selector: 'node',
            style: {
                'label': (ele) => {
                    const type = ele.data('type');
                    const label = ele.data('label');
                    // Minimalistic icons
                    let icon = '';
                    switch (type) {
                        case 'task': icon = '⚡'; break;
                        case 'question': icon = '❓'; break;
                        case 'operation': icon = '⚙️'; break;
                        case 'goal': icon = '🎯'; break;
                        default: icon = '';
                    }
                    return `${icon} ${label}`.trim();
                },
                'text-valign': 'center',
                'text-halign': 'center',
                'color': '#ffffff',
                'text-outline-color': '#000000',
                'text-outline-width': 2,
                'background-color': (ele) => getColor(ele, 'background'),
                'background-opacity': 0.8,
                'border-width': 1,
                'border-color': (ele) => getColor(ele, 'border'),
                'width': getSize,
                'height': getSize,
                'font-family': '"JetBrains Mono", monospace',
                'font-size': 14,
                'font-weight': '500',
                'transition-property': 'border-width, border-color, width, height, opacity, background-color',
                'transition-duration': '0.3s',
                'text-max-width': 120,
                'text-wrap': 'wrap'
            }
        },
        {
            selector: 'node[type="task"]',
            style: {
                'shape': 'cut-rectangle',
                'border-width': 2,
                'border-style': 'dashed'
            }
        },
        {
            selector: 'node[type="concept"]',
            style: {
                'shape': 'round-rectangle',
                'padding': 4
            }
        },
        {
            selector: 'node[type="question"]',
            style: {
                'shape': 'tag',
                'padding': 4
            }
        },
        {
            selector: 'node[type="operation"]',
            style: {
                'shape': 'vee',
                'padding': 4
            }
        },
        {
            selector: 'node[type="goal"]',
            style: {
                'shape': 'star',
                'padding': 4
            }
        },
        {
            selector: '.ghost',
            style: {
                'opacity': 0.3,
                'border-style': 'dashed',
                'label': ''
            }
        },
        {
            selector: '.layer-hidden',
            style: {
                'display': 'none'
            }
        },
        {
            selector: 'edge',
            style: {
                'width': 1,
                'line-color': '#445544',
                'target-arrow-color': '#445544',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
                'opacity': 0.6
            }
        },
        {
            selector: 'edge[label="inheritance"]',
            style: {
                'line-style': 'solid',
                'line-color': '#00ff9d',
                'target-arrow-color': '#00ff9d',
                'width': 1.5
            }
        },
        {
            selector: 'edge[label="similarity"]',
            style: {
                'line-style': 'dashed',
                'line-dash-pattern': [4, 4],
                'line-color': '#00d4ff',
                'target-arrow-shape': 'none',
                'width': 1
            }
        },
        {
            selector: 'edge[label="implication"]',
            style: {
                'line-style': 'solid',
                'line-color': '#00ff9d',
                'target-arrow-color': '#00ff9d',
                'width': 2,
                'arrow-scale': 1.2
            }
        },
        {
            selector: 'edge[label="equivalence"]',
            style: {
                'line-style': 'dashed',
                'line-dash-pattern': [2, 2],
                'line-color': '#ff00ff',
                'target-arrow-shape': 'none',
                'width': 1
            }
        },
        {
            selector: 'edge[type="derivation"]',
            style: {
                'label': 'data(label)',
                'color': '#FFaa00',
                'font-size': 10,
                'text-background-color': '#000',
                'text-background-opacity': 0.8,
                'text-background-padding': 2,
                'line-style': 'dashed',
                'line-dash-pattern': [6, 3],
                'line-color': '#FFaa00',
                'target-arrow-color': '#FFaa00',
                'target-arrow-shape': 'vee',
                'width': 1.5,
                'curve-style': 'unbundled-bezier',
                'control-point-distances': 30,
                'control-point-weights': 0.5
            }
        },
        {
            selector: ':selected',
            style: {
                'border-width': 2,
                'border-color': '#fff',
                'overlay-color': '#00ff9d',
                'overlay-padding': 6,
                'overlay-opacity': 0.2
            }
        },
        {
            selector: '.highlighted',
            style: {
                'border-width': 3,
                'border-color': '#00d4ff',
                'overlay-color': '#00d4ff',
                'overlay-padding': 8,
                'overlay-opacity': 0.4,
                'z-index': 100
            }
        },
        {
            selector: '.hovered',
            style: {
                'border-width': 2,
                'border-color': '#ffffff',
                'z-index': 999
            }
        },
        {
            selector: '.dimmed',
            style: {
                'opacity': 0.05,
                'z-index': 0,
                'label': ''
            }
        },
        {
            selector: '.matched',
            style: {
                'border-width': 3,
                'border-color': '#fff',
                'overlay-color': '#00ff9d',
                'overlay-padding': 8,
                'overlay-opacity': 0.5,
                'z-index': 999
            }
        },
        {
            selector: '.trace-highlight',
            style: {
                'border-width': 3,
                'border-color': '#ff00ff',
                'overlay-color': '#ff00ff',
                'overlay-opacity': 0.2,
                'z-index': 1000
            }
        },
        {
            selector: '.reasoning-active',
            style: {
                'border-width': 5,
                'border-color': '#FFaa00',
                'transition-duration': '0.1s'
            }
        },
        {
            selector: '.attention-active',
            style: {
                'border-width': 4,
                'border-color': '#00d4ff',
                'transition-duration': '0.1s'
            }
        }
    ];
};
