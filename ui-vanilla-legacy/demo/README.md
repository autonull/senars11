# Graph Visualization Demos

This directory contains multiple demo files to showcase the graph visualization system:

## Working Demos (Based on Working Mockups)

### 1. Simple Working Demo (`simple-working-demo.html`)
A basic, functional Cytoscape visualization with example data, directly following the working mockup patterns.

### 2. Advanced Working Demo (`advanced-working-demo.html`)
An interactive demo with controls to add/remove nodes and edges dynamically, following the working mockup patterns.

### 3. Simple Graph Demo (`graph.html`)
A basic demo that shows the graph visualization with example data, using direct Cytoscape initialization similar to the working mockups.

### 4. Interactive Graph Demo (`graph-advanced-demo.html`)
A comprehensive demo with controls to interact with the graph, using direct Cytoscape initialization similar to the working mockups.

## Architecture Overview

The application code in `src/` implements a modular renderer system with:

- **BaseRenderer**: Abstract base class defining the renderer interface
- **BatchedCytoscapeRenderer**: For performance in live applications
- **DirectCytoscapeRenderer**: For immediate feedback during development
- **ListRenderer**: Alternative text-based visualization
- **RendererManager**: Handles switching between different renderers

The renderer system allows the same business logic to work with different visualization strategies, making it easy to:
- Test and debug the visualization in isolation
- Compare different rendering approaches
- Add new visualization strategies without changing core logic

## Running the Demos

To run the demos, serve the UI directory with a web server:

```bash
cd ui
python3 -m http.server 8000
# Then open http://localhost:8000/demo/simple-working-demo.html
```

Or use any other static file server of your choice.