import './shims/process-shim.js';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { GoldenLayout } from 'golden-layout';
import { SeNARSUI } from './SeNARSUI.js';
import { WebSocketManager } from './connection/WebSocketManager.js';
import { ConnectionManager } from './connection/ConnectionManager.js';
import { LayoutFactory } from './ui/LayoutFactory.js';
import { CommandRegistry } from '@senars/core';

console.log('--- main-repl.js loading ---');

cytoscape.use(fcose);
window.cytoscape = cytoscape;

// REPL Focused Layout (Console only, hidden graph)
const LAYOUT_CONFIG = {
    settings: {
        hasHeaders: true,
        constrainDragToContainer: true,
        reorderEnabled: true,
        selectionEnabled: false,
        popoutWholeStack: false,
        blockedPopoutsThrowError: true,
        closePopoutsOnUnload: true,
        showPopoutIcon: true,
        showMaximiseIcon: true,
        showCloseIcon: false
    },
    dimensions: {
        borderWidth: 2,
        headerHeight: 24
    },
    root: {
        type: 'row',
        content: [
            {
                type: 'stack',
                width: 100,
                content: [
                    {
                        type: 'component',
                        componentName: 'replComponent',
                        title: 'REPL',
                        isClosable: false
                    },
                    {
                        type: 'component',
                        componentName: 'graphComponent',
                        title: 'GRAPH (Hidden)',
                        componentState: { label: 'Graph' }
                    }
                ]
            }
        ]
    }
};

async function start() {
    const layout = new GoldenLayout(document.getElementById('layout-root'));
    const connection = new ConnectionManager(new WebSocketManager());
    const app = new SeNARSUI(connection);

    // Register components
    LayoutFactory.registerComponents(app, layout);

    layout.loadLayout(LAYOUT_CONFIG);

    setTimeout(() => {
        app.initialize();

        // Add a command to inspect via embedded graph
        const cmdProc = app.commandProcessor;
        if (cmdProc) {
            cmdProc.commandRegistry.registerCommand('/show', (ctx) => {
                // Mock functionality: In a real scenario, we'd fetch data then emit.
                // Here we just demo the capability.
                const term = ctx.args?.[0] || 'Unknown';

                // Emulate fetching data (usually this comes from backend response)
                const mockData = {
                    title: term,
                    nodes: [
                        { id: term, type: 'concept' },
                        { id: 'related', type: 'concept' }
                    ],
                    edges: [
                        { source: term, target: 'related', type: 'related_to' }
                    ]
                };

                document.dispatchEvent(new CustomEvent('senars:console:embed-graph', {
                    detail: mockData
                }));

                app.logger.log(`Showing embedded graph for ${term}`, 'info', '📊');
                return true;
            }, { description: 'Show embedded graph for a term' });
        }

        console.log('SeNARS REPL Mode Started');
    }, 100);

    window.addEventListener('resize', () => layout.updateRootSize());
}

window.addEventListener('DOMContentLoaded', start);
