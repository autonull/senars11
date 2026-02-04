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

        return mode === 'complexity'
            ? Math.min(30 + (label.length * 2), 80)
            : 30 + (priority * 50); // Default: priority
    };

    const getColor = (ele, prop = 'background') => {
        const mode = mappings.color;
        const type = ele.data('type');
        const priority = ele.data('priority') || 0;
        const label = ele.data('label') || '';

        if (mode === 'type') {
            const base = type === 'task' ? [255, 187, 0] : [0, 255, 157]; // Amber or Green
            const alpha = prop === 'background' ? (0.1 + (priority * 0.4)) : 1;
            return `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${alpha})`;
        }

        if (mode === 'priority') {
            // Heatmap style: Low (Blue) -> High (Red)
            const hue = 240 - (priority * 240);
            const alpha = prop === 'background' ? 0.4 : 1;
            return `hsla(${hue}, 80%, 50%, ${alpha})`;
        }

        // Default: hash
        const { hue } = getColorFromHash(label);
        const alpha = prop === 'background' ? (0.1 + (priority * 0.4)) : 1;
        return `hsla(${hue}, 70%, 50%, ${alpha})`;
    };

    return [
        {
            selector: 'node',
            style: {
                'label': (ele) => {
                    const type = ele.data('type');
                    const label = ele.data('label');
                    const emoji = type === 'concept' ? '🧠' : type === 'task' ? '⚡' : '🔹';
                    return `${emoji} ${label}`;
                },
                'text-valign': 'center',
                'text-halign': 'center',
                'color': (ele) => getColor(ele, 'border'),
                'text-background-color': 'rgba(0,0,0,0.5)',
                'text-background-opacity': 1,
                'text-background-padding': 2,
                'background-color': (ele) => getColor(ele, 'background'),
                'border-width': 1,
                'border-color': (ele) => getColor(ele, 'border'),
                'width': getSize,
                'height': getSize,
                'font-family': 'Consolas, monospace',
                'font-size': 10,
                'transition-property': 'border-width, border-color, width, height, opacity, background-color',
                'transition-duration': '0.3s'
            }
        },
        {
            selector: 'node[type="task"]',
            style: {
                'shape': 'diamond'
            }
        },
        {
            selector: 'node[type="concept"]',
            style: {
                'shape': 'hexagon'
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
                'line-color': '#334433',
                'target-arrow-color': '#334433',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
                'opacity': 0.8
            }
        },
        {
            selector: 'edge[label="inheritance"]',
            style: {
                'line-style': 'dotted',
                'line-color': '#00ff9d',
                'target-arrow-color': '#00ff9d',
                'width': 1
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
                'arrow-scale': 1.5
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
            selector: ':selected',
            style: {
                'border-width': 2,
                'border-color': '#fff',
                'border-style': 'double',
                'overlay-color': '#00ff9d',
                'overlay-padding': 5,
                'overlay-opacity': 0.3
            }
        },
        {
            selector: '.highlighted',
            style: {
                'border-width': 4,
                'border-color': '#00d4ff',
                'overlay-color': '#00d4ff',
                'overlay-padding': 10,
                'overlay-opacity': 0.5
            }
        },
        {
            selector: '.hovered',
            style: {
                'border-width': 2,
                'border-style': 'solid',
                'overlay-color': '#fff',
                'overlay-padding': 5,
                'overlay-opacity': 0.2,
                'z-index': 9999
            }
        },
        {
            selector: '.dimmed',
            style: {
                'opacity': 0.1,
                'z-index': 0,
                'label': ''
            }
        },
        {
            selector: '.matched',
            style: {
                'border-width': 4,
                'border-color': '#fff',
                'overlay-color': '#00ff9d',
                'overlay-padding': 8,
                'overlay-opacity': 0.6,
                'z-index': 9999
            }
        },
        {
            selector: '.focused-target',
            style: {
                'border-width': 6,
                'border-style': 'double',
                'overlay-color': '#ff00ff',
                'overlay-padding': 12,
                'overlay-opacity': 0.4
            }
        },
        {
            selector: '.focused-context',
            style: {
                'opacity': 1,
                'overlay-color': '#00d4ff',
                'overlay-padding': 2,
                'overlay-opacity': 0.2
            }
        },
        {
            selector: '.reasoning-active',
            style: {
                'border-width': 10,
                'border-color': '#FFaa00',
                'transition-duration': '0.1s'
            }
        },
        {
            selector: '.attention-active',
            style: {
                'border-width': 6,
                'border-color': '#00d4ff',
                'transition-duration': '0.1s'
            }
        }
    ];
};
