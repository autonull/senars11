# SeNARS UI2

A clean, minimal web interface for SeNARS (Sensorimotor NARS).

## Features

- **Minimalist Design**: Focused on functionality with a dark, modern aesthetic.
- **Real-time Logs**: Color-coded log messages for different event types.
- **Interactive Graph**: Visualization of concepts and their relationships using Cytoscape.js.
- **Command Input**: Narsese command input with history and quick commands.
- **WebSocket Communication**: Real-time updates from the SeNARS backend.

## Demo Runner

The Demo Runner (`demo.html`) provides a specialized interface for demonstrating SeNARS capabilities:
- **Demo Library**: Integrated browser for loading and running pre-configured demos.
- **Visualizations**: Split-screen view with Knowledge Graph and System Metrics for real-time feedback.
- **Notebook**: Interactive REPL for manual experimentation alongside demos.

## Structure

- `index.html`: Main entry point.
- `style.css`: Stylesheet for the UI.
- `app.js`: Client-side logic (WebSocket, Graph, UI events).
- `server.js`: Simple Node.js server to serve the UI and mock the backend.

## Running

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   node server.js
   ```

3. Open your browser at `http://localhost:8080`.
