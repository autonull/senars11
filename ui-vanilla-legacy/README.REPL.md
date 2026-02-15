# REPL-Only Interface

The `index.repl.html` file provides a REPL-only interface for debugging NARS commands and state. This page shares the same core components as the main UI but focuses only on the REPL functionality.

## Features

### Core REPL functionality:
- Input field for NARS commands
- Output log for responses
- Command history (using up/down arrows)

### Debug Controls:
- **State Inspection**: Check current connection status, node counts, live updates status
- **Debug Commands**: Direct access to `/state`, `/nodes`, `/tasks`, `/concepts`, `/cy-info`
- **Visualization Testing**: Add dummy nodes/edges with `/debug-visualize`
- **System Operations**: Refresh graph with `/refresh`

### Testing Tools:
- **Quick Test Inputs**: Dropdown with common NARS commands to test
- **Toggle Live Updates**: Pause/resume real-time updates
- **Clear Output**: Reset the output log
- **Connection Status**: Shows live connection and graph statistics

## Usage

1. Access the page at `http://localhost:8000/index.repl.html`
2. Use the REPL input to send NARS commands
3. Use the debug controls to inspect internal state
4. Use test inputs to quickly verify functionality

## Available Debug Commands

These commands are available both via the buttons and directly in the REPL:

- `/state` - Show overall connection and state information
- `/nodes` - List all nodes in graph state
- `/tasks` - Show only task nodes
- `/concepts` - Show only concept nodes
- `/cy-info` - Direct inspection of Cytoscape instance
- `/debug-visualize` - Add dummy nodes/edges for testing
- `/refresh` - Request graph refresh
- `/help` - Show available debug commands

## Purpose

This interface allows for focused debugging of the NARS command flow:
1. Input a command to the NAR
2. See how it becomes part of NAR memory
3. Track how it appears in client state
4. Verify visualization updates

The REPL-only interface eliminates graph visualization complexity to isolate command processing and state management issues.