/**
 * MeTTa Performance Configuration
 * All optimizations are optional and toggleable for A/B testing
 */

export const METTA_CONFIG = {
    // === Tier 1: Quick Wins (default ON) ===
    interning: true,           // Symbol interning via TermFactory
    fastPaths: true,           // Monomorphic type guards
    stableShapes: true,        // Pre-allocate all properties

    // === Tier 2: Low-Hanging Fruit (default ON) ===
    indexing: true,            // Multi-level rule indexing
    caching: true,             // Reduction result caching
    pooling: true,             // Object pooling for GC reduction
    compiledRules: true,       // Rete-like rule network
    bloomFilter: false,        // Fast negative lookups
    tco: true,                 // Tail call optimization

    // === Tier 3: Advanced (default OFF) ===
    wasm: false,               // WebAssembly kernels
    parallel: false,           // Web Worker parallelism
    simd: false,               // SIMD batch operations
    zipper: false,             // Zipper-based encoding
    jit: true,                 // enable JIT compilation

    // === MORK-Parity Additions ===
    zipperThreshold: 8,        // depth at which Zipper replaces recursive traversal
    pathTrie: false,           // enable PathTrie rule index
    jitThreshold: 50,          // calls before compiling
    il: false,                 // enable MeTTa-IL compilation
    tensor: true,              // enable NeuralBridge tensor grounded ops
    smt: false,                // enable SMT constraint solver
    smtVarThreshold: 5,        // min unification vars to trigger SMT
    parallelThreshold: 200,    // min superpose width to trigger Workers
    persist: false,            // enable PersistentSpace checkpointing
    persistThreshold: 50000,   // atoms before checkpoint

    // === Profiling & Debugging (default OFF) ===
    profiling: false,          // V8 profiler integration
    tracing: false,            // Execution tracer
    debugging: false,          // Interactive debugger

    // === Limits ===
    maxCacheSize: 5000,        // Max cached reductions
    maxInternedSymbols: 10000, // Max interned symbols (LRU eviction)
    maxPoolSize: 1000,         // Max pooled objects per pool
    maxCompiledRules: 100,     // Max JIT-compiled rules
    bloomFilterSize: 10000,    // Bloom filter bit array size
};

/**
 * Get config with environment overrides
 */
export function getConfig() {
    // Check for environment overrides
    if (typeof process !== 'undefined' && process.env) {
        if (process.env.METTA_WASM) METTA_CONFIG.wasm = true;
        if (process.env.METTA_PARALLEL) METTA_CONFIG.parallel = true;
        if (process.env.METTA_PROFILE) METTA_CONFIG.profiling = true;
        if (process.env.METTA_TRACE) METTA_CONFIG.tracing = true;
        if (process.env.METTA_DEBUG) METTA_CONFIG.debugging = true;
        if (process.env.METTA_NO_CACHE) METTA_CONFIG.caching = false;
        if (process.env.METTA_NO_INDEX) METTA_CONFIG.indexing = false;
        if (process.env.METTA_NO_INTERN) METTA_CONFIG.interning = false;
        if (process.env.METTA_JIT) METTA_CONFIG.jit = true;
        if (process.env.METTA_IL) METTA_CONFIG.il = true;
        if (process.env.METTA_TENSOR) METTA_CONFIG.tensor = true;
        if (process.env.METTA_SMT) METTA_CONFIG.smt = true;
        if (process.env.METTA_PERSIST) METTA_CONFIG.persist = true;
    }

    // Check for browser URL overrides
    if (typeof window !== 'undefined' && window.location) {
        const params = new URLSearchParams(window.location.search);
        if (params.get('metta_profile')) METTA_CONFIG.profiling = true;
        if (params.get('metta_trace')) METTA_CONFIG.tracing = true;
        if (params.get('metta_debug')) METTA_CONFIG.debugging = true;
        if (params.get('metta_jit')) METTA_CONFIG.jit = true;
        if (params.get('metta_il')) METTA_CONFIG.il = true;
        if (params.get('metta_tensor')) METTA_CONFIG.tensor = true;
        if (params.get('metta_smt')) METTA_CONFIG.smt = true;
        if (params.get('metta_persist')) METTA_CONFIG.persist = true;
        if (params.get('metta_baseline')) {
            // Disable all optimizations for baseline comparison
            METTA_CONFIG.interning = false;
            METTA_CONFIG.fastPaths = false;
            METTA_CONFIG.indexing = false;
            METTA_CONFIG.caching = false;
            METTA_CONFIG.pooling = false;
        }
    }

    return METTA_CONFIG;
}

/**
 * Compare optimized vs baseline performance
 */
export async function runComparison(code) {
    const baseline = { ...METTA_CONFIG };

    // Run with all optimizations OFF
    Object.keys(METTA_CONFIG).forEach(k => {
        if (typeof METTA_CONFIG[k] === 'boolean') METTA_CONFIG[k] = false;
    });

    const startBaseline = performance.now();
    await code();
    const baselineTime = performance.now() - startBaseline;

    // Restore and run with optimizations ON
    Object.assign(METTA_CONFIG, baseline);

    const startOptimized = performance.now();
    await code();
    const optimizedTime = performance.now() - startOptimized;

    return {
        baseline: baselineTime.toFixed(2) + 'ms',
        optimized: optimizedTime.toFixed(2) + 'ms',
        speedup: (baselineTime / optimizedTime).toFixed(2) + 'x'
    };
}

// Initialize config on load
getConfig();
