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
    jit: false,                // JIT rule compilation (EXPERIMENTAL)

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
    }

    // Check for browser URL overrides
    if (typeof window !== 'undefined' && window.location) {
        const params = new URLSearchParams(window.location.search);
        if (params.get('metta_profile')) METTA_CONFIG.profiling = true;
        if (params.get('metta_trace')) METTA_CONFIG.tracing = true;
        if (params.get('metta_debug')) METTA_CONFIG.debugging = true;
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

// Initialize config on load
getConfig();
