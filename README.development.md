# SeNARS Development Guide

## Getting Started with Development

### Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd senars11

# Install dependencies
pnpm install

# Run tests to verify setup
pnpm test

# Start development
pnpm run watch  # Auto-rebuild on changes
```

### Contributing Guidelines

- **Code Style**: Follow existing patterns in the codebase
- **Testing**: Add tests for all new features and bug fixes
- **Documentation**: Update README files for significant changes
- **Commits**: Use clear, descriptive commit messages
- **Pull Requests**: Include tests and documentation updates

### Development Workflow

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make changes and add tests
3. Run tests: `pnpm test`
4. Commit changes: `git commit -m "Add feature X"`
5. Push and create pull request

## API Conventions and Code Quality

### API Design Conventions

- **Component Architecture:** Use BaseComponent as the foundation for all system components with standardized methods
- **Clear Naming:** Use descriptive names for classes, methods, and variables
- **Immutability:** Keep core data structures (Terms, Tasks, Truth, Stamps) unchanged after creation
- **Async Operations:** Use `async/await` for operations involving I/O or heavy computation
- **Configuration Objects:** Pass settings as single objects rather than multiple parameters
- **Event-Driven:** Use events for system outputs and communication
- **Standardized Metrics:** Include built-in metrics collection in all components

### BaseComponent & Lifecycle

All system components inheriting from `BaseComponent` follow this lifecycle:

1.  `constructor(config)`: Initialize with immutable configuration.
2.  `initialize()`: Perform async setup (DB connections, model loading).
3.  `start()`: Begin active processing (start loops, listeners).
4.  `stop()`: Gracefully halt processing.
5.  `dispose()`: Cleanup resources (close sockets, file handles).

**Key Features:**
- **Metrics**: Automatic tracking of component performance.
- **Events**: Standardized `emit(event, data)` system.
- **Logging**: Scoped logging accessible via `this.log`.
- **Error Handling**: Standardized error management with recovery.
- **Status Tracking**: Component health and operational state.

**Lifecycle Example:**

```javascript
class MyComponent extends BaseComponent {
    constructor(config) {
        super(config);
        // Initialize immutable configuration
    }

    async initialize() {
        await super.initialize();
        // Setup database connections, load models
    }

    async start() {
        await super.start();
        // Begin event listeners, start processing loops
    }

    async stop() {
        // Gracefully halt - finish current work
        await super.stop();
    }

    async dispose() {
        // Release all resources
        await super.dispose();
    }
}
```

### Utilities (`util/`)

Helper functions for common operations:

- **Collections:** Specialized data structures like priority queues, bags
- **Constants:** Shared system-wide values and configuration defaults
- **Validation:** Input validation functions for terms, tasks, truth values
- **Logging:** System-wide structured logging utility
- **EventBus:** Central event communication system



### Code Quality and Maintainability

- **Type Safety:** Use JSDoc annotations for type checking
- **Clear Organization:** Separate concerns between modules with consistent conventions
- **Consistent Error Handling:** Standardized error handling across all components
- **Documentation:** JSDoc comments for all public interfaces

## Error Handling and Robustness

### Input Validation

- **Narsese Parsing:** Check syntax before processing
- **Truth Values:** Ensure values are between 0 and 1
- **Task Validation:** Verify structure before processing

### Error Handling Strategies

- **Graceful Degradation:** System continues working when parts fail
- **Circuit Breakers:** Prevent cascading failures with automatic recovery
- **Clear Logging:** Detailed logs for debugging
- **Automatic Recovery:** System recovers from common failures
- **User-Friendly Errors:** Helpful error messages for users

### Security Implementation

- **Input Validation:** Check all inputs to prevent attacks
- **Resource Limits:** Prevent system overload with timeouts and limits
- **Secure Configuration:** Safe defaults and environment protection
- **Security Logging:** Track security-related events
- **Rate Limiting:** Prevent abuse by limiting requests per client

## Testing Strategy

### Unit Tests

- **Individual Components:** Test each class and function separately
- **Core Classes:** Extensive tests for Term, Task, Memory, and RuleEngine functionality
- **Validation:** Test configuration, error handling, and lifecycle methods

### Integration Tests

- **Component Interaction:** Test how multiple components work together
- **System Behavior:** Verify overall system behavior under real-world scenarios
- **Performance:** Test system performance under various loads

### Property-Based Tests

- **System Invariants:** Verify that core properties remain consistent across transformations
- **Term Properties:** Test immutability and equality invariants
- **Truth Calculations:** Verify truth value operations
- **Command:** `pnpm run test:property`

### End-to-End (E2E) Tests

- **UI Testing:** Validates the Web UI using Playwright
- **Screenshots:** Automated visual regression testing
- **Command:** `pnpm run test:e2e`

### Testing API

The system provides a fluent API for easy test creation.

## Performance and Scalability

- **Fast Operations**: <1ms for Term processing, <2ms for Task processing, <5ms for Memory operations
- **High Throughput**: 10,000+ operations per second
- **Memory Efficient**: Smart caching reduces memory growth as knowledge base expands
- **Scalable**: Can distribute across multiple nodes
- **Resource Management**: Configurable limits prevent resource exhaustion (default: 512MB memory, 100ms per cycle)
