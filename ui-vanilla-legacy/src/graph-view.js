import RendererManager from './renderers/renderer-manager.js';
import BatchedCytoscapeRenderer from './renderers/batched-cytoscape-renderer.js';
import DirectCytoscapeRenderer from './renderers/direct-cytoscape-renderer.js';
import ListRenderer from './renderers/list-renderer.js';

/**
 * GraphView - Initializes and manages the graph visualization with flexible rendering
 */
export function init(container, options = {}) {
    // Create renderer manager
    const rendererManager = new RendererManager();
    rendererManager.init(container);

    // Initialize with default renderer (configurable via options)
    const rendererType = options.rendererType || 'batched-cytoscape';
    const renderer = rendererManager.switchRenderer(rendererType);

    return {
        rendererManager,
        renderer,
        // Expose methods that existing code might expect
        cy: rendererType.includes('cytoscape') ? window.cy : null
    };
}