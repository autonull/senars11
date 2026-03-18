# SeNARS (Semantic Non-axiomatic Reasoning System)

**SeNARS** is the kernel for a new generation of cognitive architectures. It fuses the **fluid creativity** of Large Language Models (LLMs) with the **rigorous logic** of Non-Axiomatic Reasoning Systems (NARS).


## Features

The following features are implemented and available for use:

- **Stream Reasoning Pipeline**: Continuous, non-blocking pipeline architecture (`PremiseSource` → `Strategy` → `RuleProcessor`) for processing streams of premises into conclusions
- **Hybrid Logic Processing**: Integration of NAL (Non-Axiomatic Logic) with Language Model capabilities, with synchronous NAL and asynchronous LM processing
- **Resource Management**: CPU throttling, backpressure handling, and derivation depth limits to manage computational resources (see [README.resources.md](README.resources.md))
- **Dynamic Sampling**: Configurable sampling objectives (priority, recency, punctuation, novelty) for task selection
- **Extensible Architecture**: Pluggable components supporting different reasoning strategies (Bag, Prolog, Exhaustive, Resolution, Goal-Driven, Analogical)
- **Robust Data Foundation**: Immutable data structures (Terms, Tasks, Truth, Stamps) with canonical representation and functional processing
- **Event-Based Communication**: Components communicate through a centralized EventBus for loose coupling with built-in metrics
- **Tensor Logic**: Neural-symbolic integration with differentiable tensors (see [README.tensor.md](README.tensor.md))
- **MCP Server**: Model Context Protocol integration for AI assistant connectivity
- **Web UI**: Real-time visualization of reasoning via WebSocket monitoring

## Documentation

### Getting Started
*   **[Quick Reference](README.quickref.md)**: Commands, subsystems, and common patterns.
*   **[Usage Guide](README.usage.md)**: Quick start, basic usage, and TUI.
*   **[Introduction](README.intro.md)**: System definition, abstract, and summary.

### System Design
*   **[Vision & Philosophy](README.vision.md)**: The "Why" behind SeNARS, RLFP, and long-term goals.
*   **[Architecture](README.architecture.md)**: High-level patterns, async/sync hybridization, and diagrams.
*   **[Core Components](README.core.md)**: Memory, Focus, Rules, Data Structures, and Algorithms.
*   **[MeTTa](metta/README.md)**: Meta Type Talk (OpenCog, Hyperon, MORK) language, runtime, integrations
*   **[Tensor Logic](README.tensor.md)**: Neural-symbolic AI foundation with differentiable tensors.
*   **[Resources](README.resources.md)**: Resource awareness, AIKR principle, and throttling.

### Reference
*   **[Configuration](README.config.md)**: System customization, examples, and plugin architecture.
*   **[API](README.api.md)**: API reference for `NAR` and Stream Reasoner.
*   **[Development](README.development.md)**: Development guide, testing strategies, and directory structure.
*   **[Roadmap](README.roadmap.md)**: Current features, challenges, and future plans.

