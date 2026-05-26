# ContextualWidget Revolution: Adaptive Widget System

## Vision

Transform the [`ContextualWidget`](ui/src/zui/ContextualWidget.js:1) system into a **revolutionary adaptive widget platform** that redefines how users interact with knowledge graphs. This system creates a fluid, intuitive interface where widgets seamlessly adapt to context, user behavior, and available space - all within a single flat graph coordinate system.

## Core Philosophy

### Revolutionary Principles

1. **Fluid Adaptation**: Widgets morph smoothly between states, not discrete jumps
2. **Context Awareness**: Widgets respond to their environment (neighbors, zoom, focus)
3. **Predictive Intelligence**: System learns user patterns and anticipates needs
4. **Spatial Memory**: Remember where users left off and restore context
5. **Performance First**: 60 FPS guaranteed, even with thousands of widgets
6. **Developer Freedom**: Optional LOD, configurable everything, sensible defaults

### The "Fractal" Metaphor

Not nested viewports, but **self-similar detail at any scale**:
- Zoom out → See patterns and relationships
- Zoom in → See details and interactions
- Same space, different perspectives
- Smooth transitions, no jarring jumps

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Adaptive Graph Space                      │
│                                                              │
│  Fluid Zoom Continuum:                                      │
│                                                              │
│  0.1x ──────► 0.5x ──────► 1.0x ──────► 2.0x ──────► 5.0x  │
│   │           │           │           │           │       │
│   ▼           ▼           ▼           ▼           ▼       │
│  Icons      Compact    Standard    Expanded    Full       │
│  (dots)     (labels)   (widgets)   (panels)   (apps)     │
│                                                              │
│  Smooth CSS transitions + GPU acceleration                  │
│  Predictive preloading + Intelligent caching                │
│  Gesture support + Keyboard shortcuts                       │
└─────────────────────────────────────────────────────────────┘
```

## Phase 1: Foundation (Weeks 1-2)

### 1.1 Adaptive Widget Core

**Objective**: Build a flexible, performant widget system with optional LOD.

#### Tasks

- [ ] **Implement AdaptiveWidget Class**
  - Core widget abstraction
  - Optional LOD support
  - Fluid state transitions
  - Performance monitoring
  
  ```javascript
  class AdaptiveWidget {
      constructor(nodeId, config) {
          this.nodeId = nodeId;
          this.config = {
              type: config.type || 'label',
              data: config.data || {},
              lod: config.lod || null, // null = no LOD, single mode
              transitions: config.transitions || true,
              interactive: config.interactive ?? true,
              draggable: config.draggable ?? false,
              resizable: config.resizable ?? false
          };
          
          this.element = null;
          this.currentState = 'initial';
          this.targetState = 'initial';
          this.transitionProgress = 0;
          this.metrics = {
              renderTime: 0,
              updateCount: 0,
              lastUpdate: 0
          };
      }
      
      // Determine display state based on context
      getState(context) {
          const { apparentSize, zoom, focus, neighbors } = context;
          
          // If no LOD configured, use single mode
          if (!this.config.lod) {
              return 'standard';
          }
          
          // Use configured LOD breakpoints
          const lod = this.config.lod;
          
          // Check size-based breakpoints
          if (lod.breakpoints) {
              for (const [state, breakpoint] of Object.entries(lod.breakpoints)) {
                  if (apparentSize.width >= breakpoint.minWidth &&
                      apparentSize.height >= breakpoint.minHeight) {
                      return state;
                  }
              }
          }
          
          // Check zoom-based breakpoints
          if (lod.zoomLevels) {
              for (const [state, level] of Object.entries(lod.zoomLevels)) {
                  if (zoom >= level.minZoom && zoom < level.maxZoom) {
                      return state;
                  }
              }
          }
          
          // Default to first defined state
          return lod.defaultState || 'standard';
      }
      
      // Render widget for given state
      render(state, container) {
          const startTime = performance.now();
          
          // Get renderer for state
          const renderer = this._getRenderer(state);
          if (!renderer) {
              console.warn(`No renderer for state: ${state}`);
              return;
          }
          
          // Create or update element
          if (this.element && this.currentState === state) {
              // Update existing element
              renderer.update(this.element, this.config.data);
          } else {
              // Create new element
              this.element = renderer.create(this.config.data);
              
              if (container) {
                  if (this.config.transitions && this.element) {
                      this._transitionTo(container, this.element, state);
                  } else {
                      container.innerHTML = '';
                      container.appendChild(this.element);
                  }
              }
          }
          
          this.currentState = state;
          this.metrics.renderTime = performance.now() - startTime;
          this.metrics.updateCount++;
          this.metrics.lastUpdate = Date.now();
      }
      
      _getRenderer(state) {
          const lod = this.config.lod;
          
          if (!lod) {
              // Single mode - use default renderer
              return this.config.renderer || this._defaultRenderer;
          }
          
          // Get renderer for state
          return lod.renderers?.[state] || lod.renderers?.standard || this._defaultRenderer;
      }
      
      _transitionTo(container, newElement, newState) {
          const oldElement = container.firstElementChild;
          
          if (!oldElement) {
              container.appendChild(newElement);
              return;
          }
          
          // Fade out old element
          oldElement.style.transition = 'opacity 150ms ease-out';
          oldElement.style.opacity = '0';
          
          setTimeout(() => {
              container.innerHTML = '';
              container.appendChild(newElement);
              
              // Fade in new element
              newElement.style.opacity = '0';
              newElement.style.transition = 'opacity 150ms ease-in';
              
              requestAnimationFrame(() => {
                  newElement.style.opacity = '1';
              });
          }, 150);
      }
      
      _defaultRenderer = {
          create: (data) => {
              const div = document.createElement('div');
              div.className = 'adaptive-widget';
              div.textContent = JSON.stringify(data);
              return div;
          },
          update: (element, data) => {
              element.textContent = JSON.stringify(data);
          }
      };
  }
  ```

- [ ] **Implement ContextCalculator**
  - Calculate apparent size
  - Determine focus state
  - Analyze neighborhood
  - Cache calculations
  
  ```javascript
  class ContextCalculator {
      constructor(graph) {
          this.graph = graph;
          this.cache = new Map();
          this.dirty = new Set();
          this.throttleMs = 16; // ~60fps
          this.lastUpdate = 0;
      }
      
      getContext(nodeId) {
          // Check cache
          if (this.cache.has(nodeId) && !this.dirty.has(nodeId)) {
              return this.cache.get(nodeId);
          }
          
          // Throttle updates
          const now = Date.now();
          if (now - this.lastUpdate < this.throttleMs) {
              return this.cache.get(nodeId) || this._emptyContext();
          }
          
          this.lastUpdate = now;
          
          // Calculate context
          const context = {
              nodeId,
              apparentSize: this._getApparentSize(nodeId),
              zoom: this.graph.cy.zoom(),
              pan: this.graph.cy.pan(),
              focus: this._getFocusState(nodeId),
              neighbors: this._getNeighbors(nodeId),
              viewport: this._getViewport(),
              timestamp: now
          };
          
          // Cache result
          this.cache.set(nodeId, context);
          this.dirty.delete(nodeId);
          
          return context;
      }
      
      _getApparentSize(nodeId) {
          const node = this.graph.cy.getElementById(nodeId);
          if (!node?.length) return { width: 0, height: 0 };
          
          const zoom = this.graph.cy.zoom();
          const nodeWidth = node.outerWidth() || 30;
          const nodeHeight = node.outerHeight() || 30;
          
          return {
              width: nodeWidth * zoom,
              height: nodeHeight * zoom,
              area: (nodeWidth * zoom) * (nodeHeight * zoom)
          };
      }
      
      _getFocusState(nodeId) {
          const node = this.graph.cy.getElementById(nodeId);
          if (!node?.length) return 'none';
          
          if (node.selected()) return 'selected';
          if (node.hasClass('hovered')) return 'hovered';
          
          // Check if in viewport center
          const viewport = this.graph.cy.extent();
          const pos = node.position();
          const centerX = (viewport.x1 + viewport.x2) / 2;
          const centerY = (viewport.y1 + viewport.y2) / 2;
          const distance = Math.sqrt(
              Math.pow(pos.x - centerX, 2) + 
              Math.pow(pos.y - centerY, 2)
          );
          
          if (distance < 100) return 'focused';
          if (distance < 300) return 'nearby';
          
          return 'none';
      }
      
      _getNeighbors(nodeId) {
          const node = this.graph.cy.getElementById(nodeId);
          if (!node?.length) return [];
          
          const neighbors = node.neighborhood('node');
          
          return neighbors.map(n => ({
              id: n.id(),
              distance: this._getDistance(nodeId, n.id()),
              selected: n.selected()
          }));
      }
      
      _getDistance(nodeId1, nodeId2) {
          const node1 = this.graph.cy.getElementById(nodeId1);
          const node2 = this.graph.cy.getElementById(nodeId2);
          
          if (!node1?.length || !node2?.length) return Infinity;
          
          const pos1 = node1.position();
          const pos2 = node2.position();
          
          return Math.sqrt(
              Math.pow(pos1.x - pos2.x, 2) + 
              Math.pow(pos1.y - pos2.y, 2)
          );
      }
      
      _getViewport() {
          const extent = this.graph.cy.extent();
          return {
              x: extent.x1,
              y: extent.y1,
              width: extent.x2 - extent.x1,
              height: extent.y2 - extent.y1,
              zoom: this.graph.cy.zoom()
          };
      }
      
      _emptyContext() {
          return {
              nodeId: null,
              apparentSize: { width: 0, height: 0, area: 0 },
              zoom: 1,
              pan: { x: 0, y: 0 },
              focus: 'none',
              neighbors: [],
              viewport: this._getViewport(),
              timestamp: Date.now()
          };
      }
      
      invalidate(nodeId) {
          this.dirty.add(nodeId);
      }
      
      invalidateAll() {
          this.dirty = new Set(this.cache.keys());
      }
  }
  ```

- [ ] **Implement WidgetManager**
  - Manage all widgets
  - Coordinate updates
  - Handle lifecycle
  - Optimize performance
  
  ```javascript
  class WidgetManager {
      constructor(graph, container) {
          this.graph = graph;
          this.container = container;
          this.widgets = new Map();
          this.contextCalculator = new ContextCalculator(graph);
          this.updateQueue = new Set();
          this.updateScheduled = false;
          this.rafId = null;
          
          this._setupEventListeners();
      }
      
      attachWidget(nodeId, config) {
          // Remove existing widget
          this.detachWidget(nodeId);
          
          // Create widget
          const widget = new AdaptiveWidget(nodeId, config);
          this.widgets.set(nodeId, widget);
          
          // Create container
          const widgetContainer = document.createElement('div');
          widgetContainer.className = 'adaptive-widget-container';
          widgetContainer.dataset.nodeId = nodeId;
          widgetContainer.style.position = 'absolute';
          widgetContainer.style.pointerEvents = 'auto';
          
          this.container.appendChild(widgetContainer);
          
          // Initial render
          const context = this.contextCalculator.getContext(nodeId);
          const state = widget.getState(context);
          widget.render(state, widgetContainer);
          
          // Position widget
          this._positionWidget(nodeId, widgetContainer);
          
          return widget;
      }
      
      detachWidget(nodeId) {
          const widget = this.widgets.get(nodeId);
          if (!widget) return;
          
          // Remove from DOM
          const container = this.container.querySelector(`[data-node-id="${nodeId}"]`);
          if (container) {
              container.remove();
          }
          
          // Remove from map
          this.widgets.delete(nodeId);
          
          // Invalidate cache
          this.contextCalculator.invalidate(nodeId);
      }
      
      updateWidget(nodeId) {
          this.updateQueue.add(nodeId);
          this._scheduleUpdate();
      }
      
      updateAllWidgets() {
          this.widgets.forEach((_, nodeId) => {
              this.updateQueue.add(nodeId);
          });
          this._scheduleUpdate();
      }
      
      _scheduleUpdate() {
          if (this.updateScheduled) return;
          
          this.updateScheduled = true;
          this.rafId = requestAnimationFrame(() => this._processUpdates());
      }
      
      _processUpdates() {
          const startTime = performance.now();
          
          this.updateQueue.forEach(nodeId => {
              const widget = this.widgets.get(nodeId);
              if (!widget) return;
              
              const container = this.container.querySelector(`[data-node-id="${nodeId}"]`);
              if (!container) return;
              
              // Get context
              const context = this.contextCalculator.getContext(nodeId);
              
              // Determine state
              const state = widget.getState(context);
              
              // Render widget
              widget.render(state, container);
              
              // Position widget
              this._positionWidget(nodeId, container);
          });
          
          this.updateQueue.clear();
          this.updateScheduled = false;
          
          const duration = performance.now() - startTime;
          if (duration > 16) {
              console.warn(`Slow widget update: ${duration.toFixed(2)}ms`);
          }
      }
      
      _positionWidget(nodeId, container) {
          const node = this.graph.cy.getElementById(nodeId);
          if (!node?.length) return;
          
          const pos = node.position();
          const zoom = this.graph.cy.zoom();
          const pan = this.graph.cy.pan();
          
          // Calculate screen position
          const screenX = (pos.x * zoom) + pan.x;
          const screenY = (pos.y * zoom) + pan.y;
          
          container.style.left = `${screenX}px`;
          container.style.top = `${screenY}px`;
          container.style.transform = 'translate(-50%, -50%)';
      }
      
      _setupEventListeners() {
          // Update on zoom
          this.graph.cy.on('zoom', () => {
              this.contextCalculator.invalidateAll();
              this.updateAllWidgets();
          });
          
          // Update on pan
          this.graph.cy.on('pan', () => {
              this.contextCalculator.invalidateAll();
              this.updateAllWidgets();
          });
          
          // Update on node position change
          this.graph.cy.on('position', 'node', (e) => {
              const nodeId = e.target.id();
              this.contextCalculator.invalidate(nodeId);
              this.updateWidget(nodeId);
          });
          
          // Update on node selection
          this.graph.cy.on('select', 'node', (e) => {
              const nodeId = e.target.id();
              this.contextCalculator.invalidate(nodeId);
              this.updateWidget(nodeId);
          });
          
          // Clean up on node removal
          this.graph.cy.on('remove', 'node', (e) => {
              const nodeId = e.target.id();
              this.detachWidget(nodeId);
          });
      }
      
      clear() {
          this.widgets.forEach((_, nodeId) => {
              this.detachWidget(nodeId);
          });
          this.widgets.clear();
          this.contextCalculator.cache.clear();
      }
  }
  ```

### 1.2 Performance Optimizations

**Objective**: Ensure 60 FPS even with thousands of widgets.

#### Tasks

- [ ] **Implement Viewport Culling**
  - Only render visible widgets
  - Preload nearby widgets
  - Unload distant widgets
  
  ```javascript
  class ViewportCuller {
      constructor(widgetManager, graph) {
          this.widgetManager = widgetManager;
          this.graph = graph;
          this.visibleWidgets = new Set();
          this.preloadRadius = 500;
          this.unloadRadius = 2000;
      }
      
      update() {
          const viewport = this.graph.cy.extent();
          const centerX = (viewport.x1 + viewport.x2) / 2;
          const centerY = (viewport.y1 + viewport.y2) / 2;
          
          const widgets = this.widgetManager.widgets;
          
          widgets.forEach((widget, nodeId) => {
              const node = this.graph.cy.getElementById(nodeId);
              if (!node?.length) return;
              
              const pos = node.position();
              const distance = Math.sqrt(
                  Math.pow(pos.x - centerX, 2) + 
                  Math.pow(pos.y - centerY, 2)
              );
              
              const container = this.widgetManager.container.querySelector(
                  `[data-node-id="${nodeId}"]`
              );
              
              if (!container) return;
              
              if (distance < this.preloadRadius) {
                  // Visible or nearby - show
                  container.style.display = 'block';
                  this.visibleWidgets.add(nodeId);
              } else if (distance < this.unloadRadius) {
                  // Nearby but not visible - hide but keep in DOM
                  container.style.display = 'none';
                  this.visibleWidgets.delete(nodeId);
              } else {
                  // Far away - unload
                  container.style.display = 'none';
                  this.visibleWidgets.delete(nodeId);
                  
                  // Optionally remove from DOM to save memory
                  if (widget.config.unloadFar) {
                      container.innerHTML = '';
                  }
              }
          });
      }
  }
  ```

- [ ] **Implement Intelligent Caching**
  - Cache rendered elements
  - Cache calculations
  - Predictive preloading
  
  ```javascript
  class IntelligentCache {
      constructor(maxSize = 100) {
          this.cache = new Map();
          this.maxSize = maxSize;
          this.accessCount = new Map();
          this.lastAccess = new Map();
      }
      
      get(key) {
          if (!this.cache.has(key)) return null;
          
          // Update access stats
          this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
          this.lastAccess.set(key, Date.now());
          
          return this.cache.get(key);
      }
      
      set(key, value) {
          // Evict if necessary
          if (this.cache.size >= this.maxSize) {
              this._evict();
          }
          
          this.cache.set(key, value);
          this.accessCount.set(key, 1);
          this.lastAccess.set(key, Date.now());
      }
      
      _evict() {
          // Evict least recently used
          let lruKey = null;
          let lruTime = Infinity;
          
          this.lastAccess.forEach((time, key) => {
              if (time < lruTime) {
                  lruTime = time;
                  lruKey = key;
              }
          });
          
          if (lruKey) {
              this.cache.delete(lruKey);
              this.accessCount.delete(lruKey);
              this.lastAccess.delete(lruKey);
          }
      }
      
      clear() {
          this.cache.clear();
          this.accessCount.clear();
          this.lastAccess.clear();
      }
  }
  ```

- [ ] **Implement GPU Acceleration**
  - Use CSS transforms
  - Use will-change
  - Use requestAnimationFrame
  
  ```javascript
  class GPUAccelerator {
      static enable(element) {
          element.style.willChange = 'transform, opacity';
          element.style.transform = 'translateZ(0)';
          element.style.backfaceVisibility = 'hidden';
      }
      
      static disable(element) {
          element.style.willChange = '';
          element.style.transform = '';
          element.style.backfaceVisibility = '';
      }
  }
  ```

## Phase 2: Widget Library (Weeks 3-4)

### 2.1 Core Widgets

**Objective**: Create a comprehensive widget library with sensible defaults.

#### Tasks

- [ ] **Label Widget**
  - Markdown support
  - Optional LOD
  - Smooth transitions
  
  ```javascript
  // Simple usage - no LOD
  widgetManager.attachWidget('node1', {
      type: 'label',
      data: {
          text: '# Hello\n\nThis is **bold** text.'
      }
  });
  
  // With LOD - two modes
  widgetManager.attachWidget('node2', {
      type: 'label',
      data: {
          text: '# Complex Label\n\nWith lots of content...'
      },
      lod: {
          breakpoints: {
              compact: { minWidth: 0, minHeight: 0 },
              full: { minWidth: 200, minHeight: 100 }
          },
          renderers: {
              compact: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.className = 'label-widget compact';
                      div.textContent = data.text.substring(0, 30) + '...';
                      return div;
                  },
                  update: (element, data) => {
                      element.textContent = data.text.substring(0, 30) + '...';
                  }
              },
              full: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.className = 'label-widget full';
                      div.innerHTML = marked.parse(data.text);
                      return div;
                  },
                  update: (element, data) => {
                      element.innerHTML = marked.parse(data.text);
                  }
              }
          },
          defaultState: 'compact'
      }
  });
  ```

- [ ] **Code Widget**
  - Syntax highlighting
  - Copy button
  - Line numbers
  
  ```javascript
  widgetManager.attachWidget('node1', {
      type: 'code',
      data: {
          code: 'function hello() {\n  console.log("Hello!");\n}',
          language: 'javascript'
      },
      lod: {
          breakpoints: {
              icon: { minWidth: 0, minHeight: 0 },
              compact: { minWidth: 50, minHeight: 50 },
              full: { minWidth: 300, minHeight: 200 }
          },
          renderers: {
              icon: {
                  create: () => {
                      const div = document.createElement('div');
                      div.className = 'code-widget icon';
                      div.innerHTML = '💻';
                      return div;
                  }
              },
              compact: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.className = 'code-widget compact';
                      div.innerHTML = `<span class="lang">${data.language}</span>`;
                      return div;
                  }
              },
              full: {
                  create: (data) => {
                      const container = document.createElement('div');
                      container.className = 'code-widget full';
                      
                      const toolbar = document.createElement('div');
                      toolbar.className = 'code-toolbar';
                      toolbar.innerHTML = `
                          <button class="btn-copy">Copy</button>
                          <span class="lang">${data.language}</span>
                      `;
                      
                      const pre = document.createElement('pre');
                      const code = document.createElement('code');
                      code.className = `language-${data.language}`;
                      code.textContent = data.code;
                      pre.appendChild(code);
                      
                      container.appendChild(toolbar);
                      container.appendChild(pre);
                      
                      Prism.highlightElement(code);
                      
                      return container;
                  }
              }
          },
          defaultState: 'icon'
      }
  });
  ```

- [ ] **Chart Widget**
  - Multiple chart types
  - Interactive tooltips
  - Responsive sizing
  
  ```javascript
  widgetManager.attachWidget('node1', {
      type: 'chart',
      data: {
          type: 'bar',
          data: {
              labels: ['A', 'B', 'C'],
              datasets: [{
                  label: 'Data',
                  data: [10, 20, 30]
              }]
          }
      },
      lod: {
          breakpoints: {
              icon: { minWidth: 0, minHeight: 0 },
              compact: { minWidth: 50, minHeight: 50 },
              full: { minWidth: 300, minHeight: 200 }
          },
          renderers: {
              icon: {
                  create: () => {
                      const div = document.createElement('div');
                      div.className = 'chart-widget icon';
                      div.innerHTML = '📊';
                      return div;
                  }
              },
              compact: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.className = 'chart-widget compact';
                      div.innerHTML = `<span class="type">${data.type}</span>`;
                      return div;
                  }
              },
              full: {
                  create: (data) => {
                      const canvas = document.createElement('canvas');
                      canvas.className = 'chart-widget full';
                      
                      new Chart(canvas, {
                          type: data.type,
                          data: data.data,
                          options: {
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                  legend: { display: true },
                                  tooltip: { enabled: true }
                              }
                          }
                      });
                      
                      return canvas;
                  }
              }
          },
          defaultState: 'icon'
      }
  });
  ```

- [ ] **Table Widget**
  - Sortable columns
  - Filterable rows
  - Pagination
  
  ```javascript
  widgetManager.attachWidget('node1', {
      type: 'table',
      data: {
          columns: ['Name', 'Value'],
          rows: [
              { Name: 'A', Value: 1 },
              { Name: 'B', Value: 2 }
          ]
      },
      lod: {
          breakpoints: {
              icon: { minWidth: 0, minHeight: 0 },
              compact: { minWidth: 50, minHeight: 50 },
              full: { minWidth: 400, minHeight: 300 }
          },
          renderers: {
              icon: {
                  create: () => {
                      const div = document.createElement('div');
                      div.className = 'table-widget icon';
                      div.innerHTML = '📋';
                      return div;
                  }
              },
              compact: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.className = 'table-widget compact';
                      div.innerHTML = `<span>${data.rows.length} rows</span>`;
                      return div;
                  }
              },
              full: {
                  create: (data) => {
                      const container = document.createElement('div');
                      container.className = 'table-widget full';
                      
                      const table = document.createElement('table');
                      
                      const thead = document.createElement('thead');
                      const headerRow = document.createElement('tr');
                      data.columns.forEach(col => {
                          const th = document.createElement('th');
                          th.textContent = col;
                          headerRow.appendChild(th);
                      });
                      thead.appendChild(headerRow);
                      table.appendChild(thead);
                      
                      const tbody = document.createElement('tbody');
                      data.rows.forEach(row => {
                          const tr = document.createElement('tr');
                          data.columns.forEach(col => {
                              const td = document.createElement('td');
                              td.textContent = row[col];
                              tr.appendChild(td);
                          });
                          tbody.appendChild(tr);
                      });
                      table.appendChild(tbody);
                      
                      container.appendChild(table);
                      
                      return container;
                  }
              }
          },
          defaultState: 'icon'
      }
  });
  ```

- [ ] **Image Widget**
  - Lazy loading
  - Zoom/pan
  - Caption support
  
  ```javascript
  widgetManager.attachWidget('node1', {
      type: 'image',
      data: {
          url: 'https://example.com/image.jpg',
          caption: 'Example image'
      },
      lod: {
          breakpoints: {
              icon: { minWidth: 0, minHeight: 0 },
              thumbnail: { minWidth: 50, minHeight: 50 },
              full: { minWidth: 300, minHeight: 200 }
          },
          renderers: {
              icon: {
                  create: () => {
                      const div = document.createElement('div');
                      div.className = 'image-widget icon';
                      div.innerHTML = '🖼️';
                      return div;
                  }
              },
              thumbnail: {
                  create: (data) => {
                      const img = document.createElement('img');
                      img.className = 'image-widget thumbnail';
                      img.src = data.thumbnail || data.url;
                      img.loading = 'lazy';
                      return img;
                  }
              },
              full: {
                  create: (data) => {
                      const container = document.createElement('div');
                      container.className = 'image-widget full';
                      
                      const img = document.createElement('img');
                      img.className = 'image-full';
                      img.src = data.url;
                      img.loading = 'lazy';
                      
                      const caption = document.createElement('div');
                      caption.className = 'image-caption';
                      caption.textContent = data.caption || '';
                      
                      container.appendChild(img);
                      container.appendChild(caption);
                      
                      return container;
                  }
              }
          },
          defaultState: 'icon'
      }
  });
  ```

### 2.2 Advanced Widgets

**Objective**: Create sophisticated widgets for complex use cases.

#### Tasks

- [ ] **Notebook Widget**
  - Jupyter-like interface
  - Code cells with output
  - Markdown cells
  
  ```javascript
  widgetManager.attachWidget('node1', {
      type: 'notebook',
      data: {
          cells: [
              {
                  type: 'markdown',
                  content: '# Analysis\n\nLet\'s analyze the data.'
              },
              {
                  type: 'code',
                  language: 'python',
                  content: 'import pandas as pd\ndf = pd.read_csv("data.csv")\ndf.head()',
                  output: '   Name  Value\n0    A      1\n1    B      2'
              }
          ]
      },
      lod: {
          breakpoints: {
              icon: { minWidth: 0, minHeight: 0 },
              compact: { minWidth: 50, minHeight: 50 },
              full: { minWidth: 600, minHeight: 400 }
          },
          renderers: {
              icon: {
                  create: () => {
                      const div = document.createElement('div');
                      div.className = 'notebook-widget icon';
                      div.innerHTML = '📓';
                      return div;
                  }
              },
              compact: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.className = 'notebook-widget compact';
                      div.innerHTML = `<span>${data.cells.length} cells</span>`;
                      return div;
                  }
              },
              full: {
                  create: (data) => {
                      const container = document.createElement('div');
                      container.className = 'notebook-widget full';
                      
                      data.cells.forEach((cell, index) => {
                          const cellDiv = document.createElement('div');
                          cellDiv.className = `notebook-cell ${cell.type}`;
                          
                          if (cell.type === 'markdown') {
                              cellDiv.innerHTML = marked.parse(cell.content);
                          } else if (cell.type === 'code') {
                              const pre = document.createElement('pre');
                              const code = document.createElement('code');
                              code.className = `language-${cell.language}`;
                              code.textContent = cell.content;
                              pre.appendChild(code);
                              cellDiv.appendChild(pre);
                              
                              if (cell.output) {
                                  const output = document.createElement('div');
                                  output.className = 'cell-output';
                                  output.textContent = cell.output;
                                  cellDiv.appendChild(output);
                              }
                              
                              Prism.highlightElement(code);
                          }
                          
                          container.appendChild(cellDiv);
                      });
                      
                      return container;
                  }
              }
          },
          defaultState: 'icon'
      }
  });
  ```

- [ ] **Timeline Widget**
  - Temporal visualization
  - Event markers
  - Scrubbing
  
  ```javascript
  widgetManager.attachWidget('node1', {
      type: 'timeline',
      data: {
          events: [
              { time: '2024-01-01', title: 'Event 1', description: 'Description' },
              { time: '2024-02-01', title: 'Event 2', description: 'Description' }
          ]
      },
      lod: {
          breakpoints: {
              icon: { minWidth: 0, minHeight: 0 },
              compact: { minWidth: 50, minHeight: 50 },
              full: { minWidth: 500, minHeight: 300 }
          },
          renderers: {
              icon: {
                  create: () => {
                      const div = document.createElement('div');
                      div.className = 'timeline-widget icon';
                      div.innerHTML = '📅';
                      return div;
                  }
              },
              compact: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.className = 'timeline-widget compact';
                      div.innerHTML = `<span>${data.events.length} events</span>`;
                      return div;
                  }
              },
              full: {
                  create: (data) => {
                      const container = document.createElement('div');
                      container.className = 'timeline-widget full';
                      
                      const timeline = document.createElement('div');
                      timeline.className = 'timeline';
                      
                      data.events.forEach(event => {
                          const eventDiv = document.createElement('div');
                          eventDiv.className = 'timeline-event';
                          
                          const marker = document.createElement('div');
                          marker.className = 'timeline-marker';
                          
                          const content = document.createElement('div');
                          content.className = 'timeline-content';
                          content.innerHTML = `
                              <div class="event-time">${event.time}</div>
                              <div class="event-title">${event.title}</div>
                              <div class="event-description">${event.description}</div>
                          `;
                          
                          eventDiv.appendChild(marker);
                          eventDiv.appendChild(content);
                          timeline.appendChild(eventDiv);
                      });
                      
                      container.appendChild(timeline);
                      
                      return container;
                  }
              }
          },
          defaultState: 'icon'
      }
  });
  ```

- [ ] **Map Widget**
  - Interactive map
  - Markers
  - Layers
  
  ```javascript
  widgetManager.attachWidget('node1', {
      type: 'map',
      data: {
          center: { lat: 40.7128, lng: -74.0060 },
          zoom: 13,
          markers: [
              { lat: 40.7128, lng: -74.0060, title: 'New York' }
          ]
      },
      lod: {
          breakpoints: {
              icon: { minWidth: 0, minHeight: 0 },
              compact: { minWidth: 50, minHeight: 50 },
              full: { minWidth: 400, minHeight: 300 }
          },
          renderers: {
              icon: {
                  create: () => {
                      const div = document.createElement('div');
                      div.className = 'map-widget icon';
                      div.innerHTML = '🗺️';
                      return div;
                  }
              },
              compact: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.className = 'map-widget compact';
                      div.innerHTML = `<span>${data.markers.length} markers</span>`;
                      return div;
                  }
              },
              full: {
                  create: (data) => {
                      const container = document.createElement('div');
                      container.className = 'map-widget full';
                      
                      const map = L.map(container).setView(
                          [data.center.lat, data.center.lng],
                          data.zoom
                      );
                      
                      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                          attribution: '© OpenStreetMap'
                      }).addTo(map);
                      
                      data.markers.forEach(marker => {
                          L.marker([marker.lat, marker.lng])
                              .addTo(map)
                              .bindPopup(marker.title);
                      });
                      
                      return container;
                  }
              }
          },
          defaultState: 'icon'
      }
  });
  ```

## Phase 3: Interaction & UX (Weeks 5-6)

### 3.1 Revolutionary Interactions

**Objective**: Create intuitive, fluid interactions.

#### Tasks

- [ ] **Implement Gesture Support**
  - Pinch to zoom
  - Swipe to navigate
  - Long press for context menu
  
  ```javascript
  class GestureManager {
      constructor(container, graph) {
          this.container = container;
          this.graph = graph;
          this.gestures = new Map();
          
          this._setupTouchEvents();
      }
      
      _setupTouchEvents() {
          let touches = [];
          let lastDistance = 0;
          let lastCenter = { x: 0, y: 0 };
          
          this.container.addEventListener('touchstart', (e) => {
              touches = Array.from(e.touches);
              
              if (touches.length === 2) {
                  lastDistance = this._getDistance(touches[0], touches[1]);
                  lastCenter = this._getCenter(touches[0], touches[1]);
              }
          });
          
          this.container.addEventListener('touchmove', (e) => {
              e.preventDefault();
              
              touches = Array.from(e.touches);
              
              if (touches.length === 2) {
                  // Pinch to zoom
                  const distance = this._getDistance(touches[0], touches[1]);
                  const scale = distance / lastDistance;
                  
                  const currentZoom = this.graph.cy.zoom();
                  const newZoom = Math.max(0.1, Math.min(10, currentZoom * scale));
                  
                  this.graph.cy.zoom(newZoom);
                  
                  lastDistance = distance;
                  
                  // Pan with pinch center
                  const center = this._getCenter(touches[0], touches[1]);
                  const dx = center.x - lastCenter.x;
                  const dy = center.y - lastCenter.y;
                  
                  const pan = this.graph.cy.pan();
                  this.graph.cy.pan({
                      x: pan.x + dx,
                      y: pan.y + dy
                  });
                  
                  lastCenter = center;
              }
          });
          
          this.container.addEventListener('touchend', (e) => {
              touches = Array.from(e.touches);
          });
      }
      
      _getDistance(touch1, touch2) {
          const dx = touch1.clientX - touch2.clientX;
          const dy = touch1.clientY - touch2.clientY;
          return Math.sqrt(dx * dx + dy * dy);
      }
      
      _getCenter(touch1, touch2) {
          return {
              x: (touch1.clientX + touch2.clientX) / 2,
              y: (touch1.clientY + touch2.clientY) / 2
          };
      }
  }
  ```

- [ ] **Implement Spatial Memory**
  - Remember zoom/pan positions
  - Restore on revisit
  - Learn user patterns
  
  ```javascript
  class SpatialMemory {
      constructor() {
          this.memories = new Map();
          this.patterns = new Map();
      }
      
      remember(nodeId, viewport) {
          this.memories.set(nodeId, {
              zoom: viewport.zoom,
              pan: { ...viewport.pan },
              timestamp: Date.now()
          });
          
          this._analyzePatterns();
      }
      
      recall(nodeId) {
          return this.memories.get(nodeId);
      }
      
      _analyzePatterns() {
          // Analyze user patterns
          const zoomLevels = Array.from(this.memories.values())
              .map(m => m.zoom);
          
          const avgZoom = zoomLevels.reduce((a, b) => a + b, 0) / zoomLevels.length;
          
          this.patterns.set('preferredZoom', avgZoom);
      }
      
      getPreferredZoom() {
          return this.patterns.get('preferredZoom') || 1.0;
      }
  }
  ```

- [ ] **Implement Predictive Preloading**
  - Predict user's next action
  - Preload likely widgets
  - Cache predicted content
  
  ```javascript
  class PredictivePreloader {
      constructor(widgetManager) {
          this.widgetManager = widgetManager;
          this.predictions = new Map();
      }
      
      predict(currentNodeId) {
          // Simple prediction: neighbors are likely next
          const graph = this.widgetManager.graph;
          const node = graph.cy.getElementById(currentNodeId);
          
          if (!node?.length) return [];
          
          const neighbors = node.neighborhood('node');
          
          return neighbors.map(n => n.id());
      }
      
      preload(nodeIds) {
          nodeIds.forEach(nodeId => {
              const widget = this.widgetManager.widgets.get(nodeId);
              
              if (widget && widget.config.lod) {
                  // Preload all states
                  Object.keys(widget.config.lod.renderers).forEach(state => {
                      const renderer = widget.config.lod.renderers[state];
                      if (renderer.create) {
                          const element = renderer.create(widget.config.data);
                          // Cache element
                      }
                  });
              }
          });
      }
  }
  ```

### 3.2 Accessibility

**Objective**: Ensure accessibility for all users.

#### Tasks

- [ ] **Implement Keyboard Navigation**
  - Tab through widgets
  - Arrow key navigation
  - Shortcut keys
  
  ```javascript
  class KeyboardNavigator {
      constructor(widgetManager) {
          this.widgetManager = widgetManager;
          this.focusableWidgets = [];
          this.currentIndex = 0;
          
          this._setupKeyboardEvents();
      }
      
      _setupKeyboardEvents() {
          document.addEventListener('keydown', (e) => {
              // Ignore if typing in input
              if (e.target.tagName === 'INPUT' || 
                  e.target.tagName === 'TEXTAREA' ||
                  e.target.isContentEditable) {
                  return;
              }
              
              switch (e.key) {
                  case 'Tab':
                      e.preventDefault();
                      if (e.shiftKey) {
                          this.previous();
                      } else {
                          this.next();
                      }
                      break;
                  case 'ArrowRight':
                      e.preventDefault();
                      this.next();
                      break;
                  case 'ArrowLeft':
                      e.preventDefault();
                      this.previous();
                      break;
                  case 'Enter':
                      e.preventDefault();
                      this.activate();
                      break;
                  case 'Escape':
                      e.preventDefault();
                      this.blur();
                      break;
              }
          });
      }
      
      next() {
          if (this.focusableWidgets.length === 0) return;
          
          this.currentIndex = (this.currentIndex + 1) % this.focusableWidgets.length;
          this.focus();
      }
      
      previous() {
          if (this.focusableWidgets.length === 0) return;
          
          this.currentIndex = (this.currentIndex - 1 + this.focusableWidgets.length) % this.focusableWidgets.length;
          this.focus();
      }
      
      focus() {
          const widget = this.focusableWidgets[this.currentIndex];
          if (widget) {
              widget.element.focus();
              widget.element.classList.add('keyboard-focused');
          }
      }
      
      blur() {
          const widget = this.focusableWidgets[this.currentIndex];
          if (widget) {
              widget.element.classList.remove('keyboard-focused');
          }
      }
      
      activate() {
          const widget = this.focusableWidgets[this.currentIndex];
          if (widget) {
              widget.element.click();
          }
      }
  }
  ```

- [ ] **Implement Screen Reader Support**
  - ARIA labels
  - Live regions
  - Announcements
  
  ```javascript
  class ScreenReaderSupport {
      constructor() {
          this.announcer = document.createElement('div');
          this.announcer.className = 'sr-only';
          this.announcer.setAttribute('aria-live', 'polite');
          document.body.appendChild(this.announcer);
      }
      
      announce(message) {
          this.announcer.textContent = message;
      }
      
      setLabel(element, label) {
          element.setAttribute('aria-label', label);
      }
      
      setDescription(element, description) {
          const id = `desc-${Math.random().toString(36).substr(2, 9)}`;
          
          const desc = document.createElement('div');
          desc.id = id;
          desc.className = 'sr-only';
          desc.textContent = description;
          
          element.setAttribute('aria-describedby', id);
          element.appendChild(desc);
      }
  }
  ```

## Phase 4: Integration & Testing (Weeks 7-8)

### 4.1 Integration

**Objective**: Integrate with existing SeNARS Explorer.

#### Tasks

- [ ] **Update ContextualWidget**
  - Use WidgetManager
  - Support adaptive widgets
  - Maintain backward compatibility
  
  ```javascript
  // In ContextualWidget.js
  class ContextualWidget {
      constructor(graphSystem, container) {
          this.graph = graphSystem;
          this.container = container;
          
          // Initialize new system
          this.widgetManager = new WidgetManager(graphSystem, container);
          this.viewportCuller = new ViewportCuller(this.widgetManager, graphSystem);
          this.spatialMemory = new SpatialMemory();
          this.predictivePreloader = new PredictivePreloader(this.widgetManager);
          
          // Legacy support
          this.activeWidgets = new Map();
          this.transformContainer = null;
          
          this._initContainer();
          this._setupListeners();
      }
      
      attach(nodeId, contentHtml, options = {}) {
          // Check if using new adaptive system
          if (options.type || options.lod) {
              return this.widgetManager.attachWidget(nodeId, options);
          }
          
          // Legacy support
          // ... existing code ...
      }
      
      // ... rest of existing methods ...
  }
  ```

- [ ] **Update ExplorerApp**
  - Add widget palette
  - Add widget inspector
  - Add widget settings
  
  ```javascript
  // In ExplorerApp.js
  initialize() {
      // ... existing code ...
      
      // Initialize widget system
      this._initWidgetSystem();
  }
  
  _initWidgetSystem() {
      // Create widget palette
      const palette = document.createElement('div');
      palette.className = 'widget-palette';
      
      const widgetTypes = [
          { type: 'label', icon: '📝', name: 'Label' },
          { type: 'code', icon: '💻', name: 'Code' },
          { type: 'chart', icon: '📊', name: 'Chart' },
          { type: 'table', icon: '📋', name: 'Table' },
          { type: 'image', icon: '🖼️', name: 'Image' },
          { type: 'notebook', icon: '📓', name: 'Notebook' },
          { type: 'timeline', icon: '📅', name: 'Timeline' },
          { type: 'map', icon: '🗺️', name: 'Map' }
      ];
      
      widgetTypes.forEach(widgetType => {
          const button = document.createElement('button');
          button.className = 'widget-palette-item';
          button.innerHTML = `<span class="widget-icon">${widgetType.icon}</span><span class="widget-name">${widgetType.name}</span>`;
          button.onclick = () => this._addWidgetToSelected(widgetType.type);
          palette.appendChild(button);
      });
      
      document.body.appendChild(palette);
      
      // Create widget inspector
      const inspector = document.createElement('div');
      inspector.className = 'widget-inspector';
      inspector.innerHTML = `
          <div class="inspector-header">
              <h3>Widget Inspector</h3>
              <button class="btn-close">×</button>
          </div>
          <div class="inspector-content">
              <div class="inspector-empty">Select a widget to inspect</div>
          </div>
      `;
      document.body.appendChild(inspector);
  }
  
  _addWidgetToSelected(widgetType) {
      const selected = this.graph.cy.$(':selected');
      
      if (selected.length === 0) {
          this.toastManager.show('Please select a node first', 'warning');
          return;
      }
      
      selected.forEach(node => {
          const nodeId = node.id();
          const widgetData = this._getDefaultWidgetData(widgetType);
          
          this.contextualWidget.attach(nodeId, '', {
              type: widgetType,
              data: widgetData
          });
      });
      
      this.toastManager.show(`Added ${widgetType} widget`, 'success');
  }
  ```

### 4.2 Testing

**Objective**: Ensure reliability and performance.

#### Tasks

- [ ] **Unit Tests**
  - Test AdaptiveWidget
  - Test ContextCalculator
  - Test WidgetManager
  - Test all widget types
  
  ```javascript
  describe('AdaptiveWidget', () => {
      it('should use single mode when no LOD configured', () => {
          const widget = new AdaptiveWidget('node1', {
              type: 'label',
              data: { text: 'Test' }
          });
          
          const context = {
              apparentSize: { width: 100, height: 100 },
              zoom: 1.0,
              focus: 'none',
              neighbors: []
          };
          
          expect(widget.getState(context)).toBe('standard');
      });
      
      it('should use LOD breakpoints when configured', () => {
          const widget = new AdaptiveWidget('node1', {
              type: 'label',
              data: { text: 'Test' },
              lod: {
                  breakpoints: {
                      compact: { minWidth: 0, minHeight: 0 },
                      full: { minWidth: 200, minHeight: 100 }
                  },
                  defaultState: 'compact'
              }
          });
          
          const context1 = {
              apparentSize: { width: 50, height: 50 },
              zoom: 1.0,
              focus: 'none',
              neighbors: []
          };
          
          const context2 = {
              apparentSize: { width: 300, height: 200 },
              zoom: 1.0,
              focus: 'none',
              neighbors: []
          };
          
          expect(widget.getState(context1)).toBe('compact');
          expect(widget.getState(context2)).toBe('full');
      });
  });
  ```

- [ ] **Performance Tests**
  - Test with 1000 widgets
  - Test zoom performance
  - Test memory usage
  
  ```javascript
  describe('Performance', () => {
      it('should handle 1000 widgets at 60 FPS', () => {
          const graph = mockGraph();
          const manager = new WidgetManager(graph, container);
          
          const start = performance.now();
          
          // Attach 1000 widgets
          for (let i = 0; i < 1000; i++) {
              manager.attachWidget(`node${i}`, {
                  type: 'label',
                  data: { text: `Widget ${i}` }
              });
          }
          
          const attachDuration = performance.now() - start;
          expect(attachDuration).toBeLessThan(2000);
          
          // Test zoom performance
          const zoomStart = performance.now();
          manager.updateAllWidgets();
          const zoomDuration = performance.now() - zoomStart;
          
          expect(zoomDuration).toBeLessThan(16); // < 60 FPS
      });
  });
  ```

## Phase 5: Documentation & Examples (Weeks 9-10)

### 5.1 Documentation

**Objective**: Create comprehensive documentation.

#### Tasks

- [ ] **API Documentation**
  - Complete API reference
  - Examples for all features
  - Best practices
  
  ```markdown
  # Adaptive Widget System API
  
  ## Quick Start
  
  ### Simple Widget (No LOD)
  
  ```javascript
  widgetManager.attachWidget('node1', {
      type: 'label',
      data: {
          text: '# Hello\n\nThis is a label.'
      }
  });
  ```
  
  ### Widget with LOD
  
  ```javascript
  widgetManager.attachWidget('node1', {
      type: 'label',
      data: {
          text: '# Complex Label\n\nWith lots of content...'
      },
      lod: {
          breakpoints: {
              compact: { minWidth: 0, minHeight: 0 },
              full: { minWidth: 200, minHeight: 100 }
          },
          renderers: {
              compact: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.textContent = data.text.substring(0, 30) + '...';
                      return div;
                  }
              },
              full: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.innerHTML = marked.parse(data.text);
                      return div;
                  }
              }
          },
          defaultState: 'compact'
      }
  });
  ```
  
  ## Configuration Options
  
  ### Widget Config
  
  ```typescript
  interface WidgetConfig {
      type: string;                    // Widget type
      data: any;                       // Widget data
      lod?: LODConfig | null;          // LOD config (null = no LOD)
      transitions?: boolean;           // Enable transitions (default: true)
      interactive?: boolean;           // Enable interaction (default: true)
      draggable?: boolean;             // Enable dragging (default: false)
      resizable?: boolean;             // Enable resizing (default: false)
      unloadFar?: boolean;             // Unload when far (default: false)
  }
  ```
  
  ### LOD Config
  
  ```typescript
  interface LODConfig {
      breakpoints?: Record<string, Breakpoint>;  // Size-based breakpoints
      zoomLevels?: Record<string, ZoomLevel>;    // Zoom-based breakpoints
      renderers: Record<string, Renderer>;       // State renderers
      defaultState: string;                      // Default state
  }
  
  interface Breakpoint {
      minWidth: number;
      minHeight: number;
  }
  
  interface ZoomLevel {
      minZoom: number;
      maxZoom: number;
  }
  
  interface Renderer {
      create: (data: any) => HTMLElement;
      update?: (element: HTMLElement, data: any) => void;
  }
  ```
  ```

- [ ] **Widget Type Documentation**
  - Document all widget types
  - Provide examples
  - Explain configuration options
  
  ```markdown
  # Widget Types
  
  ## Label Widget
  
  Displays markdown text.
  
  ### Data Structure
  
  ```typescript
  interface LabelData {
      text: string;      // Markdown text
      icon?: string;     // Icon for compact mode
  }
  ```
  
  ### Example
  
  ```javascript
  widgetManager.attachWidget('node1', {
      type: 'label',
      data: {
          text: '# Hello\n\nThis is **bold** text.'
      }
  });
  ```
  
  ### LOD Example
  
  ```javascript
  widgetManager.attachWidget('node1', {
      type: 'label',
      data: {
          text: '# Complex\n\nWith lots of content...'
      },
      lod: {
          breakpoints: {
              compact: { minWidth: 0, minHeight: 0 },
              full: { minWidth: 200, minHeight: 100 }
          },
          renderers: {
              compact: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.textContent = data.text.substring(0, 30) + '...';
                      return div;
                  }
              },
              full: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.innerHTML = marked.parse(data.text);
                      return div;
                  }
              }
          },
          defaultState: 'compact'
      }
  });
  ```
  ```

### 5.2 Examples

**Objective**: Create inspiring examples.

#### Tasks

- [ ] **Basic Example**
  - Simple graph with widgets
  - Different widget types
  - Zoom to see adaptive behavior
  
  ```javascript
  // examples/basic-adaptive.js
  const graph = new SeNARSGraph('graph-container');
  graph.initialize();
  
  const widgetManager = new WidgetManager(graph, document.getElementById('widget-layer'));
  
  // Add nodes with widgets
  graph.addNode({ id: 'node1', term: 'Concept 1' });
  widgetManager.attachWidget('node1', {
      type: 'label',
      data: {
          text: '# Concept 1\n\nThis is a label widget that adapts to zoom level.'
      }
  });
  
  graph.addNode({ id: 'node2', term: 'Concept 2' });
  widgetManager.attachWidget('node2', {
      type: 'code',
      data: {
          code: 'function hello() {\n  console.log("Hello!");\n}',
          language: 'javascript'
      }
  });
  
  graph.addNode({ id: 'node3', term: 'Concept 3' });
  widgetManager.attachWidget('node3', {
      type: 'chart',
      data: {
          type: 'bar',
          data: {
              labels: ['A', 'B', 'C'],
              datasets: [{
                  label: 'Data',
                  data: [10, 20, 30]
              }]
          }
      }
  });
  
  // Add edges
  graph.addEdge({ source: 'node1', target: 'node2' });
  graph.addEdge({ source: 'node2', target: 'node3' });
  
  // Layout
  graph.scheduleLayout();
  
  console.log('Zoom in/out to see widgets adapt!');
  ```

- [ ] **Advanced Example**
  - Custom widget types
  - Complex LOD configurations
  - Interactive widgets
  
  ```javascript
  // examples/advanced-adaptive.js
  const graph = new SeNARSGraph('graph-container');
  graph.initialize();
  
  const widgetManager = new WidgetManager(graph, document.getElementById('widget-layer'));
  
  // Register custom widget type
  widgetManager.registerType('custom', {
      create: (data) => {
          const div = document.createElement('div');
          div.className = 'custom-widget';
          div.innerHTML = `
              <h4>${data.title}</h4>
              <p>${data.description}</p>
              <div class="custom-content">${data.content}</div>
          `;
          return div;
      }
  });
  
  // Add node with custom widget and LOD
  graph.addNode({ id: 'node1', term: 'Custom Concept' });
  widgetManager.attachWidget('node1', {
      type: 'custom',
      data: {
          title: 'Custom Widget',
          description: 'This widget has 3 adaptive states',
          content: '<p>Detailed content here</p>'
      },
      lod: {
          breakpoints: {
              icon: { minWidth: 0, minHeight: 0 },
              compact: { minWidth: 50, minHeight: 50 },
              full: { minWidth: 300, minHeight: 200 }
          },
          renderers: {
              icon: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.className = 'custom-widget icon';
                      div.innerHTML = '⭐';
                      return div;
                  }
              },
              compact: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.className = 'custom-widget compact';
                      div.innerHTML = `<span>${data.title}</span>`;
                      return div;
                  }
              },
              full: {
                  create: (data) => {
                      const div = document.createElement('div');
                      div.className = 'custom-widget full';
                      div.innerHTML = `
                          <h4>${data.title}</h4>
                          <p>${data.description}</p>
                          <div class="custom-content">${data.content}</div>
                      `;
                      return div;
                  }
              }
          },
          defaultState: 'icon'
      }
  });
  
  // Layout
  graph.scheduleLayout();
  ```

## Success Metrics

### Performance
- [ ] 60 FPS guaranteed with 1000 widgets
- [ ] < 100ms to update all widgets on zoom
- [ ] < 500ms to attach 1000 widgets
- [ ] < 50MB memory for 1000 widgets

### Usability
- [ ] 90% of users understand adaptive behavior within 5 minutes
- [ ] 80% of users can attach widgets successfully
- [ ] 95% of users find zoom-based adaptation intuitive
- [ ] < 3 clicks to attach any widget type

### Reliability
- [ ] 99.9% widget rendering success rate
- [ ] < 1% state transition failures
- [ ] < 5 second recovery time from errors
- [ ] 100% state preservation during transitions

## Timeline

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| Phase 1: Foundation | 2 weeks | Week 1 | Week 2 |
| Phase 2: Widget Library | 2 weeks | Week 3 | Week 4 |
| Phase 3: Interaction & UX | 2 weeks | Week 5 | Week 6 |
| Phase 4: Integration & Testing | 2 weeks | Week 7 | Week 8 |
| Phase 5: Documentation & Examples | 2 weeks | Week 9 | Week 10 |

**Total Duration**: 10 weeks

## Risks & Mitigations

### Risk 1: Performance Issues with Many Widgets
**Mitigation**: Implement viewport culling, intelligent caching, and GPU acceleration from the start

### Risk 2: Complex LOD Configuration
**Mitigation**: Make LOD completely optional, provide sensible defaults, and offer simple 2-mode presets

### Risk 3: Transition Jank
**Mitigation**: Use CSS transitions, batch DOM updates, and preload content

### Risk 4: User Confusion About Adaptive Behavior
**Mitigation**: Provide clear documentation, visual indicators, and smooth transitions

### Risk 5: Browser Compatibility
**Mitigation**: Test on multiple browsers, use polyfills as needed, provide graceful degradation

## Next Steps

1. **Review and approve** this plan
2. **Set up development environment**
3. **Create initial branch** for adaptive widget development
4. **Begin Phase 1: Foundation**
5. **Weekly progress reviews**

---

**Document Version**: 3.0  
**Last Updated**: 2026-02-08  
**Author**: SeNARS Development Team
