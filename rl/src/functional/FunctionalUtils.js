export const compose = (...fns) => fns.reduce((f, g) => (...args) => f(g(...args)), x => x);
export const pipe = (value, ...fns) => fns.reduce((v, f) => f(v), value);

export const curry = (fn, arity = fn.length) => {
    const curried = (...args) => args.length >= arity ? fn(...args) : (...more) => curried(...args, ...more);
    return curried;
};

export const partial = (fn, ...bound) => (...rest) => fn(...bound, ...rest);

export const memoize = (fn, cache = new Map()) => (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
};

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

    map(fn) { return new Lazy(() => fn(this.value)); }
    filter(predicate) { return new Lazy(() => predicate(this.value) ? this.value : null); }
    static of(value) { return new Lazy(() => value); }
    static sequence(lazies) { return new Lazy(() => lazies.map(l => l.value)); }
}

export class Maybe {
    constructor(value) { this._value = value; }

    static of(value) { return new Maybe(value); }
    static fromNullable(value) { return value == null ? Maybe.nothing() : Maybe.of(value); }
    static nothing() { return new Maybe(null); }

    map(fn) { return this._value == null ? this : Maybe.of(fn(this._value)); }
    flatMap(fn) { return this._value == null ? this : fn(this._value); }
    filter(predicate) { return this._value != null && predicate(this._value) ? this : Maybe.nothing(); }
    getOrElse(defaultValue) { return this._value ?? defaultValue; }
    orElse(alternative) { return this._value != null ? this : alternative; }

    isPresent() { return this._value != null; }
    isEmpty() { return this._value == null; }

    toJSON() { return this._value; }
}

export class Either {
    constructor(value, isRight = true) {
        this._value = value;
        this._isRight = isRight;
    }

    static right(value) { return new Either(value, true); }
    static left(value) { return new Either(value, false); }
    static of(value) { return Either.right(value); }
    static try(fn) { try { return Either.right(fn()); } catch (e) { return Either.left(e); } }

    map(fn) { return this._isRight ? Either.right(fn(this._value)) : this; }
    mapLeft(fn) { return this._isRight ? this : Either.left(fn(this._value)); }
    flatMap(fn) { return this._isRight ? fn(this._value) : this; }

    getOrElse(defaultValue) { return this._isRight ? this._value : defaultValue; }
    getLeft() { return this._isRight ? null : this._value; }
    getRight() { return this._isRight ? this._value : null; }

    isRight() { return this._isRight; }
    isLeft() { return !this._isRight; }

    fold(onLeft, onRight) { return this._isRight ? onRight(this._value) : onLeft(this._value); }

    toJSON() { return { right: this._isRight, value: this._value }; }
}

export class Result {
    constructor(value, error = null) {
        this._value = value;
        this._error = error;
    }

    static ok(value) { return new Result(value, null); }
    static err(error) { return new Result(null, error); }

    map(fn) { return this._error ? this : Result.ok(fn(this._value)); }
    mapError(fn) { return this._error ? Result.err(fn(this._error)) : this; }

    andThen(fn) { return this._error ? this : fn(this._value); }
    getOrElse(defaultValue) { return this._error ? defaultValue : this._value; }

    isSuccess() { return !this._error; }
    isError() { return !!this._error; }

    toJSON() { return { success: !this._error, value: this._value, error: this._error }; }
}

export class Stream {
    constructor(iterator) { this._iterator = iterator; }

    static from(iterable) { return new Stream(iterable[Symbol.iterator]()); }
    static empty() { return new Stream((function*() {})()); }
    static of(...values) { return new Stream((function*() { yield* values; })()); }
    static range(start, end) {
        return new Stream((function*() { for(let i=start; i<end; i++) yield i; })());
    }

    filter(predicate) {
        const self = this;
        return new Stream((function*() { for (const v of self._iterator) if (predicate(v)) yield v; })());
    }

    map(fn) {
        const self = this;
        return new Stream((function*() { for (const v of self._iterator) yield fn(v); })());
    }

    flatMap(fn) {
        const self = this;
        return new Stream((function*() { for (const v of self._iterator) yield* fn(v); })());
    }

    take(n) {
        const self = this;
        return new Stream((function*() {
            let count = 0;
            for (const v of self._iterator) { if (count++ >= n) break; yield v; }
        })());
    }

    drop(n) {
        const self = this;
        return new Stream((function*() {
            let count = 0;
            for (const v of self._iterator) { if (count++ >= n) yield v; }
        })());
    }

    takeWhile(predicate) {
        const self = this;
        return new Stream((function*() {
            for (const v of self._iterator) { if (!predicate(v)) break; yield v; }
        })());
    }

    sortBy(comparator) {
        const items = this.collect();
        items.sort(comparator);
        return Stream.from(items);
    }

    reduce(fn, initial) {
        let acc = initial;
        for (const v of this._iterator) acc = fn(acc, v);
        return acc;
    }

    forEach(fn) { for (const v of this._iterator) fn(v); return this; }

    collect() { return Array.from(this._iterator); }

    find(predicate) {
        for (const v of this._iterator) if (predicate(v)) return Maybe.of(v);
        return Maybe.nothing();
    }

    every(predicate) {
        for (const v of this._iterator) if (!predicate(v)) return false;
        return true;
    }

    some(predicate) {
        for (const v of this._iterator) if (predicate(v)) return true;
        return false;
    }

    [Symbol.iterator]() { return this._iterator; }
}

export class State {
    constructor(run) { this.run = run; }
    static of(value) { return new State(s => [value, s]); }
    static get() { return new State(s => [s, s]); }
    static put(newState) { return new State(_ => [undefined, newState]); }
    static modify(fn) { return new State(s => [undefined, fn(s)]); }

    flatMap(fn) {
        return new State(s => {
            const [val, newState] = this.run(s);
            return fn(val).run(newState);
        });
    }
    map(fn) {
        return new State(s => {
            const [val, newState] = this.run(s);
            return [fn(val), newState];
        });
    }
}

export class Reader {
    constructor(run) { this.run = run; }
    static of(value) { return new Reader(_ => value); }
    static ask() { return new Reader(env => env); }

    flatMap(fn) {
        return new Reader(env => fn(this.run(env)).run(env));
    }
    map(fn) {
        return new Reader(env => fn(this.run(env)));
    }
}

export const Lens = {
    prop: (key) => ({
        get: obj => obj?.[key],
        set: (val, obj) => ({ ...obj, [key]: val }),
        modify: (fn, obj) => ({ ...obj, [key]: fn(obj?.[key]) })
    }),
    path: (path) => ({
        get: obj => path.reduce((o, k) => o?.[k], obj),
        set: (val, obj) => {
            const result = { ...obj };
            let current = result;
            for (let i = 0; i < path.length - 1; i++) {
                const k = path[i];
                current[k] = { ...current[k] };
                current = current[k];
            }
            current[path[path.length - 1]] = val;
            return result;
        },
        modify: (fn, obj) => {
            const get = path.reduce((o, k) => o?.[k], obj);
            const val = fn(get);
            // Re-use set logic
            const result = { ...obj };
            let current = result;
            for (let i = 0; i < path.length - 1; i++) {
                const k = path[i];
                current[k] = { ...current[k] };
                current = current[k];
            }
            current[path[path.length - 1]] = val;
            return result;
        }
    })
};

export const identity = x => x;
export const constant = x => () => x;
export const tap = fn => x => { fn(x); return x; };
export const not = fn => x => !fn(x);
export const and = (f, g) => x => f(x) && g(x);
export const or = (f, g) => x => f(x) || g(x);

export const prop = key => obj => obj?.[key];
export const propEq = (key, value) => obj => obj?.[key] === value;
export const propSatisfies = (pred, key) => obj => pred(obj?.[key]);

export const pick = keys => obj => Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));
export const omit = keys => obj => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

export const groupBy = (fn, arr) => arr.reduce((acc, v) => {
    const key = fn(v);
    if (!acc[key]) acc[key] = [];
    acc[key].push(v);
    return acc;
}, {});

export const partition = (fn, arr) => arr.reduce((acc, v) => {
    acc[fn(v) ? 0 : 1].push(v);
    return acc;
}, [[], []]);

export const unique = arr => [...new Set(arr)];
export const flatten = arr => arr.reduce((acc, v) => acc.concat(Array.isArray(v) ? flatten(v) : v), []);
export const zip = (a, b) => a.map((v, i) => [v, b[i]]);
export const range = (start, end) => Array.from({ length: end - start }, (_, i) => start + i);
