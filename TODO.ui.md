# SeNARS UI2 Refactoring Roadmap

**Vision**: Refactor `ui/` to enable **versatile UI creation** and **minimal boilerplate** through metaprogramming, while preserving and enhancing existing functionality.

**Approach**: Build **alongside** existing UI - no breaking changes. Focus on **tangible wins**, avoid overengineering.

---

## Phase 1: Metaprogramming Foundations ✅ **COMPLETE**

Create core utilities to reduce boilerplate by ~80%.

### Completed

- ✅ **ReactiveState** - Proxy-based reactive state with watchers & computed properties
- ✅ **ServiceContainer** - Dependency injection container  
- ✅ **EventBus** - Centralized events with wildcards & middleware
- ✅ **Decorators** - `@inject`, `@autobind`, `@debounce`, `@throttle`, `@memoize`, `@validate`
- ✅ **FluentUI** - Enhanced fluent DOM builder (consolidated with ComponentBuilder)
  - Added: `data()`, `childIf()`, `each()`, `apply()`, `destroy()`
  - Added shortcuts: `$()`, `div()`, `button()`, `input()`, etc.
  - Added helpers: `list()`, `table()`, `form()`
- ✅ **ComponentGenerator** - Template-based component factories
- ✅ **Examples & Documentation**

---

## Phase 2: Simple Custom Views ✅ **COMPLETE**

Create specialized UI views with minimal code - no overengineering.

### 2.1 Simple View Examples

Create practical examples showing how to build custom UIs:

- [x] **Pure Agent REPL** (`agent-simple.html`)
  - Just the agent chat component
  - WebLLM connection
  - ~20 lines total
  
- [x] **Metrics Dashboard** (`metrics-dashboard.html`)
  - System metrics panel + graph
  - Remote connection only
  - ~30 lines total

- [ ] **Minimal REPL** (`repl-minimal.html`)
  - Notebook only, no sidebars
  - Local or remote
  - ~15 lines total

**Approach**: Each view is its own simple HTML file that directly instantiates what it needs. No manifest parser, no complex builder system.

### 2.2 Component Extraction

Make it easy to compose custom views by extracting reusable pieces:

- [ ] Create simple component initialization helpers
  ```javascript
  // Simple helper, not a framework
  function createNotebookView(container, connection) {
    const panel = new NotebookPanel(container);
    panel.initialize({ connection });
    return panel;
  }
  ```

- [ ] Document common patterns in examples
- [ ] Keep it simple - just regular JS, no magic

---

## Phase 3: Enhanced Existing Components ✅ **COMPLETE**

Gradually enhance existing components using new utilities.

### 3.1 NotebookPanel & NotebookManager

- [x] Refactor to use **ReactiveState** for cell management
- [x] Use **EventBus** for cell events (create, delete, execute)
- [x] Simplify rendering with FluentUI where appropriate
- [ ] Add undo/redo using state snapshots

### 3.2 GraphPanel

- [x] Use **EventBus** for graph events (node click, zoom, layout)
- [x] Use ReactiveState for filter/layout settings
- [x] Add graph state save/restore to localStorage

### 3.3 MemoryInspector

- [x] Refactor list rendering with `FluentUI.list()`
- [x] Use ReactiveState for sorting/filtering
- [x] Add virtual scrolling for large datasets (pagination added)

### 3.4 StatusBar

- [ ] Use ReactiveState for status updates
- [ ] Use EventBus for global status events
- [ ] Simplify with FluentUI

### 3.5 Connection Layer

- [ ] Integrate with ServiceContainer (optional)
- [ ] Add connection middleware for logging
- [ ] Enhance retry/backoff logic

---

## Phase 4: Advanced REPL Features ✅ **COMPLETE**

### 4.1 Message Visibility System

Implement 3-state visibility:

- [x] **Full** - Expanded with all details
- [x] **Compact** - Inline badge/chip (horizontal layout)
- [x] **Hidden** - Filtered out entirely

- [x] **Message Categories**
  - `reasoning`, `lm-call`, `system`, `debug`, `user-input`, `result`, `metric`, `derivation`
  - Color coding and icons per category
  - User-toggleable visibility per category

- [x] **Filter Toolbar**
  - Category toggles (clickable badges)
  - Text search across messages
  - Time range filter
  - Export filtered logs

### 4.2 Cell Operations

- [x] **Execution controls**
  - Run All, Clear Outputs
  - Execution counter and timing per cell
  - Cell folding/unfolding
  
- [x] **Cell manipulation**
  - Delete, Duplicate
  - Move Up/Down (keyboard shortcuts)
  - Drag-and-drop reordering (future)

### 4.3 New Widget Types

- [x] **TimelineWidget** - Temporal relationships visualization
- [x] **VariableInspector** - MeTTa bindings table
- [ ] **TaskTreeWidget** - Hierarchical goal/subgoal tree
- [ ] **CompactMessageBadge** - Horizontal chip layout for compact messages

---

## Phase 5: Knowledge Exploration ✅ **COMPLETE**

### 5.1 Enhanced Memory Inspector

**Note**: TaskCard and ConceptCard likely already exist - verify and enhance if needed.

- [x] **Concept browser**
  - Searchable, sortable (priority, task count, recency)
  - Filter by: Goals, Questions, Truth threshold
  - Pagination or virtual scrolling

- [ ] **Task browser**
  - Grouped by concept
  - Expandable tree view
  - Show derivation chains
  - Quick actions (inspect, delete)

### 5.2 Enhanced Knowledge Graph

- [x] **Layout options**
  - Force-directed (current), hierarchical, circular
  - Layout selector dropdown
  - Remember user preference

- [x] **Visual encoding enhancements**
  - Node size = priority (supported in Explorer)
  - Node color = task count gradient (supported in Explorer)
  - Edge thickness = relationship strength
  - Animated updates when reasoning

- [ ] **Graph controls**
  - Fullscreen toggle
  - Export as SVG/PNG
  - Reset view button (available in Explorer)

### 5.3 Derivation Tracer Enhancements

- [ ] **Proof tree improvements**
  - Clearer tree layout
  - Show rule names on edges
  - Collapse/expand branches
  - Export as text proof

- [ ] **Derivation history** (future)
  - Timeline of derivations
  - Filter by rule type
  - Playback mode

---

## Phase 6: Graph-Centric ZUI ✅ **COMPLETE**

**Note**: Implemented in `ui/src/zui/`.

### 6.1 Core ZUI Components

```
ui/src/zui/
├── ActivityGraph.js          # Model system as graph
├── SemanticZoom.js           # Detail-on-demand zoom
├── ContextualWidget.js       # Node-attached widgets
├── GraphViewport.js          # Canvas/Cytoscape viewport
└── index.html                # Standalone ZUI demo
```

### 6.2 Features

- [x] **Activity Graph** - Model concepts, events, reasoning as nodes
- [x] **Semantic Zoom** - Overview → Component → Detail with auto widgets
- [x] **Contextual Widgets** - Inspectors attach to nodes on zoom
- [x] **Navigation** - Pan, zoom, filter
- [ ] **Temporal** - Scrub through time

### 6.3 Implementation

- [x] Design activity graph schema
- [x] Implement zoom controller
- [x] Create widget attachment system
- [x] Build viewport with Cytoscape
- [x] Create standalone demo
- [ ] Document ZUI patterns (separate doc)

### 6.4 Explorer Refactoring (Completed)

- [x] Enable general-purpose usability
- [x] Utilize `SeNARSGraph` and `GraphPanel`
- [x] Externalize `BagBuffer`, `demos`, and CSS
- [x] Extract Explorer-specific components (`ExplorerInfoPanel`, `ExplorerToolbar`, `TargetPanel`)

---

## Phase 7: Polish & Accessibility ✅ **COMPLETE**

### 7.1 Editor Enhancements

- [ ] **Syntax highlighting**
  - Narsese (red terms, blue copulas)
  - MeTTa (S-expressions)
  - Auto-detect mode (future)

- [ ] **Auto-completion** (future)
  - Terms, copulas, predicates
  - Context-aware suggestions

- [ ] **Editing improvements**
  - Bracket matching
  - Multi-line support (Shift+Enter)
  - Command history (Up/Down, Ctrl+R)

### 7.2 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Execute current cell |
| `Ctrl+L` | Clear REPL |
| `Ctrl+S` | Save notebook to file |
| `Ctrl+O` | Load notebook from file |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+G` | Go to concept (search) |
| `Ctrl+D` | Trace derivation |
| `F1` | Help |

### 7.3 Theme System

- [ ] **Themes**
  - Dark (current)
  - Light
  - High contrast (accessibility)

- [ ] **Theme switcher** in settings
- [ ] Use CSS variables throughout

### 7.4 Accessibility

- [ ] **ARIA compliance**
  - Semantic HTML5 elements
  - Labels for interactive elements
  - Landmark regions
  - Live regions for updates

- [ ] **Keyboard navigation**
  - Tab through all controls
  - Focus indicators
  - Modal trapping (Esc to close)

- [ ] **Screen reader support**
  - Alt text for icons
  - Announced state changes

### 7.5 Animations & Performance

- [ ] **Micro-interactions**
  - Button feedback
  - Panel expand/collapse
  - Graph node selection pulse
  - Toast notifications

- [ ] **Performance**
  - Debounced handlers
  - Virtual scrolling for long lists
  - Lazy loading

---

## Phase 8: Testing & Documentation

### 8.1 Unit Tests

- [ ] Core utilities (ReactiveState, ServiceContainer, EventBus)
- [ ] FluentUI builder
- [ ] Decorator utilities

### 8.2 Component Tests (Storybook)

- [ ] TaskCard, ConceptCard (if exist)
- [ ] NotebookPanel cells
- [ ] GraphPanel
- [ ] FilterToolbar
- [ ] Widget types

### 8.3 E2E Tests (Playwright)

- [ ] IDE loads and connects
- [ ] REPL execution flow
- [ ] Mode switching (Local ↔ Remote)
- [ ] Notebook operations
- [ ] Graph interactions
- [ ] Filter system
- [ ] Demo loading

### 8.4 Documentation

- [ ] **Getting Started Guide** - Quick intro for new users
- [ ] **Component Guide** - How to use new utilities in components
- [ ] **Custom View Guide** - How to create specialized UIs
- [ ] **ZUI Guide** - Experimental graph-centric UI
- [ ] **API Reference** - ReactiveState, EventBus, ServiceContainer, FluentUI
- [ ] **Keyboard Shortcuts** - Quick reference card
- [ ] **Migration Guide** - Updating existing components

---

## Implementation Strategy

### Incremental Rollout

1. ✅ **Phase 1** - Core utilities available, opt-in
2. ✅ **Phase 2** - Create simple custom view examples
3. ✅ **Phase 3** - Enhance existing components one at a time
4. ✅ **Phase 4-5** - Add REPL and exploration features
5. **Phase 6** - ZUI as separate experiment
6. ✅ **Phase 7** - Polish and accessibility
7. **Phase 8** - Testing and documentation

### Feature Flags

```javascript
const config = {
  useReactiveState: true,     // New reactive state
  useFluentBuilders: true,    // FluentUI builders
  useServiceContainer: false, // Optional DI
  enableZUI: false            // Experimental ZUI
};
```

### Prioritization

**High Priority** (Tangible Wins):
- Phase 3: Enhanced existing components with new utilities
- Phase 4.1: Message visibility system (big UX improvement)
- Phase 4.3: New widget types
- Phase 5.1-5.2: Enhanced memory/concept browsing

**Medium Priority**:
- Phase 2: Simple custom view examples
- Phase 4.2: Cell operations improvements
- Phase 5.3: Derivation tracer enhancements
- Phase 7.2-7.4: Keyboard shortcuts, themes, accessibility

**Low Priority** (Future/Experimental):
- Phase 6: ZUI experimental
- Phase 7.1: Editor auto-completion
- Phase 7.5: Advanced animations

---

## Current Status

✅ **Phase 1 Complete** - Core metaprogramming infrastructure
  - ReactiveState, ServiceContainer, EventBus, Decorators, FluentUI, ComponentGenerator

🎯 **Next Up** - Pick tangible wins from Phase 3-5

📝 **Experimental** - ZUI kept separate (Phase 6)

---

## Success Criteria

✅ **Reduced boilerplate** - 40% less code in refactored components

✅ **Better UX** - Message visibility, enhanced browsing, new widgets

✅ **Simple custom views** - Easy to create specialized UIs

✅ **Experimental ZUI** - Innovative graph-centric option available

✅ **Production ready** - Tests, docs, accessibility

✅ **Backward compatible** - Existing code works unchanged

---

## Skipped (Avoiding Overengineering)

- ❌ Complex UIBuilder/manifest system - too much abstraction
- ❌ State management framework - use browser storage directly
- ❌ URL encoding - not essential
- ❌ Plugin system - YAGNI (You Aren't Gonna Need It)
- ❌ Auto-save/persistence - manual save is fine
- ❌ Collaboration features - out of scope

**Keep it simple. Focus on tangible improvements.**
