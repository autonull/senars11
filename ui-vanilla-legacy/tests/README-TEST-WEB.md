/**
 * @file README-TEST-WEB.md
 * @description Documentation for the SeNARS Web UI Test Framework
 */

/*
# SeNARS Web UI Test Framework

## Overview

The SeNARS Web UI Test Framework provides comprehensive end-to-end testing capabilities for the SeNARS web interface. It extends the existing `TestNARRemote` pattern and adds web UI testing capabilities using Puppeteer browser automation.

## Key Components

### TestNARWeb Class
The main test class that provides:
- Server process management for the NARS system
- Puppeteer browser automation for UI interactions
- WebSocket monitoring for event validation
- UI content expectation matching
- Full setup/teardown lifecycle management

### RemoteTaskMatch Integration
- Compatible with the existing RemoteTaskMatch system
- Supports complex task matching for remote (WebSocket) tasks
- Maintains consistency with other test frameworks

## Features

### Input/Output Operations
- `input(termStr, freq, conf)`: Add NARS input statements
- `run(cycles)`: Execute NARS reasoning cycles
- `expect(term)`: Expect a task to exist in the system
- `expectNot(term)`: Expect a task not to exist in the system

### Web UI Specific Operations
- `expectUIContains(text)`: Expect UI to contain specific text
- `expectUINotContains(text)`: Expect UI to not contain specific text

### Architecture
```
TestNARWeb 
├── Server Management (WebSocket NAR connection)
├── Browser Automation (Puppeteer)
├── WebSocket Monitoring
├── UI Interaction (Element manipulation)
└── Expectation Validation
```

## Implementation Details

### Server Setup
- Dynamically creates temporary server scripts
- Uses custom ports to avoid conflicts
- Properly initializes NAR and WebSocketMonitor

### Browser Automation
- Uses Puppeteer with sandbox-compatible flags
- Injects WebSocket monitoring code into pages
- Simulates user interactions with the UI

### WebSocket Monitoring
- Establishes WebSocket connections to NAR server
- Monitors all task events and system messages
- Provides real-time event validation

### UI Testing
- Interacts with actual UI elements (REPL input, etc.)
- Validates content changes in the web interface
- Supports both functional and content-based expectations

## Usage Example

```javascript
import {TestNARWeb} from './src/testing/TestNARWeb.js';

const test = new TestNARWeb();

await test
    .input('<dog --> animal>', 1.0, 0.9)  // Input a statement
    .run(10)                               // Run 10 cycles
    .expect('<dog --> animal>')            // Expect it in memory
    .expectUIContains('dog')               // Expect UI shows it
    .execute();                            // Execute the test
```

## Testing Pattern Consistency

This implementation follows the same pattern as:
- `TestNAR`: Direct NAR interface testing
- `TestNARRemote`: WebSocket-based testing  
- `TestNARWeb`: Web UI + WebSocket testing

All test frameworks support:
- Chained method calls for operation specification
- Configurable input parameters (frequency, confidence)
- Flexible expectation validation
- Proper resource cleanup
- Error handling and reporting

## Integration Points

The framework integrates with:
- Existing NAR WebSocket infrastructure
- Current TaskMatch/RemoteTaskMatch system
- UI components and event systems
- Build and test infrastructure

## Benefits

1. **End-to-End Testing**: Tests complete user journey from UI to NAR
2. **Automated Validation**: No manual testing required
3. **Consistent Interface**: Same API as other test frameworks
4. **Comprehensive Coverage**: Both functional and UI validation
5. **Sandbox Compatible**: Works in containerized CI environments
6. **Resource Management**: Proper setup/teardown of server and browser
*/