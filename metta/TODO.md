# MeTTa Implementation: Hyperon Parity & Beyond Roadmap

**Objective:** Create the reference JavaScript/TypeScript implementation of MeTTa (Meta Type Talk) that achieves 100% feature parity with `hyperon-experimental` (Rust) while leveraging unique Web Platform capabilities and **exceeding Hyperon with pioneering AGI-native features**.

**References:**
- **Specification:** `hyperon-experimental` (Rust Reference Implementation)
- **Documentation:** `metta-lang.dev`
- **Inspiration:** Jetta (High-performance), OpenCog DAS (Distribution)
- **Goal:** Full stdlib parity + Web-native pioneering features + Beyond-Hyperon AGI capabilities

---

## ✅ Completed Phases Summary

> [!NOTE]
> Phases 1-7 have been completed. Core kernel, expression ops, math functions, HOFs, control flow, set operations, and type system are all implemented with 88/89 tests passing.

| Phase | Description | Status | Tests |
|-------|-------------|--------|-------|
| Phase 1 | Kernel Hardening & Compliance | ✅ Complete | All passing |
| Phase 2 | Expression Manipulation | ✅ Complete | 14/14 ✅ |
| Phase 3 | Complete Math Functions | ✅ Complete | 20/20 ✅ |
| Phase 4 | Higher-Order Functions | ✅ Complete | 10/10 ✅ |
| Phase 5 | Control Flow & Error Handling | ✅ Complete | Verified |
| Phase 6 | Set Operations | ✅ Complete | 12/12 ✅ |
| Phase 7 | Type System | ✅ Complete | 22/22 ✅ |

**Current Total: ~95% Hyperon stdlib parity achieved with 61+ grounded operations.**

---

## 🔥 Remaining Work: Phases 8-18

### **Phase 8: Module System & Space Isolation** ⭐ CRITICAL PARITY

**Goal:** Implement the module/import system required for MeTTa program organization.

#### 8.1 Module Loader

##### [NEW] `kernel/ModuleLoader.js`:

```javascript
import { Parser } from '../Parser.js';
import { Space } from './Space.js';
import { ENV } from '../platform/env.js';

export class ModuleLoader {
    constructor(interpreter, basePath = '.') {
        this.interpreter = interpreter;
        this.basePath = basePath;
        this.loadedModules = new Map();
        this.loading = new Set(); // Circular dependency detection
    }

    async import(moduleName) {
        if (this.loadedModules.has(moduleName)) {
            return this.loadedModules.get(moduleName);
        }

        if (this.loading.has(moduleName)) {
            throw new Error(`Circular dependency detected: ${moduleName}`);
        }

        this.loading.add(moduleName);

        try {
            // Create isolated space for module
            const moduleSpace = new Space();
            const content = await this._loadModuleContent(moduleName);
            
            // Parse and load into module space
            const parser = new Parser();
            const atoms = parser.parseProgram(content);
            
            // Create sub-interpreter for module
            const moduleInterp = this.interpreter._createChildInterpreter(moduleSpace);
            atoms.forEach(atom => moduleInterp.load(atom.toString()));
            
            this.loadedModules.set(moduleName, {
                space: moduleSpace,
                exports: this._extractExports(moduleSpace)
            });

            return this.loadedModules.get(moduleName);
        } finally {
            this.loading.delete(moduleName);
        }
    }

    async include(filePath) {
        // Unlike import, include loads directly into current space
        const content = await this._loadModuleContent(filePath);
        this.interpreter.load(content);
    }

    _extractExports(space) {
        // Export atoms marked with (export name)
        const exports = {};
        for (const atom of space.all()) {
            if (atom.operator?.name === 'export') {
                exports[atom.components[0].name] = atom.components[1];
            }
        }
        return exports;
    }

    async _loadModuleContent(name) {
        if (ENV.isNode) {
            const { FileLoader } = await import('../platform/node/FileLoader.js');
            return FileLoader.load(`${this.basePath}/${name}.metta`);
        } else {
            const { VirtualFS } = await import('../platform/browser/VirtualFS.js');
            return VirtualFS.load(`${name}.metta`);
        }
    }
}
```

#### 8.2 Space Isolation Operations

##### [MODIFY] `kernel/ops/SpaceOps.js`:

```javascript
export function registerSpaceOps(registry, interpreterContext) {
    // NEW: Create isolated space
    registry.register('new-space', () => {
        const newSpace = new Space();
        const id = `space-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        interpreterContext.spaces.set(id, newSpace);
        return sym(id);
    });

    // NEW: Add atom to specific space
    registry.register('add-atom-to', (spaceId, atom) => {
        const space = interpreterContext.spaces.get(spaceId.name);
        if (!space) return exp(sym('Error'), [spaceId, sym('SpaceNotFound')]);
        space.add(atom);
        return sym('ok');
    });

    // NEW: Match in specific space
    registry.register('match-in', (spaceId, pattern, template) => {
        const space = interpreterContext.spaces.get(spaceId.name);
        if (!space) return exp(sym('Error'), [spaceId, sym('SpaceNotFound')]);
        return interpreterContext._listify(match(space, pattern, template));
    }, { lazy: true });

    // NEW: Merge spaces
    registry.register('merge-spaces', (sourceId, targetId) => {
        const source = interpreterContext.spaces.get(sourceId.name);
        const target = interpreterContext.spaces.get(targetId.name);
        if (!source || !target) return exp(sym('Error'), [sym('SpaceNotFound')]);
        for (const atom of source.all()) target.add(atom);
        return sym('ok');
    });
}
```

#### 8.3 Import/Include Syntax

##### [MODIFY] `interp/MinimalOps.js`:

```javascript
// Add module operations
reg('import!', async (moduleName) => {
    const module = await interpreter.moduleLoader.import(moduleName.name);
    // Merge exported symbols into current space
    for (const [name, atom] of Object.entries(module.exports)) {
        interpreter.space.add(exp(sym('='), [sym(name), atom]));
    }
    return sym('ok');
}, { lazy: true, async: true });

reg('include!', async (filePath) => {
    await interpreter.moduleLoader.include(filePath.name);
    return sym('ok');
}, { lazy: true, async: true });

reg('bind!', (name, value) => {
    interpreter.space.add(exp(sym('='), [name, value]));
    return sym('ok');
}, { lazy: true });
```

**Hyperon Parity Checklist:**
- [ ] `import!` - Load module into isolated space, import exports
- [ ] `include!` - Load file directly into current space  
- [ ] `bind!` - Bind name to value in current space
- [ ] `new-space` - Create isolated atomspace
- [ ] `add-atom-to` - Add to specific space
- [ ] `match-in` - Query specific space

---

### **Phase 9: Stateful Atoms**

**Goal:** Implement mutable state atoms for imperative patterns when needed.

##### [NEW] `kernel/ops/StateOps.js`:

```javascript
const stateRegistry = new Map();
let stateIdCounter = 0;

export function registerStateOps(registry) {
    registry.register('new-state', (initialValue) => {
        const id = `state-${++stateIdCounter}`;
        stateRegistry.set(id, { value: initialValue, version: 0 });
        return exp(sym('State'), [sym(id)]);
    });

    registry.register('get-state', (stateAtom) => {
        if (stateAtom.operator?.name !== 'State') {
            return exp(sym('Error'), [stateAtom, sym('NotAState')]);
        }
        const id = stateAtom.components[0].name;
        const state = stateRegistry.get(id);
        return state ? state.value : sym('Empty');
    });

    registry.register('change-state!', (stateAtom, newValue) => {
        if (stateAtom.operator?.name !== 'State') {
            return exp(sym('Error'), [stateAtom, sym('NotAState')]);
        }
        const id = stateAtom.components[0].name;
        const state = stateRegistry.get(id);
        if (!state) return exp(sym('Error'), [stateAtom, sym('StateNotFound')]);
        state.value = newValue;
        state.version++;
        return newValue;
    });

    // BEYOND HYPERON: Transactional state
    registry.register('with-transaction', (stateAtom, operation) => {
        const id = stateAtom.components?.[0]?.name;
        const state = stateRegistry.get(id);
        if (!state) return exp(sym('Error'), [stateAtom, sym('StateNotFound')]);
        
        const snapshot = { ...state };
        try {
            // Execute operation - if it throws, rollback
            return registry.execute(operation.operator?.name, ...operation.components);
        } catch (e) {
            stateRegistry.set(id, snapshot);
            return exp(sym('Error'), [sym('TransactionFailed'), sym(e.message)]);
        }
    }, { lazy: true });

    // BEYOND HYPERON: State history
    registry.register('state-version', (stateAtom) => {
        const id = stateAtom.components?.[0]?.name;
        const state = stateRegistry.get(id);
        return state ? sym(String(state.version)) : sym('0');
    });
}
```

**Hyperon Parity Checklist:**
- [ ] `new-state` - Create mutable state atom
- [ ] `get-state` - Read current state value
- [ ] `change-state!` - Mutate state value

**Beyond Hyperon:**
- [ ] `with-transaction` - Transactional state updates with rollback
- [ ] `state-version` - Track mutation count for optimistic concurrency

---

### **Phase 10: Advanced Nondeterminism**

**Goal:** Complete `superpose`/`collapse` semantics and add advanced constructs.

##### [MODIFY] `interp/MinimalOps.js`:

```javascript
// Current collapse-bind should be renamed to collapse
reg('collapse', (atom) => {
    const results = reduceND(atom, interpreter.space, interpreter.ground, 
                             interpreter.config.maxReductionSteps);
    return interpreter._listify(results);
}, { lazy: true });

// Add superpose that works on list atoms directly
reg('superpose', (listAtom) => {
    const elements = interpreter.ground._flattenExpr(listAtom);
    if (elements.length === 0) return sym('Empty');
    if (elements.length === 1) return elements[0];
    // Return wrapped for ND reduction to pick up
    return exp(sym('superpose-internal'), elements);
}, { lazy: true });

// BEYOND HYPERON: Probabilistic superposition
reg('superpose-weighted', (weightedList) => {
    // List of (weight value) pairs
    const items = interpreter.ground._flattenExpr(weightedList);
    const weighted = items.map(item => ({
        weight: parseFloat(item.components?.[0]?.name) || 1,
        value: item.components?.[1] || item
    }));
    
    // Sample based on weights
    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
    let random = Math.random() * totalWeight;
    for (const { weight, value } of weighted) {
        random -= weight;
        if (random <= 0) return value;
    }
    return weighted[weighted.length - 1].value;
});

// BEYOND HYPERON: Lazy nondeterminism with limits
reg('collapse-n', (atom, n) => {
    const limit = parseInt(n.name) || 10;
    const results = [];
    const gen = reduceNDGenerator(atom, interpreter.space, interpreter.ground);
    for (let i = 0; i < limit; i++) {
        const { value, done } = gen.next();
        if (done) break;
        results.push(value);
    }
    return interpreter._listify(results);
}, { lazy: true });
```

**Hyperon Parity Checklist:**
- [ ] `collapse` - Collect all nondeterministic results into list
- [ ] `superpose` - Expand list into nondeterministic alternatives

**Beyond Hyperon:**
- [ ] `superpose-weighted` - Probabilistic sampling from weighted alternatives
- [ ] `collapse-n` - Collect first N results (lazy evaluation)

---

### **Phase 11: Distributed Atomspace Connector** ⭐ BEYOND HYPERON

**Goal:** Enable connection to OpenCog DAS for distributed knowledge representation.

##### [NEW] `extensions/DASConnector.js`:

```javascript
/**
 * Distributed Atomspace (DAS) Connector
 * Enables federated queries across remote atomspaces
 */
export class DASConnector {
    constructor(config = {}) {
        this.endpoints = config.endpoints || [];
        this.localCache = new Map();
        this.cacheTimeout = config.cacheTimeout || 30000; // 30s
        this.retryPolicy = config.retryPolicy || { maxRetries: 3, backoff: 1000 };
    }

    addEndpoint(url, options = {}) {
        this.endpoints.push({
            url,
            priority: options.priority || 1,
            protocol: options.protocol || 'http', // http, grpc, websocket
            healthy: true,
            lastCheck: 0
        });
    }

    async query(pattern, options = {}) {
        const cacheKey = pattern.toString();
        
        // Check local cache first
        if (this.localCache.has(cacheKey)) {
            const cached = this.localCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.results;
            }
        }

        // Query all healthy endpoints in parallel
        const healthyEndpoints = this.endpoints.filter(e => e.healthy);
        const queries = healthyEndpoints.map(endpoint => 
            this._queryEndpoint(endpoint, pattern, options)
        );

        const results = await Promise.allSettled(queries);
        
        // Merge results from all endpoints
        const merged = this._mergeResults(results);
        
        // Cache merged results
        this.localCache.set(cacheKey, {
            results: merged,
            timestamp: Date.now()
        });

        return merged;
    }

    async addAtom(atom, options = { replicate: true }) {
        if (!options.replicate) return;
        
        const replicationPromises = this.endpoints.map(endpoint =>
            this._replicateToEndpoint(endpoint, atom)
        );
        
        await Promise.allSettled(replicationPromises);
    }

    async subscribe(pattern, callback) {
        // WebSocket-based real-time subscription
        const subscriptions = this.endpoints
            .filter(e => e.protocol === 'websocket')
            .map(endpoint => this._subscribeToEndpoint(endpoint, pattern, callback));
        
        return () => subscriptions.forEach(unsub => unsub());
    }

    async _queryEndpoint(endpoint, pattern, options) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeout || 5000);

        try {
            const response = await fetch(`${endpoint.url}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: pattern.toString() }),
                signal: controller.signal
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            endpoint.healthy = true;
            return await response.json();
        } catch (error) {
            endpoint.healthy = false;
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    _mergeResults(settledResults) {
        const merged = new Map();
        
        for (const result of settledResults) {
            if (result.status === 'fulfilled' && result.value) {
                for (const atom of result.value) {
                    merged.set(atom.toString(), atom);
                }
            }
        }
        
        return Array.from(merged.values());
    }

    getHealthStatus() {
        return this.endpoints.map(e => ({
            url: e.url,
            healthy: e.healthy,
            priority: e.priority
        }));
    }
}
```

##### [NEW] `kernel/ops/DASops.js`:

```javascript
export function registerDASOps(registry, dasConnector) {
    registry.register('das-query', async (pattern) => {
        const results = await dasConnector.query(pattern);
        return registry._listify(results);
    }, { async: true });

    registry.register('das-add', async (atom) => {
        await dasConnector.addAtom(atom);
        return sym('ok');
    }, { async: true });

    registry.register('das-endpoints', () => {
        const status = dasConnector.getHealthStatus();
        return registry._listify(status.map(e => 
            exp(sym('endpoint'), [sym(e.url), sym(e.healthy ? 'healthy' : 'unhealthy')])
        ));
    });

    registry.register('das-add-endpoint', (url, protocol) => {
        dasConnector.addEndpoint(url.name, { protocol: protocol?.name || 'http' });
        return sym('ok');
    });
}
```

**Beyond Hyperon Features:**
- [ ] Federated query across multiple DAS nodes
- [ ] Automatic result merging and deduplication
- [ ] Local caching with configurable TTL
- [ ] Health monitoring and failover
- [ ] Real-time subscriptions via WebSocket
- [ ] Configurable replication

---

### **Phase 12: Enhanced Indexing & Performance**

**Goal:** Achieve order-of-magnitude performance improvements for large rule sets.

##### [MODIFY] `kernel/Space.js`:

```javascript
export class Space {
    constructor() {
        this.atoms = new Set();
        this.rules = [];
        
        // Multi-level indexing for O(1) average lookup
        this.functorIndex = new Map();      // functor -> rules
        this.arityIndex = new Map();         // functor+arity -> rules
        this.signatureIndex = new Map();     // functor+arg1+arg2 -> rules
        
        this._stats = { 
            adds: 0, removes: 0, queries: 0, 
            indexedLookups: 0, fullScans: 0 
        };
    }

    addRule(pattern, result) {
        const rule = { pattern, result };
        this.rules.push(rule);
        this._indexRule(rule);
        return this;
    }

    _indexRule(rule) {
        const pattern = rule.pattern;
        if (!isExpression(pattern)) return;

        const functor = this._getFunctorName(pattern.operator);
        const arity = pattern.components?.length || 0;
        
        // Level 1: Functor index
        if (!this.functorIndex.has(functor)) this.functorIndex.set(functor, []);
        this.functorIndex.get(functor).push(rule);
        
        // Level 2: Functor+Arity index
        const arityKey = `${functor}/${arity}`;
        if (!this.arityIndex.has(arityKey)) this.arityIndex.set(arityKey, []);
        this.arityIndex.get(arityKey).push(rule);
        
        // Level 3: Signature index (first 2 constant args)
        const sigKey = this._getSignatureKey(pattern);
        if (sigKey) {
            if (!this.signatureIndex.has(sigKey)) this.signatureIndex.set(sigKey, []);
            this.signatureIndex.get(sigKey).push(rule);
        }
    }

    _getSignatureKey(pattern) {
        const functor = this._getFunctorName(pattern.operator);
        const args = pattern.components || [];
        
        // Only index if first args are constants (not variables)
        const constArgs = args.slice(0, 2)
            .filter(a => !isVariable(a))
            .map(a => a.name || a.toString());
        
        if (constArgs.length === 0) return null;
        return `${functor}/${constArgs.join('/')}`;
    }

    rulesFor(term) {
        this._stats.indexedLookups++;
        
        if (!isExpression(term)) {
            this._stats.fullScans++;
            return [...this.rules];
        }

        const functor = this._getFunctorName(term.operator);
        const arity = term.components?.length || 0;
        
        // Try most specific index first
        const sigKey = this._getSignatureKey(term);
        if (sigKey && this.signatureIndex.has(sigKey)) {
            return this.signatureIndex.get(sigKey);
        }
        
        // Fall back to arity index
        const arityKey = `${functor}/${arity}`;
        if (this.arityIndex.has(arityKey)) {
            return this.arityIndex.get(arityKey);
        }
        
        // Fall back to functor index
        if (functor && this.functorIndex.has(functor)) {
            return this.functorIndex.get(functor);
        }
        
        // Last resort: full scan
        this._stats.fullScans++;
        return [...this.rules];
    }
}
```

**Performance Improvements:**
- [ ] Multi-level indexing (functor → arity → signature)
- [ ] O(1) average lookup for common patterns
- [ ] Signature index for constant argument matching
- [ ] Statistics tracking for optimization tuning

---

### **Phase 13: Tail Call Optimization**

**Goal:** Eliminate stack overflow for deeply recursive programs.

##### [MODIFY] `kernel/reduction/StepFunctions.js`:

```javascript
// Detect tail-recursive patterns
function isTailPosition(rule) {
    const result = rule.result;
    if (!isExpression(result)) return false;
    
    // Check if result is a direct call to the same functor in tail position
    const ruleFunctor = rule.pattern.operator?.name;
    const resultFunctor = result.operator?.name;
    
    // Direct tail call
    if (ruleFunctor === resultFunctor) return true;
    
    // Tail call via if/case in tail position
    if (['if', 'case', 'switch'].includes(resultFunctor)) {
        // Check if each branch is a tail call
        return result.components.every(branch => 
            !isExpression(branch) || branch.operator?.name === ruleFunctor
        );
    }
    
    return false;
}

// Trampolined reduction for tail calls
export function reduceWithTCO(atom, space, ground, limit, cache) {
    let current = atom;
    let steps = 0;
    
    while (steps < limit) {
        const result = step(current, space, ground, limit, cache);
        
        if (!result.applied) {
            return current;
        }
        
        if (result.tailCall) {
            // Tail call: just update current, don't grow stack
            current = result.reduced;
            steps++;
            continue;
        }
        
        // Non-tail: normal reduction
        current = result.reduced;
        steps++;
    }
    
    throw new Error(`TCO limit exceeded: ${limit} steps`);
}
```

**Features:**
- [ ] Tail call detection
- [ ] Trampolining for tail-recursive rules
- [ ] Works with if/case/switch in tail position
- [ ] Prevents stack overflow for recursive programs

---

### **Phase 14: Neural-Symbolic Bridge** ⭐ BEYOND HYPERON

**Goal:** Enable seamless integration with neural networks and embeddings.

##### [NEW] `extensions/NeuralBridge.js`:

```javascript
/**
 * Neural-Symbolic Bridge
 * Enables MeTTa to call neural networks and use embeddings
 */
export class NeuralBridge {
    constructor(config = {}) {
        this.embeddings = new Map();
        this.models = new Map();
        this.vectorDB = config.vectorDB || new InMemoryVectorDB();
    }

    async loadModel(name, source) {
        // Support ONNX, TensorFlow.js, or remote API
        if (source.endsWith('.onnx')) {
            const ort = await import('onnxruntime-web');
            this.models.set(name, await ort.InferenceSession.create(source));
        } else if (source.startsWith('http')) {
            this.models.set(name, { type: 'api', endpoint: source });
        }
    }

    async embed(text) {
        // Generate embedding for text
        const model = this.models.get('embedding') || await this._loadDefaultEmbedding();
        if (model.type === 'api') {
            const response = await fetch(`${model.endpoint}/embed`, {
                method: 'POST',
                body: JSON.stringify({ text })
            });
            return await response.json();
        }
        // Local model inference
        return await this._runLocalEmbedding(model, text);
    }

    async semanticSearch(query, k = 5) {
        const queryEmbedding = await this.embed(query);
        return this.vectorDB.search(queryEmbedding, k);
    }

    async addToVectorDB(atom, text) {
        const embedding = await this.embed(text || atom.toString());
        this.vectorDB.add(atom, embedding);
    }

    async infer(modelName, input) {
        const model = this.models.get(modelName);
        if (!model) throw new Error(`Model not found: ${modelName}`);
        
        if (model.type === 'api') {
            const response = await fetch(`${model.endpoint}/infer`, {
                method: 'POST',
                body: JSON.stringify({ input })
            });
            return await response.json();
        }
        
        // ONNX inference
        return await this._runONNX(model, input);
    }
}

class InMemoryVectorDB {
    constructor() {
        this.vectors = [];
    }

    add(atom, embedding) {
        this.vectors.push({ atom, embedding });
    }

    search(query, k) {
        return this.vectors
            .map(v => ({ atom: v.atom, score: this._cosineSim(query, v.embedding) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, k);
    }

    _cosineSim(a, b) {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
```

##### [NEW] `kernel/ops/NeuralOps.js`:

```javascript
export function registerNeuralOps(registry, neuralBridge) {
    registry.register('neural-embed', async (text) => {
        const embedding = await neuralBridge.embed(text.name);
        return registry._listify(embedding.map(v => sym(String(v))));
    }, { async: true });

    registry.register('neural-search', async (query, k) => {
        const results = await neuralBridge.semanticSearch(
            query.name, 
            parseInt(k?.name) || 5
        );
        return registry._listify(results.map(r => 
            exp(sym('result'), [r.atom, sym(String(r.score))])
        ));
    }, { async: true });

    registry.register('neural-index', async (atom, text) => {
        await neuralBridge.addToVectorDB(atom, text?.name);
        return sym('ok');
    }, { async: true });

    registry.register('neural-infer', async (modelName, input) => {
        const result = await neuralBridge.infer(modelName.name, input);
        return sym(JSON.stringify(result));
    }, { async: true });

    registry.register('neural-load-model', async (name, source) => {
        await neuralBridge.loadModel(name.name, source.name);
        return sym('ok');
    }, { async: true });
}
```

**Beyond Hyperon Features:**
- [ ] Embedding generation (ONNX, TF.js, or API)
- [ ] Semantic search on atomspace
- [ ] Model loading and inference
- [ ] Vector database for similarity queries
- [ ] Neural-guided rule selection

---

### **Phase 15: Temporal & Causal Reasoning** ⭐ BEYOND HYPERON

**Goal:** First-class support for temporal intervals and causal relationships.

##### [NEW] `extensions/TemporalOps.js`:

```javascript
export function registerTemporalOps(registry, interpreter) {
    // Temporal interval algebra (Allen's Interval Algebra)
    const relations = ['before', 'after', 'meets', 'met-by', 'overlaps', 
                       'overlapped-by', 'starts', 'started-by', 'finishes', 
                       'finished-by', 'during', 'contains', 'equals'];

    // Create temporal interval
    registry.register('interval', (start, end) => {
        const s = parseFloat(start.name);
        const e = parseFloat(end.name);
        if (isNaN(s) || isNaN(e) || s > e) {
            return exp(sym('Error'), [sym('InvalidInterval')]);
        }
        return exp(sym('Interval'), [start, end]);
    });

    // Determine temporal relation between intervals
    registry.register('temporal-relation', (i1, i2) => {
        const [s1, e1] = extractInterval(i1);
        const [s2, e2] = extractInterval(i2);
        
        if (e1 < s2) return sym('before');
        if (e1 === s2) return sym('meets');
        if (s1 < s2 && e1 > s2 && e1 < e2) return sym('overlaps');
        if (s1 === s2 && e1 < e2) return sym('starts');
        if (s1 > s2 && e1 < e2) return sym('during');
        if (s1 === s2 && e1 === e2) return sym('equals');
        // ... other relations
        return sym('unknown');
    });

    // Causal reasoning
    registry.register('causes', (cause, effect, confidence) => {
        const conf = parseFloat(confidence?.name) || 1.0;
        return exp(sym('Causation'), [cause, effect, sym(String(conf))]);
    });

    // Temporal projection: what will be true at time T?
    registry.register('project', (statement, time, space) => {
        // Query for temporal statements valid at given time
        const t = parseFloat(time.name);
        const pattern = exp(sym('holds'), [statement, sym('$start'), sym('$end')]);
        const matches = match(space || interpreter.space, pattern, pattern);
        
        return registry._listify(matches.filter(m => {
            const start = parseFloat(m.components[1].name);
            const end = parseFloat(m.components[2].name);
            return start <= t && t <= end;
        }));
    }, { lazy: true });

    // Persist statement for interval
    registry.register('hold-during', (statement, interval) => {
        const [start, end] = extractInterval(interval);
        interpreter.space.add(
            exp(sym('holds'), [statement, sym(String(start)), sym(String(end))])
        );
        return sym('ok');
    });

    function extractInterval(expr) {
        if (expr.operator?.name !== 'Interval') return [0, 0];
        return [
            parseFloat(expr.components[0].name),
            parseFloat(expr.components[1].name)
        ];
    }
}
```

**Beyond Hyperon Features:**
- [ ] Allen's Interval Algebra (13 temporal relations)
- [ ] Causal relationship representation
- [ ] Temporal projection queries
- [ ] Interval-based truth maintenance

---

### **Phase 16: Probabilistic Programming** ⭐ BEYOND HYPERON

**Goal:** Native probabilistic programming beyond NAL truth values.

##### [NEW] `extensions/ProbabilisticOps.js`:

```javascript
export function registerProbabilisticOps(registry, interpreter) {
    // Distribution constructors
    registry.register('normal', (mean, std) => 
        exp(sym('Distribution'), [sym('normal'), mean, std])
    );

    registry.register('uniform', (low, high) => 
        exp(sym('Distribution'), [sym('uniform'), low, high])
    );

    registry.register('bernoulli', (p) => 
        exp(sym('Distribution'), [sym('bernoulli'), p])
    );

    // Sample from distribution
    registry.register('sample', (dist, n) => {
        const count = parseInt(n?.name) || 1;
        const samples = [];
        
        for (let i = 0; i < count; i++) {
            samples.push(sym(String(sampleFrom(dist))));
        }
        
        return count === 1 ? samples[0] : registry._listify(samples);
    });

    // Bayesian inference
    registry.register('infer-posterior', (prior, likelihood, evidence) => {
        // Compute posterior using importance sampling
        const samples = [];
        const weights = [];
        
        for (let i = 0; i < 1000; i++) {
            const theta = sampleFrom(prior);
            const weight = computeLikelihood(likelihood, theta, evidence);
            samples.push(theta);
            weights.push(weight);
        }
        
        // Normalize weights
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        
        // Resample based on weights
        const resampled = [];
        for (let i = 0; i < 100; i++) {
            let r = Math.random() * totalWeight;
            for (let j = 0; j < samples.length; j++) {
                r -= weights[j];
                if (r <= 0) {
                    resampled.push(samples[j]);
                    break;
                }
            }
        }
        
        return exp(sym('Samples'), resampled.map(s => sym(String(s))));
    }, { lazy: true });

    // Expectation
    registry.register('expectation', (dist, f, n) => {
        const sampleCount = parseInt(n?.name) || 1000;
        let sum = 0;
        
        for (let i = 0; i < sampleCount; i++) {
            const sample = sampleFrom(dist);
            const fResult = interpreter._reduceDeterministic(
                exp(f, [sym(String(sample))])
            );
            sum += parseFloat(fResult.name) || 0;
        }
        
        return sym(String(sum / sampleCount));
    }, { lazy: true });

    function sampleFrom(dist) {
        const type = dist.components[0].name;
        const params = dist.components.slice(1).map(p => parseFloat(p.name));
        
        switch (type) {
            case 'normal':
                return boxMuller(params[0], params[1]);
            case 'uniform':
                return params[0] + Math.random() * (params[1] - params[0]);
            case 'bernoulli':
                return Math.random() < params[0] ? 1 : 0;
            default:
                return 0;
        }
    }

    function boxMuller(mean, std) {
        const u1 = Math.random();
        const u2 = Math.random();
        return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
}
```

**Beyond Hyperon Features:**
- [ ] Distribution constructors (normal, uniform, bernoulli, etc.)
- [ ] Monte Carlo sampling
- [ ] Bayesian posterior inference
- [ ] Expectation computation
- [ ] Integration with NAL truth values

---

### **Phase 17: Visual Debugging IDE** ⭐ BEYOND HYPERON

**Goal:** Rich visual debugging and program visualization.

##### [NEW] `extensions/VisualDebugger.js`:

```javascript
export class VisualDebugger {
    constructor(interpreter) {
        this.interpreter = interpreter;
        this.trace = [];
        this.breakpoints = new Map();
        this.watchers = new Map();
        this.eventHandlers = {
            step: [],
            breakpoint: [],
            watch: [],
            error: []
        };
    }

    // Generate reduction graph for visualization
    generateReductionGraph(atom, maxDepth = 10) {
        const nodes = [];
        const edges = [];
        let nodeId = 0;

        const traverse = (current, depth, parentId = null) => {
            if (depth > maxDepth) return;

            const id = nodeId++;
            nodes.push({
                id,
                label: current.toString().slice(0, 50),
                type: this._getNodeType(current),
                depth
            });

            if (parentId !== null) {
                edges.push({ from: parentId, to: id });
            }

            const result = this.interpreter.step(current);
            if (result.applied && !result.reduced.equals(current)) {
                traverse(result.reduced, depth + 1, id);
            }
        };

        traverse(atom, 0);
        return { nodes, edges };
    }

    // Export for visualization libraries (D3, Cytoscape, etc.)
    exportCytoscape(atom) {
        const { nodes, edges } = this.generateReductionGraph(atom);
        return {
            nodes: nodes.map(n => ({
                data: { id: String(n.id), label: n.label, type: n.type }
            })),
            edges: edges.map(e => ({
                data: { source: String(e.from), target: String(e.to) }
            }))
        };
    }

    // Time-travel debugging
    getStateAt(stepIndex) {
        if (stepIndex < 0 || stepIndex >= this.trace.length) return null;
        return this.trace[stepIndex];
    }

    replayTo(stepIndex) {
        // Reset interpreter state to step
        const state = this.getStateAt(stepIndex);
        if (!state) return null;
        return state.atom;
    }

    _getNodeType(atom) {
        if (!atom) return 'empty';
        if (atom.name?.startsWith('$')) return 'variable';
        if (atom.type === 'compound') return 'expression';
        if (typeof atom.execute === 'function') return 'grounded';
        return 'symbol';
    }
}
```

**Beyond Hyperon Features:**
- [ ] Reduction graph visualization
- [ ] Time-travel debugging (step backwards)
- [ ] Cytoscape/D3 export for web visualization
- [ ] Watch expressions
- [ ] Breakpoint support with pattern matching

---

### **Phase 18: Reactive Spaces & Live Collaboration** ⭐ BEYOND HYPERON

**Goal:** Observable atomspace with real-time collaboration via CRDT.

##### [MODIFY] `extensions/ReactiveSpace.js` (Completed code from earlier):

```javascript
// Already implemented - extends Space with:
// - Observable pattern matching
// - Event logging
// - Observer callbacks for add/remove/query
```

##### [NEW] `extensions/CollaborativeSpace.js`:

```javascript
import { ReactiveSpace } from './ReactiveSpace.js';

/**
 * CRDT-based collaborative atomspace
 * Enables real-time collaboration across multiple clients
 */
export class CollaborativeSpace extends ReactiveSpace {
    constructor(clientId) {
        super();
        this.clientId = clientId;
        this.vectorClock = new Map();
        this.pendingOps = [];
        this.peers = new Map();
    }

    add(atom) {
        const op = this._createOp('add', atom);
        this._applyOp(op);
        this._broadcastOp(op);
        return this;
    }

    remove(atom) {
        const op = this._createOp('remove', atom);
        this._applyOp(op);
        this._broadcastOp(op);
        return this;
    }

    receiveOp(op) {
        // Check causality
        if (this._isCausallyReady(op)) {
            this._applyOp(op);
        } else {
            this.pendingOps.push(op);
        }
        this._processPendingOps();
    }

    connectPeer(peerId, channel) {
        this.peers.set(peerId, channel);
        
        // Send current state
        channel.send({
            type: 'sync',
            atoms: Array.from(this.atoms).map(a => a.toString()),
            clock: Object.fromEntries(this.vectorClock)
        });
    }

    _createOp(type, atom) {
        this._incrementClock();
        return {
            type,
            atom: atom.toString(),
            clientId: this.clientId,
            timestamp: Date.now(),
            vectorClock: Object.fromEntries(this.vectorClock)
        };
    }

    _applyOp(op) {
        // Update vector clock
        for (const [client, time] of Object.entries(op.vectorClock)) {
            const current = this.vectorClock.get(client) || 0;
            this.vectorClock.set(client, Math.max(current, time));
        }

        // Apply operation
        if (op.type === 'add') {
            super.add(this._parseAtom(op.atom));
        } else if (op.type === 'remove') {
            super.remove(this._parseAtom(op.atom));
        }
    }

    _incrementClock() {
        const current = this.vectorClock.get(this.clientId) || 0;
        this.vectorClock.set(this.clientId, current + 1);
    }

    _broadcastOp(op) {
        for (const [peerId, channel] of this.peers) {
            channel.send({ type: 'op', op });
        }
    }

    _isCausallyReady(op) {
        for (const [client, time] of Object.entries(op.vectorClock)) {
            if (client === op.clientId) continue;
            const local = this.vectorClock.get(client) || 0;
            if (local < time) return false;
        }
        return true;
    }
}
```

**Beyond Hyperon Features:**
- [ ] Real-time collaborative editing
- [ ] CRDT-based conflict resolution
- [ ] Vector clock causality
- [ ] Peer-to-peer synchronization
- [ ] Observable pattern matching

---

## 📊 Updated Parity & Beyond Status

| Category | Required | Implemented | Status | Priority |
|----------|----------|-------------|--------|----------|
| **PARITY** | | | | |
| Core Kernel | 8 ops | 8 ops | ✅ Complete | - |
| Expression Ops | 6 ops | 6 ops | ✅ Complete | - |
| Math Functions | 16 ops | 16 ops | ✅ Complete | - |
| Set Operations | 7 ops | 7 ops | ✅ Complete | - |
| HOF Operations | 3+3 ops | 6 ops | ✅ Complete | - |
| Type Operations | 5 ops | 5 ops | ✅ Complete | - |
| Module System | 3 ops | 0 ops | ❌ Phase 8 | High |
| Stateful Atoms | 3 ops | 0 ops | ❌ Phase 9 | High |
| Collapse/Superpose | 2 ops | 1.5 ops | ⚠️ Phase 10 | High |
| **BEYOND HYPERON** | | | | |
| Distributed Atomspace | N/A | 0 ops | ❌ Phase 11 | Medium |
| Enhanced Indexing | N/A | Basic | ⚠️ Phase 12 | Medium |
| Tail Call Optimization | N/A | 0 | ❌ Phase 13 | Medium |
| Neural-Symbolic Bridge | N/A | 0 ops | ❌ Phase 14 | Future |
| Temporal Reasoning | N/A | Stubs | ⚠️ Phase 15 | Future |
| Probabilistic Programming | N/A | 0 ops | ❌ Phase 16 | Future |
| Visual Debugging | N/A | Basic | ⚠️ Phase 17 | Future |
| Collaborative Spaces | N/A | 0 | ❌ Phase 18 | Future |

**Current Progress:**
- ✅ ~95% Hyperon stdlib parity (Phases 1-7 complete)
- ⚠️ Module system and stateful atoms needed for 100% parity
- 🚀 Beyond-Hyperon features planned for competitive advantage

---

## 🎯 Immediate Action Items

### Next Session Priority

1. **Phase 8: Module System** (2-3 days)
   - Implement `ModuleLoader.js`
   - Add `import!`, `include!`, `bind!` operations
   - Add `new-space`, space isolation

2. **Phase 9: Stateful Atoms** (1 day)
   - Implement `StateOps.js`
   - Add `new-state`, `get-state`, `change-state!`

3. **Phase 10: Complete Nondeterminism** (1 day)
   - Rename `collapse-bind` → `collapse`
   - Verify `superpose` semantics match Hyperon

### Stretch Goals

4. **Phase 12: Enhanced Indexing** - 10-100x performance improvement
5. **Phase 11: DAS Connector** - Distributed knowledge federation

---

## 📊 Success Criteria

**Parity Achievement:**
- ✅ 51/51 Hyperon stdlib operations implemented
- ⚠️ Module system needed for complete parity
- ⚠️ Stateful atoms needed for complete parity

**Beyond Hyperon:**
- Neural-symbolic bridge operational
- DAS connector with federated queries
- Temporal and probabilistic reasoning
- Real-time collaborative editing

**Performance:**
- Indexed matching 10-100x faster for large rule sets
- TCO eliminates stack overflow for recursive programs
- Parallel evaluation utilizes all CPU cores
