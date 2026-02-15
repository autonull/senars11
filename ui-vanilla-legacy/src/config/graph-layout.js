import configManager from './config-manager.js';

/**
 * GraphLayout - Centralized graph visualization configuration
 */
class GraphLayout {
    static getLayoutOptions() {
        return configManager.getGraphLayout();
    }

    static getNodeStyleOptions() {
        return {
            style: [
                {
                    selector: 'node',
                    style: {
                        label: 'data(label)',
                        width: 20,
                        height: 20,
                        'background-color': '#3399FF'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        width: 1,
                        'line-color': '#ccc',
                        'target-arrow-shape': 'triangle',
                        'target-arrow-color': '#ccc',
                        'curve-style': 'bezier'
                    }
                },
                ...this._getNodeTypeStyles()
            ]
        };
    }

    static _getNodeTypeStyles() {
        const styles = [];
        const nodeColors = configManager.getNodeColors();
        const nodeShapes = configManager.getNodeShapes();

        for (const [type, color] of Object.entries(nodeColors)) {
            styles.push({
                selector: `node[type="${type}"]`,
                style: {
                    'background-color': color,
                    shape: nodeShapes[type] || 'ellipse'
                }
            });
        }
        return styles;
    }

    static getDefaultNodeProperties() {
        return {
            width: 20,
            height: 20
        };
    }

    static getEdgeStyle() {
        return {
            width: 1,
            'line-color': '#ccc',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#ccc',
            'curve-style': 'bezier'
        };
    }
}

export default GraphLayout;