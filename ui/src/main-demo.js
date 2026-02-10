import './shims/process-shim.js';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { GoldenLayout } from 'golden-layout';
import { SeNARSUI } from './SeNARSUI.js';
import { WebSocketManager } from './connection/WebSocketManager.js';
import { ConnectionManager } from './connection/ConnectionManager.js';
import { LayoutFactory } from './ui/LayoutFactory.js';

console.log('--- main-demo.js loading ---');

cytoscape.use(fcose);
window.cytoscape = cytoscape;

// Simplified Demo Layout
const LAYOUT_CONFIG = {
    settings: {
        hasHeaders: true,
        constrainDragToContainer: true,
        reorderEnabled: false,
        selectionEnabled: false,
        popoutWholeStack: false,
        blockedPopoutsThrowError: true,
        closePopoutsOnUnload: true,
        showPopoutIcon: false,
        showMaximiseIcon: true,
        showCloseIcon: false
    },
    dimensions: {
        borderWidth: 2,
        headerHeight: 24
    },
    root: {
        type: 'row',
        content: [{
            type: 'component',
            componentName: 'graphComponent',
            title: 'KNOWLEDGE GRAPH',
            width: 70,
            componentState: { label: 'Graph' }
        }, {
            type: 'column',
            width: 30,
            content: [
                {
                    type: 'component',
                    componentName: 'replComponent',
                    title: 'REPL',
                    height: 50,
                    isClosable: false
                },
                {
                    type: 'component',
                    componentName: 'examplesComponent',
                    title: 'DEMOS',
                    height: 50
                }
            ]
        }]
    }
};

async function start() {
    const layout = new GoldenLayout(document.getElementById('layout-root'));
    const connection = new ConnectionManager(new WebSocketManager());
    const app = new SeNARSUI(connection);

    // Use Factory to register all components
    LayoutFactory.registerComponents(app, layout);

    layout.loadLayout(LAYOUT_CONFIG);

    setTimeout(() => {
        app.initialize();
        console.log('SeNARS Demo Runner Started');
    }, 100);

    window.addEventListener('resize', () => layout.updateRootSize());
}

window.addEventListener('DOMContentLoaded', start);
