/**
 * State Utilities
 * Unified utilities for state hashing, similarity, and manipulation.
 * Deeply deduplicated from 4+ occurrences across the codebase.
 */

/**
 * Hash state to string key
 */
export const hashState = (state, precision = 10) => {
    if (state == null) return 'null';
    
    if (Array.isArray(state)) {
        return state.map(x => Math.round(x * precision)).join('_');
    }
    
    if (state?.data) {
        return Array.from(state.data).map(x => Math.round(x * precision)).join('_');
    }
    
    if (typeof state === 'object') {
        return Object.entries(state)
            .sort()
            .map(([k, v]) => `${k}:${hashState(v, precision)}`)
            .join('|');
    }
    
    return String(state);
};

/**
 * Compute state similarity (cosine)
 */
export const stateSimilarity = (s1, s2) => {
    const a1 = toArray(s1);
    const a2 = toArray(s2);
    
    let dot = 0, norm1 = 0, norm2 = 0;
    const len = Math.min(a1.length, a2.length);
    
    for (let i = 0; i < len; i++) {
        dot += a1[i] * a2[i];
        norm1 += a1[i] * a1[i];
        norm2 += a2[i] * a2[i];
    }
    
    return dot / (Math.sqrt(norm1) * Math.sqrt(norm2) || 1);
};

/**
 * Compute state distance (Euclidean)
 */
export const stateDistance = (s1, s2, metric = 'euclidean') => {
    const a1 = toArray(s1);
    const a2 = toArray(s2);
    const len = Math.min(a1.length, a2.length);
    
    switch (metric) {
        case 'euclidean': {
            let sum = 0;
            for (let i = 0; i < len; i++) {
                const diff = a1[i] - a2[i];
                sum += diff * diff;
            }
            return Math.sqrt(sum);
        }
        
        case 'manhattan': {
            let sum = 0;
            for (let i = 0; i < len; i++) {
                sum += Math.abs(a1[i] - a2[i]);
            }
            return sum;
        }
        
        case 'chebyshev': {
            let max = 0;
            for (let i = 0; i < len; i++) {
                max = Math.max(max, Math.abs(a1[i] - a2[i]));
            }
            return max;
        }
        
        default:
            return stateSimilarity(s1, s2);
    }
};

/**
 * Normalize state to [0, 1] range
 */
export const normalizeState = (state, minMax = null) => {
    const arr = toArray(state);
    
    if (!minMax) {
        minMax = {
            min: Math.min(...arr),
            max: Math.max(...arr)
        };
    }
    
    const range = minMax.max - minMax.min || 1;
    return arr.map(v => (v - minMax.min) / range);
};

/**
 * Discretize state into bins
 */
export const discretizeState = (state, bins = 10, minMax = null) => {
    const normalized = normalizeState(state, minMax);
    return normalized.map(v => Math.floor(v * bins));
};

/**
 * Stack states (for frame stacking)
 */
export const stackStates = (states, axis = 0) => {
    if (!states || states.length === 0) return [];
    
    const first = toArray(states[0]);
    const stacked = [];
    
    for (let i = 0; i < first.length; i++) {
        stacked.push(states.map(s => toArray(s)[i]));
    }
    
    return axis === 0 ? stacked.flat() : stacked;
};

/**
 * Interpolate between states
 */
export const interpolateStates = (s1, s2, alpha = 0.5) => {
    const a1 = toArray(s1);
    const a2 = toArray(s2);
    
    return a1.map((v, i) => v * (1 - alpha) + (a2[i] ?? v) * alpha);
};

/**
 * Perturb state with noise
 */
export const perturbState = (state, noiseScale = 0.1, noiseType = 'gaussian') => {
    const arr = toArray(state);
    
    return arr.map(v => {
        let noise;
        
        if (noiseType === 'uniform') {
            noise = (Math.random() - 0.5) * 2 * noiseScale;
        } else if (noiseType === 'ou') {
            // Ornstein-Uhlenbeck-like
            noise = (Math.random() - 0.5) * noiseScale;
        } else {
            // Gaussian (Box-Muller)
            const u1 = Math.random();
            const u2 = Math.random();
            noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * noiseScale;
        }
        
        return v + noise;
    });
};

/**
 * Convert various state representations to array
 */
export const toArray = (state) => {
    if (state == null) return [];
    if (Array.isArray(state)) return [...state];
    if (state?.data) return Array.from(state.data);
    if (typeof state === 'object') {
        return Object.values(state).flatMap(v => toArray(v));
    }
    return [state];
};

/**
 * State comparison utilities
 */
export const StateComparison = {
    /**
     * Check if states are approximately equal
     */
    approxEqual: (s1, s2, tolerance = 1e-6) => {
        const a1 = toArray(s1);
        const a2 = toArray(s2);
        
        if (a1.length !== a2.length) return false;
        
        return a1.every((v, i) => Math.abs(v - a2[i]) < tolerance);
    },

    /**
     * Check if state is within bounds
     */
    withinBounds: (state, low, high) => {
        const arr = toArray(state);
        const lowArr = Array.isArray(low) ? low : new Array(arr.length).fill(low);
        const highArr = Array.isArray(high) ? high : new Array(arr.length).fill(high);
        
        return arr.every((v, i) => v >= lowArr[i] && v <= highArr[i]);
    },

    /**
     * Find nearest state in collection
     */
    findNearest: (state, states, metric = 'euclidean') => {
        if (!states || states.length === 0) return null;
        
        let nearest = null;
        let minDist = Infinity;
        
        for (const s of states) {
            const dist = stateDistance(state, s, metric);
            if (dist < minDist) {
                minDist = dist;
                nearest = s;
            }
        }
        
        return { state: nearest, distance: minDist };
    }
};

/**
 * State transformation utilities
 */
export const StateTransform = {
    /**
     * Apply affine transformation
     */
    affine: (state, scale = 1, offset = 0) => {
        const arr = toArray(state);
        return arr.map(v => v * scale + offset);
    },

    /**
     * Apply element-wise operation
     */
    map: (state, fn) => {
        const arr = toArray(state);
        return arr.map(fn);
    },

    /**
     * Reduce state to single value
     */
    reduce: (state, fn, initial) => {
        const arr = toArray(state);
        return arr.reduce(fn, initial);
    },

    /**
     * Filter state elements
     */
    filter: (state, predicate) => {
        const arr = toArray(state);
        return arr.filter(predicate);
    },

    /**
     * Slice state
     */
    slice: (state, start, end) => {
        const arr = toArray(state);
        return arr.slice(start, end);
    }
};

/**
 * State utilities namespace
 */
export const StateUtils = {
    hashState,
    stateSimilarity,
    stateDistance,
    normalizeState,
    discretizeState,
    stackStates,
    interpolateStates,
    perturbState,
    toArray,
    ...StateComparison,
    ...StateTransform
};

export default StateUtils;
