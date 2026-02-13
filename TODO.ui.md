# SeNARS UI Development Roadmap

**Vision:** Create the ultimate IDE/REPL for cognitive architecture development - powerful enough for research, intuitive enough for learning, fast enough for real-time interaction.

---

## Architecture Overview

### Apps

1. **`ide.html`** - **Unified IDE** (Primary App)
   - Local mode (in-browser NAR + MeTTa) OR Remote mode (WebSocket)
   - Notebook-style REPL with embedded widgets
   - Memory inspector, derivation tracer, graph explorer
   - Load demos, save/share notebooks, collaborative features

2. **`demo.html`** - **Demo Runner** (Separate App) ✅
   - Auto-run pre-configured demonstrations
   - Gallery of reasoning examples
   - Pedagogical interface for learning NARS
   - Shareable demo URLs
   - Can be loaded INTO ide.html but also standalone

3. **`index.html`** - **Launcher** (Landing Page)
   - Links to IDE and Demo Runner
   - Quick start guides
   - Version info and settings

---

## Phase 1: Unified IDE Foundation

### 1.1 Connection Architecture

- [ ] **Dual-mode system**
  - **Local mode** (default): In-browser NAR + MeTTa, no server needed
  - **Remote mode**: WebSocket connection to server
  - Toggle mode via menu without page reload
  - State preservation during mode switch
  
- [ ] **Connection UI**
  - Status bar: Mode indicator (💻 Local / 🌐 Remote), latency, message rate
  - Connect modal: Server URL, port, authentication
  - Auto-reconnect logic with backoff
  - Graceful degradation when offline

- [ ] **Unified ConnectionManager**
  - Abstract interface: `connect()`, `send()`, `subscribe()`, `disconnect()`
  - Implementations: `LocalConnectionManager`, `WebSocketManager`
  - Event-based message routing
  - Request/response correlation

### 1.2 Layout & Panels

- [ ] **Intelligent panel system**
  - **Main panels:**
    - REPL Notebook (includes console and logs, center, primary)
    - Knowledge Graph (right, collapsible, default: collapsed)
    - Memory Inspector (right, collapsible, default: collapsed)
    - Derivation Tracer (bottom, collapsible, default: collapsed)
  
- [ ] **Layout features**
  - Drag-and-drop rearrangement (GoldenLayout)
  - Save/load layout presets (beginner, researcher, debugging)
  - Responsive breakpoints for mobile/tablet
  - Maximize/minimize panels
  - Pop-out panels to separate windows

---

## Phase 2: REPL as Notebook

### 2.1 Cell-Based Interface

- [ ] **Cell types**
  - **Code cells**: Narsese or MeTTa input
  - **Markdown cells**: Documentation, explanations
  - **Result cells**: Auto-generated outputs (read-only)
  - **Widget cells**: Interactive visualizations
  
- [ ] **Cell operations**
  - Run (Ctrl+Enter), Run All, Run Above/Below
  - Edit, Delete, Duplicate, Move Up/Down
  - Fold/unfold cells
  - Cell execution counter
  - Execution time display

- [ ] **Notebook features**
  - Persistent history (IndexedDB/localStorage)
  - Export: JSON, Markdown, HTML
  - Import: from file, from URL
  - Share: encode in URL hash (compressed)
  - Auto-save drafts every 30s

### 2.2 Smart Input

- [ ] **Input features**
  - **Syntax highlighting**: Narsese (red terms, blue copulas) + MeTTa (S-expressions)
  - **Auto-completion**: Terms, copulas, predicates, functions
  - **Bracket matching**: Highlight matching `<>`, `[]`, `()`
  - **Multi-line editing**: Shift+Enter for newlines
  - **Command history**: Up/Down arrows, searchable (Ctrl+R)
  - **Snippets**: Quick insert for common patterns

- [ ] **Input modes**
  - Narsese, MeTTa, Mixed (auto-detect), Comment
  - Mode indicator in input box
  - Quick toggle button

### 2.3 Embedded Widgets

- [ ] **Widget types**
  - **GraphWidget**: Inline concept graph (clickable, zoomable)
  - **TruthSlider**: Interactive truth value adjustment
  - **TimelineWidget**: Temporal relationships over time
  - **MetricsWidget**: Inference rate, memory usage charts
  - **VariableInspector**: Current MeTTa bindings table
  - **TaskTree**: Hierarchical goal/subgoal visualization
  
- [ ] **Widget interactions**
  - Click to interact (adjust sliders, select nodes)
  - Double-click to expand in modal
  - Export widget as image/SVG
  - Widget state saved with notebook

### 2.4 Control Panel (Unified)

- [ ] **Reasoner controls** (toolbar near input)
  - ▶️ Start / ⏸️ Pause / ⏹️ Stop / ⏭️ Step / 🔄 Reset
  - Cycle counter display (live updating)
  - Inference rate (per second)
  - Step size control for debugging
  
- [ ] **Quick actions**
  - 📂 Load demo (dropdown menu)
  - 💾 Save/Export state
  - 🗑️ Clear memory
  - 📊 Show metrics
  - ⚙️ Settings modal

---

## Phase 3: Advanced REPL

### 3.1 Visibility System

**3 states for every message:**

1. **Full**: Expanded with all details (timestamp, source, trace)
2. **Compact**: Inline badge/chip (horizontal layout, click to expand)
3. **Hidden**: Filtered out entirely

### 3.2 Message Categories

- [ ] **Category definitions**
  - `reasoning`: Inferences, derivations, judgments → **Full**
  - `lm-call`: LLM requests/responses → **Compact**
  - `system`: Start/stop, errors, warnings → **Full**
  - `debug`: Internal state dumps → **Hidden**
  - `user-input`: Echo of user commands → **Compact**
  - `result`: Query answers → **Full**
  - `metric`: Performance stats → **Compact**
  - `derivation`: Proof trees → **Full** (optional)
  
- [ ] **Custom categories**
  - User-defined filters (regex matching)
  - Color coding per category
  - Icons for quick identification

### 3.3 Filter UI

- [ ] **Filter panel** (popup modal)
  - Grid of categories with visibility toggles
  - Text search across all messages
  - Time range slider (last hour, day, session)
  - Source filter (system, user, LLM, etc.)
  - Export filtered logs as JSON/CSV/Markdown
  
- [ ] **Compact widget layout**
  - Horizontal chip arrangement (flexbox)
  - Hover for tooltip preview
  - Click to expand inline
  - Badge counts for collapsed categories
  - Animated transitions

### 3.4 Log Features

- [ ] **Advanced capabilities**
  - Copy message to clipboard
  - Jump to source (e.g., task that triggered derivation)
  - Pin important messages to top
  - Highlight/annotate messages
  - Create snapshot of current log state
  - Diff between log snapshots

---

## Phase 4: Knowledge Exploration

### 4.1 Data Model Clarity

#### TaskCard (Sentence)
- **Definition**: Single atomic statement with truth and punctuation
- **Properties**: Term, Truth (f, c), Punctuation (`.` `!` `?`), Timestamp, Derivation
- **UI**: 
  - Compact card: `<bird --> animal>. {0.9 0.8}` with green left border
  - Truth bar visualization
  - Click to trace derivation
  - Hover to highlight related concepts in graph

#### ConceptCard (Term)
- **Definition**: Collection of all tasks about the same term
- **Properties**: Term, Priority, Task count, Related concepts
- **UI**:
  - Larger card with blue left border
  - Term name (bold)
  - Task count badge
  - Priority meter
  - Click to show all tasks in sidebar
  - Double-click to center in graph

### 4.2 Memory Inspector

- [ ] **Concept browser**
  - Searchable list of all concepts
  - Sort by: Priority, Task count, Recency
  - Filter by: Has goals, Has questions, Truth threshold
  - Paginated for large memories
  
- [ ] **Task browser**
  - All tasks grouped by concept
  - Expandable tree view
  - Show derivation chain
  - Edit truth values (local mode only)
  - Delete tasks (with confirmation)

### 4.3 Knowledge Graph

- [ ] **Graph features**
  - **Layouts**: Force-directed, hierarchical, circular, custom
  - **Filters**: Show only high-priority concepts, hide isolated nodes
  - **Interactions**:
    - Click node → Show ConceptCard
    - Double-click node → Expand neighbors
    - Click edge → Show relationship tasks
    - Drag nodes to rearrange
  - **Visual encoding**:
    - Node size = priority
    - Node color = task count (gradient)
    - Edge thickness = relationship strength
    - Animated updates when reasoning

- [ ] **Graph controls**
  - Zoom (mouse wheel), Pan (drag background)
  - Reset view button
  - Layout selector dropdown
  - Export as SVG/PNG
  - Fullscreen mode

### 4.4 Derivation Tracer

- [ ] **Proof tree visualization**
  - Show how a conclusion was derived
  - Tree layout: conclusion at top, premises below
  - Rule names on edges
  - Truth values propagated up
  - **Interactions**:
    - Click node to highlight in memory
    - Hover to show rule details
    - Collapse/expand branches
    - Export as text proof
  
- [ ] **Derivation history**
  - Timeline of all derivations
  - Filter by rule type
  - Playback mode (step through reasoning)
  - Compare derivations (why two different conclusions?)

---

## Phase 5: State Management & Persistence

### 5.1 Save/Load System

- [ ] **State formats**
  - **Memory snapshot**: All concepts and tasks as JSON
  - **Notebook**: Cells, outputs, widgets, execution state
  - **Full workspace**: Memory + Notebook + Layout + Settings
  
- [ ] **Operations**
  - Save to file (download)
  - Load from file (upload)
  - Auto-save to browser storage (every 30s)
  - Restore last session on startup
  - Name and manage multiple saved states

### 5.2 Demo Integration

- [ ] **Demo library** (in IDE)
  - Built-in demos from `examples.json`
  - Each demo is a pre-filled notebook
  - Categories: Reasoning, Temporal, Spatial, Language, etc.
  - Load demo → populates REPL cells → auto-run option
  
- [ ] **Demo Runner (`demo.html`) integration**
  - Link to open demo in full IDE
  - Embed IDE lite in demo.html for side-by-side
  - Demo progress tracking
  - Export demo results

---

## Phase 6: Developer Experience & Testing

### 6.1 Storybook Stories

- [ ] **Component isolation**
  - `TaskCard.stories.js`: Various truth values, punctuations, states
  - `ConceptCard.stories.js`: Different task counts, priorities
  - `GraphPanel.stories.js`: Small/medium/large graphs, different layouts
  - `REPLCell.stories.js`: Code/Markdown/Result/Widget cells
  - `FilterPanel.stories.js`: Different filter configurations
  - `DerivationTree.stories.js`: Simple/complex proof trees
  
- [ ] **Storybook addons**
  - Controls: Knobs for all props
  - Actions: Log event handlers
  - Viewport: Test responsive layouts
  - Accessibility: a11y checks
  - Docs: Auto-generated documentation

### 6.2 Playwright E2E Tests

- [ ] **Critical flows**
  - `smoke.spec.js`: IDE loads, connection works
  - `repl-basic.spec.js`: Input → Execute → Verify output
  - `mode-switch.spec.js`: Local ↔ Remote without data loss
  - `notebook.spec.js`: Create cells, run, export, import
  - `graph.spec.js`: Click nodes, zoom, layout change
  - `repl-filter.spec.js`: Toggle visibility, search, export
  - `derivation.spec.js`: Trace derivation, expand tree
  - `demo-load.spec.js`: Load demo, auto-run, verify results
  
- [ ] **Test infrastructure**
  - Screenshot comparison for regressions
  - Performance benchmarks (load time, interaction latency)
  - Cross-browser testing (Chromium, Firefox, WebKit)
  - CI integration (run on every PR)

### 6.3 Development Commands

```bash
# Development
npm run ui                  # Start IDE dev server
npm run storybook           # Component isolation
npm run test:e2e:ui         # Playwright UI mode (visual)

# Testing
npm run test:e2e            # Run all E2E tests
npm run test:screenshots    # Visual regression
npm run test:component      # Single component test

# Building
npm run ui:build            # Production build
npm run ui:preview          # Preview build locally
```

---

## Phase 7: UX Polish

### 7.1 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Execute current cell |
| `Ctrl+L` | Clear REPL |
| `Ctrl+K` | Focus search |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+S` | Save notebook |
| `Ctrl+O` | Load notebook |
| `Ctrl+,` | Settings |
| `Ctrl+/` | Toggle comment |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+G` | Go to concept |
| `Ctrl+D` | Trace derivation |
| `F1` | Help |

### 7.2 Theme System

- [ ] **Themes**
  - Dark (default, current)
  - Light
  - High contrast
  - Custom (user-defined colors)
  
- [ ] **Design tokens** (CSS variables)
  - Colors: primary, secondary, bg, text, border
  - Spacing: xs, sm, md, lg, xl
  - Typography: font families, sizes, weights
  - Shadows: elevation levels

### 7.3 Accessibility

- [ ] **ARIA compliance**
  - Semantic HTML5 elements
  - Labels for all interactive elements
  - Landmark regions (nav, main, aside)
  - Live regions for dynamic updates
  
- [ ] **Keyboard navigation**
  - Tab through all controls
  - Focus indicators (visible outlines)
  - Skip links for long pages
  - Modal trapping (Esc to close)
  
- [ ] **Screen reader support**
  - Meaningful alt text for icons
  - Announced state changes
  - Descriptive button labels

### 7.4 Animations

- [ ] **Micro-interactions**
  - Button hover/click feedback
  - Panel expand/collapse (smooth)
  - Graph node selection (pulse)
  - Loading spinners
  - Success/error toasts
  
- [ ] **Performance**
  - CSS transitions (GPU-accelerated)
  - Debounced scroll/resize handlers
  - Virtual scrolling for long lists
  - Lazy loading for images/widgets


## Phase 8: Networking

### 8.1 Collaboration

- [ ] **Real-time collaboration** (optional, remote mode)
  - Multiple users connect to same server
  - Shared notebook editing (like Google Docs)
  - Cursor presence indicators
  - Chat sidebar
  - Permissions (read-only, edit, admin)

---

## Implementation Priorities

### Sprint 1: Core IDE (Week 1-2)
- [x] Vite migration ✅
- [ ] Merge apps into `ide.html`
- [ ] Connection mode switcher (Local/Remote)
- [ ] Basic REPL notebook (cells + execute)
- [ ] REPL with simple filtering

### Sprint 2: Enhanced REPL (Week 3-4)
- [ ] Embedded widgets (graph, metrics, truth sliders)
- [ ] Smart input (syntax highlighting, autocomplete)
- [ ] Unified control panel
- [ ] Cell types (Code, Markdown, Result, Widget)
- [ ] Export/import notebooks

### Sprint 3: Knowledge Exploration (Week 5-6)
- [ ] TaskCard vs ConceptCard components
- [ ] Memory inspector (concept/task browsers)
- [ ] Knowledge graph (interactive visualization)
- [ ] Derivation tracer (proof trees)

### Sprint 4: Console & Logging (Week 7)
- [ ] Message categories
- [ ] 3 visibility states (Full/Compact/Hidden)
- [ ] Filter panel with advanced options
- [ ] Log export

### Sprint 5: State & Persistence (Week 8)
- [ ] Save/load workspace
- [ ] Auto-save to browser storage
- [ ] Demo library integration
- [ ] Session restore

### Sprint 6: Testing & Polish (Week 9-10)
- [ ] Storybook stories for all components
- [ ] Playwright E2E test suite
- [ ] Keyboard shortcuts
- [ ] Theme system
- [ ] Accessibility audit
- [ ] Performance optimization

---

## Success Criteria

✅ **Unified IDE** replaces 3 apps (online, repl, ide), demo.html stays separate

✅ **Seamless mode switching** Local ↔ Remote without reload

✅ **Notebook interface** with persistent history and embedded widgets

✅ **Filter system** with Full/Compact/Hidden states for all message types

✅ **Data model clarity** TaskCard (single task) vs ConceptCard (task collection)

✅ **Memory exploration** Concept browser, task drilldown, derivation tracer

✅ **State management** Save/load workspaces, auto-save, demo integration

✅ **Testing infrastructure** Storybook for components, Playwright for E2E

✅ **Performance** <1s HMR, <100ms interaction latency

✅ **Accessibility** WCAG 2.1 AA compliant

---

## The Ideal IDE/REPL

This is **the IDE we want**:

### For Learning
- Load a demo → See reasoning happen → Explore derivations → Understand NARS

### For Research
- Prototype ideas in REPL → Inspect memory → Trace derivations → Export results

### For Development
- Write MeTTa → Test in isolation (Storybook) → Integrate → Validate (Playwright)

### For Collaboration
- Share notebooks → Reproduce experiments → Build on each other's work

### For Production
- Connect to remote server → Monitor live reasoning → Debug issues → Optimize

**Fast, intuitive, powerful, collaborative.**
