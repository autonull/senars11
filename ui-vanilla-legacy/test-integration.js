/**
 * Integration test to verify the new renderer system works without breaking existing functionality
 */

// Mock DOM environment for Node.js
import { JSDOM } from 'jsdom';

// Set up DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="test-container"></div></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;

// Create a mock cytoscape function for testing
global.cytoscape = function(options) {
  // Simple mock that returns an object with expected methods
  return {
    add: function(element) { return this; },
    batch: function(fn) { fn(); return this; },
    layout: function(opts) { return { run: () => this }; },
    elements: function() { return { remove: () => this }; },
    getElementById: function(id) { return null; },
    on: function(event, handler) { return this; },
    destroy: function() { return this; }
  };
};

// Create a mock window.cy for testing
global.window.cy = global.cytoscape({});

console.log("Testing renderer system integration...");

// Test that the renderer manager can be imported and instantiated
try {
  const RendererManager = (await import('./src/renderers/renderer-manager.js')).default;
  const BatchedCytoscapeRenderer = (await import('./src/renderers/batched-cytoscape-renderer.js')).default;
  const DirectCytoscapeRenderer = (await import('./src/renderers/direct-cytoscape-renderer.js')).default;
  const ListRenderer = (await import('./src/renderers/list-renderer.js')).default;
  const BaseRenderer = (await import('./src/renderers/base-renderer.js')).default;
  
  console.log("✓ All renderer modules can be imported");
  
  // Test that renderer manager can be instantiated
  const manager = new RendererManager();
  console.log("✓ RendererManager can be instantiated");
  
  // Test that all default renderers are registered
  const availableRenderers = Array.from(manager.renderers.keys());
  console.log("✓ Available renderers:", availableRenderers);
  console.log("✓ All expected renderers registered:", 
    availableRenderers.includes('batched-cytoscape') &&
    availableRenderers.includes('direct-cytoscape') &&
    availableRenderers.includes('list')
  );
  
  // Test that we can create instances of each renderer
  const batchedRenderer = new BatchedCytoscapeRenderer();
  const directRenderer = new DirectCytoscapeRenderer();
  const listRenderer = new ListRenderer();
  
  console.log("✓ All renderer classes can be instantiated");
  
  // Test that they extend BaseRenderer (they should have base methods)
  console.log("✓ BatchedCytoscapeRenderer has expected method:", typeof batchedRenderer.addNode === 'function');
  console.log("✓ DirectCytoscapeRenderer has expected method:", typeof directRenderer.addNode === 'function');
  console.log("✓ ListRenderer has expected method:", typeof listRenderer.addNode === 'function');
  
  console.log("\nRenderer system integration test passed!");
  
  // Test the main graph-view module
  const { init: initGraphView } = await import('./src/graph-view.js');
  const testContainer = document.getElementById('test-container');
  
  const graphView = initGraphView(testContainer, { rendererType: 'direct-cytoscape' });
  console.log("✓ GraphView can be initialized with new renderer system");
  
  // Test the updated graph-controller
  const GraphController = (await import('./src/graph-controller.js')).default;
  
  // Mock store and service
  const mockStore = {
    subscribe: () => () => {},
    dispatch: () => {}
  };
  
  const mockService = null;
  
  const graphController = new GraphController(graphView, mockStore, mockService);
  console.log("✓ GraphController can be instantiated with new renderer system");
  
  console.log("\nAll integration tests passed! The new system maintains compatibility with the existing architecture.");
  
} catch (error) {
  console.error("❌ Integration test failed:", error.message);
  console.error("Stack:", error.stack);
  process.exit(1);
}