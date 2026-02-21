/**
 * Functional Utilities for Neuro-Symbolic RL
 * Higher-order functions, combinators, and functional abstractions.
 */

/**
 * Function composition: (f ∘ g)(x) = f(g(x))
 */
export const compose = (...fns) => 
    fns.reduce((f, g) => (...args) => f(g(...args)), x => x);

/**
 * Function piping: pipe(x, f, g) = g(f(x))
 */
export const pipe = (value, ...fns) => 
    fns.reduce((v, f) => f(v), value);

/**
 * Curry a function
 */
export const curry = (fn, arity = fn.length) => {
    const curried = (...args) => 
        args.length >= arity ? fn(...args) : (...more) => curried(...args, ...more);
    return curried;
};

/**
 * Partial application
 */
export const partial = (fn, ...bound) => (...rest) => fn(...bound, ...rest);

/**
 * Memoize pure functions
 */
export const memoize = (fn, cache = new Map()) => (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
};

/**
 * Lazy evaluation wrapper
 */
export class Lazy {
    constructor(fn) {
        this._fn = fn;
        this._value = null;
        this._evaluated = false;
    }

    get value() {
        if (!this._evaluated) {
            this._value = this._fn();
            this._evaluated = true;
        }
        return this._value;
    }

    map(fn) {
        return new Lazy(() => fn(this.value));
    }

    filter(predicate) {
        return new Lazy(() => predicate(this.value) ? this.value : null);
    }

    static of(value) {
        return new Lazy(() => value);
    }

    static sequence(lazies) {
        return new Lazy(() => lazies.map(l => l.value));
    }
}

/**
 * Monadic Maybe for null-safe operations
 */
export class Maybe {
    constructor(value) {
        this._value = value;
    }

    static of(value) {
        return new Maybe(value);
    }

    static fromNullable(value) {
        return value == null ? Maybe.nothing() : Maybe.of(value);
    }

    static nothing() {
        return new Maybe(null);
    }

    map(fn) {
        return this._value == null ? this : Maybe.of(fn(this._value));
    }

    flatMap(fn) {
        return this._value == null ? this : fn(this._value);
    }

    filter(predicate) {
        return this._value != null && predicate(this._value) ? this : Maybe.nothing();
    }

    getOrElse(defaultValue) {
        return this._value ?? defaultValue;
    }

    getOrThrow(error = new Error('Value is null')) {
        if (this._value == null) throw error;
        return this._value;
    }

    isPresent() {
        return this._value != null;
    }

    forEach(fn) {
        if (this._value != null) fn(this._value);
        return this;
    }
}

/**
 * Either for error handling
 */
export class Either {
    constructor(value, isError = false) {
        this._value = value;
        this._isError = isError;
    }

    static of(value) {
        return new Either(value, false);
    }

    static left(value) {
        return new Either(value, true);
    }

    static right(value) {
        return new Either(value, false);
    }

    static try(fn) {
        try {
            return Either.right(fn());
        } catch (e) {
            return Either.left(e);
        }
    }

    map(fn) {
        return this._isError ? this : Either.of(fn(this._value));
    }

    mapLeft(fn) {
        return this._isError ? Either.left(fn(this._value)) : this;
    }

    flatMap(fn) {
        return this._isError ? this : fn(this._value);
    }

    getOrElse(defaultValue) {
        return this._isError ? defaultValue : this._value;
    }

    getOrThrow() {
        if (this._isError) throw this._value;
        return this._value;
    }

    isRight() {
        return !this._isError;
    }

    isLeft() {
        return this._isError;
    }

    forEach(fn) {
        if (!this._isError) fn(this._value);
        return this;
    }
}

/**
 * Stream for lazy sequence processing
 */
export class Stream {
    constructor(iterator) {
        this._iterator = iterator;
    }

    static from(iterable) {
        return new Stream(iterable[Symbol.iterator]());
    }

    static range(start, end, step = 1) {
        return new Stream((function*() {
            for (let i = start; i < end; i += step) yield i;
        })());
    }

    static repeat(value, count = Infinity) {
        return new Stream((function*() {
            for (let i = 0; i < count; i++) yield value;
        })());
    }

    map(fn) {
        const self = this;
        return new Stream((function*() {
            for (const item of self._iterator) yield fn(item);
        })());
    }

    filter(predicate) {
        const self = this;
        return new Stream((function*() {
            for (const item of self._iterator) {
                if (predicate(item)) yield item;
            }
        })());
    }

    flatMap(fn) {
        const self = this;
        return new Stream((function*() {
            for (const item of self._iterator) {
                yield* fn(item);
            }
        })());
    }

    take(n) {
        const self = this;
        return new Stream((function*() {
            let count = 0;
            for (const item of self._iterator) {
                if (count++ >= n) break;
                yield item;
            }
        })());
    }

    drop(n) {
        const self = this;
        return new Stream((function*() {
            let count = 0;
            for (const item of self._iterator) {
                if (count++ >= n) yield item;
            }
        })());
    }

    reduce(fn, initial) {
        let acc = initial;
        for (const item of this._iterator) {
            acc = fn(acc, item);
        }
        return acc;
    }

    collect() {
        return Array.from(this._iterator);
    }

    forEach(fn) {
        for (const item of this._iterator) fn(item);
        return this;
    }

    find(predicate) {
        for (const item of this._iterator) {
            if (predicate(item)) return Maybe.of(item);
        }
        return Maybe.nothing();
    }

    every(predicate) {
        for (const item of this._iterator) {
            if (!predicate(item)) return false;
        }
        return true;
    }

    some(predicate) {
        for (const item of this._iterator) {
            if (predicate(item)) return true;
        }
        return false;
    }

    concat(other) {
        const self = this;
        return new Stream((function*() {
            yield* self._iterator;
            yield* other._iterator;
        })());
    }

    [Symbol.iterator]() {
        return this._iterator;
    }
}

/**
 * Lens for immutable data access
 */
export class Lens {
    constructor(get, set) {
        this._get = get;
        this._set = set;
    }

    static prop(key) {
        return new Lens(
            obj => obj?.[key],
            (obj, value) => ({ ...obj, [key]: value })
        );
    }

    static path(path) {
        return path.reduce(
            (acc, key) => acc.compose(Lens.prop(key)),
            new Lens(x => x, (x, v) => v)
        );
    }

    get(obj) {
        return this._get(obj);
    }

    set(value, obj) {
        return this._set(obj, value);
    }

    modify(fn, obj) {
        return this._set(obj, fn(this._get(obj)));
    }

    compose(other) {
        return new Lens(
            obj => other.get(this.get(obj)),
            (obj, value) => this.set(other.set(value, this.get(obj)), obj)
        );
    }
}

/**
 * State monad for stateful computations
 */
export class State {
    constructor(runState) {
        this._runState = runState;
    }

    static of(value) {
        return new State(state => [value, state]);
    }

    static get() {
        return new State(state => [state, state]);
    }

    static put(state) {
        return new State(() => [undefined, state]);
    }

    static modify(fn) {
        return new State(state => [undefined, fn(state)]);
    }

    run(initialState) {
        return this._runState(initialState);
    }

    map(fn) {
        return new State(state => {
            const [value, newState] = this._runState(state);
            return [fn(value), newState];
        });
    }

    flatMap(fn) {
        return new State(state => {
            const [value, newState] = this._runState(state);
            return fn(value)._runState(newState);
        });
    }

    exec(initialState) {
        return this.run(initialState)[1];
    }

    eval(initialState) {
        return this.run(initialState)[0];
    }
}

/**
 * Reader monad for dependency injection
 */
export class Reader {
    constructor(runReader) {
        this._runReader = runReader;
    }

    static of(value) {
        return new Reader(() => value);
    }

    static ask() {
        return new Reader(env => env);
    }

    run(env) {
        return this._runReader(env);
    }

    map(fn) {
        return new Reader(env => fn(this._runReader(env)));
    }

    flatMap(fn) {
        return new Reader(env => fn(this._runReader(env)).run(env));
    }
}

/**
 * Kleisli composition for monadic functions
 */
export const kleisli = (f, g) => x => f(x).flatMap(g);

/**
 * Transduce: transformer-based reduction
 */
export const transduce = (transformer, reducer, initial, collection) => {
    const transducedReducer = transformer(reducer);
    let result = initial;
    for (const item of collection) {
        result = transducedReducer(result, item);
    }
    return result;
};

/**
 * Create a transformer
 */
export const transformer = (mapFn, filterFn) => reducer => (acc, item) => {
    if (filterFn && !filterFn(item)) return acc;
    return reducer(acc, mapFn ? mapFn(item) : item);
};

/**
 * Lift a function to work with applicatives
 */
export const liftA2 = (f, a1, a2) => a1.flatMap(x => a2.map(y => f(x, y)));

/**
 * Sequence applicatives
 */
export const sequenceA = (applicatives, ApplicativeClass) => 
    applicatives.reduce(
        (acc, app) => liftA2((xs, x) => [...xs, x], acc, app),
        ApplicativeClass.of([])
    );

/**
 * Traverse: map + sequence
 */
export const traverse = (fn, collection, ApplicativeClass) => 
    sequenceA(collection.map(fn), ApplicativeClass);

/**
 * Fold: catamorphism for recursive structures
 */
export const fold = (algebra, structure) => {
    if (Array.isArray(structure)) {
        return algebra.array(structure.map(s => fold(algebra, s)));
    }
    if (typeof structure === 'object' && structure !== null) {
        return algebra.object(Object.fromEntries(
            Object.entries(structure).map(([k, v]) => [k, fold(algebra, v)])
        ));
    }
    return algebra.leaf(structure);
};

/**
 * Unfold: anamorphism for generating structures
 */
export const unfold = (coalgebra, seed) => {
    const result = coalgebra(seed);
    if (result.done) return result.value;
    return [result.value, ...result.rest.map(r => unfold(coalgebra, r))];
};

/**
 * Zip two collections
 */
export const zip = (as, bs) => 
    Stream.from(as)
        .take(Math.min(as.length, bs.length))
        .map((a, i) => [a, bs[i]])
        .collect();

/**
 * Zip with function
 */
export const zipWith = (fn, as, bs) => zip(as, bs).map(([a, b]) => fn(a, b));

/**
 * Group by key function
 */
export const groupBy = (fn, collection) => 
    collection.reduce((acc, item) => {
        const key = fn(item);
        if (!acc.has(key)) acc.set(key, []);
        acc.get(key).push(item);
        return acc;
    }, new Map());

/**
 * Partition by predicate
 */
export const partition = (predicate, collection) => 
    collection.reduce(
        ([truthy, falsy], item) => 
            predicate(item) ? [[...truthy, item], falsy] : [truthy, [...falsy, item]],
        [[], []]
    );

/**
 * Deep clone with functional immutability
 */
export const clone = (obj, seen = new WeakMap()) => {
    if (obj == null || typeof obj !== 'object') return obj;
    if (seen.has(obj)) return seen.get(obj);
    
    if (Array.isArray(obj)) {
        const copy = obj.map(item => clone(item, seen));
        seen.set(obj, copy);
        return copy;
    }
    
    if (obj instanceof Map) {
        const copy = new Map([...obj].map(([k, v]) => [k, clone(v, seen)]));
        seen.set(obj, copy);
        return copy;
    }
    
    if (obj instanceof Set) {
        const copy = new Set([...obj].map(v => clone(v, seen)));
        seen.set(obj, copy);
        return copy;
    }
    
    const copy = Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, clone(v, seen)])
    );
    seen.set(obj, copy);
    return copy;
};

/**
 * Deep merge with functional immutability
 */
export const merge = (target, source) => {
    if (source == null) return target;
    if (target == null) return source;
    
    if (Array.isArray(target) && Array.isArray(source)) {
        return [...target, ...source];
    }
    
    if (typeof target === 'object' && typeof source === 'object') {
        return { ...target, ...source };
    }
    
    return source;
};

/**
 * Update nested path immutably
 */
export const setPath = (obj, path, value) => {
    const [head, ...tail] = path;
    if (tail.length === 0) {
        return Array.isArray(obj) 
            ? [...obj.slice(0, head), value, ...obj.slice(head + 1)]
            : { ...obj, [head]: value };
    }
    return Array.isArray(obj)
        ? [...obj.slice(0, head), setPath(obj[head], tail, value), ...obj.slice(head + 1)]
        : { ...obj, [head]: setPath(obj[head], tail, value) };
};

/**
 * Get nested path safely
 */
export const getPath = (obj, path, defaultValue) => {
    const result = path.reduce((acc, key) => acc?.[key], obj);
    return result ?? defaultValue;
};
