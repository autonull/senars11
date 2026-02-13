import {TRUTH} from './config/constants.js';
import {clamp} from './util/common.js';

export class Truth {
    /**
     * Immutable Truth value representation.
     * All instances are frozen upon creation.
     */
    constructor(frequency = TRUTH.DEFAULT_FREQUENCY, confidence = TRUTH.DEFAULT_CONFIDENCE) {
        this._frequency = clamp(isNaN(frequency) ? TRUTH.DEFAULT_FREQUENCY : frequency, 0, 1);
        this._confidence = clamp(isNaN(confidence) ? TRUTH.DEFAULT_CONFIDENCE : confidence, 0, 1);
        Object.freeze(this);
    }

    static get TRUE() {
        return Truth._TRUE || (Truth._TRUE = new Truth(1.0, TRUTH.DEFAULT_CONFIDENCE));
    }

    static get FALSE() {
        return Truth._FALSE || (Truth._FALSE = new Truth(0.0, TRUTH.DEFAULT_CONFIDENCE));
    }

    static get NEUTRAL() {
        return Truth._NEUTRAL || (Truth._NEUTRAL = new Truth(0.5, TRUTH.DEFAULT_CONFIDENCE));
    }

    get frequency() {
        return this._frequency;
    }

    get confidence() {
        return this._confidence;
    }

    get f() {
        return this._frequency;
    }

    get c() {
        return this._confidence;
    }

    /**
     * Safely execute binary operations between two Truth objects
     * @param {Truth} truth1 - First truth object
     * @param {Truth} truth2 - Second truth object
     * @param {Function} operation - Binary operation to perform
     * @returns {Truth|null} - Result of operation or null if inputs invalid
     */
    static binaryOperation(truth1, truth2, operation) {
        return truth1 && truth2 ? operation(truth1, truth2) : null;
    }

    /**
     * Safely execute unary operations on a Truth object
     * @param {Truth} truth - Truth object to operate on
     * @param {Function} operation - Unary operation to perform
     * @returns {Truth|null} - Result of operation or null if input invalid
     */
    static unaryOperation(truth, operation) {
        return truth ? operation(truth) : null;
    }

    static create(f, c) {
        // Optimization: return singletons for common values
        if (Math.abs(c - TRUTH.DEFAULT_CONFIDENCE) < TRUTH.EPSILON) {
            if (Math.abs(f - 1.0) < TRUTH.EPSILON) return Truth.TRUE;
            if (Math.abs(f - 0.0) < TRUTH.EPSILON) return Truth.FALSE;
            if (Math.abs(f - 0.5) < TRUTH.EPSILON) return Truth.NEUTRAL;
        }
        return new Truth(f, c);
    }

    /**
     * Safe division with clamping
     * @param {number} numerator - Numerator
     * @param {number} denominator - Denominator
     * @returns {number} - Result of division or 0 if denominator is 0
     */
    static safeDiv(numerator, denominator) {
        return denominator === 0 ? 0 : clamp(numerator / denominator, 0, 1);
    }

    // Truth operation methods using a more modular approach
    static deduction(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) => {
            const f = t.frequency * u.frequency;
            const c = t.confidence * u.confidence;
            return Truth.create(f, c);
        });
    }

    static induction(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) => {
            const w = u.frequency * t.confidence * u.confidence;
            return Truth.create(u.frequency, Truth.w2c(w));
        });
    }

    static abduction(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) => {
            const w = t.frequency * t.confidence * u.confidence;
            return Truth.create(t.frequency, Truth.w2c(w));
        });
    }

    static detachment(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) =>
            Truth.create(u.frequency, t.frequency * t.confidence * u.confidence));
    }

    static revision(truth1, truth2) {
        if (!truth1 || !truth2) return truth1 || truth2;
        if (truth1 === truth2 || truth1.equals(truth2)) return truth1;

        const {f: f1, c: c1} = truth1;
        const {f: f2, c: c2} = truth2;

        const w1 = Truth.c2w(c1);
        const w2 = Truth.c2w(c2);
        const w = w1 + w2;

        if (w <= 0) return Truth.create((f1 + f2) / 2, 0);

        const f = (w1 * f1 + w2 * f2) / w;
        const c = Truth.w2c(w);

        return Truth.create(f, c);
    }

    static choice(t1, t2) {
        if (!t1) return t2;
        if (!t2) return t1;

        const e1 = Truth.expectation(t1);
        const e2 = Truth.expectation(t2);

        if (Math.abs(e1 - e2) < Number.EPSILON) {
            return t1.confidence >= t2.confidence ? t1 : t2;
        }
        return e1 > e2 ? t1 : t2;
    }

    static negation(truth) {
        return Truth.unaryOperation(truth, t => {
            const f = 1 - t.frequency;
            return Truth.create(f, t.confidence);
        });
    }

    static conversion(truth) {
        return Truth.unaryOperation(truth, t => Truth.create(t.frequency, t.frequency * t.confidence));
    }

    static expectation(truth) {
        if (!truth) return 0.5;
        const {frequency: f, confidence: c} = truth;
        return c * (f - 0.5) + 0.5;
    }

    static comparison(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) => {
            const frequencyProduct = t.frequency * u.frequency;
            const denominator = frequencyProduct + (1 - t.frequency) * (1 - u.frequency);
            return Truth.create(Truth.safeDiv(frequencyProduct, denominator), t.confidence * u.confidence);
        });
    }

    static analogy(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) =>
            Truth.create(t.frequency * u.frequency, t.confidence * u.confidence * u.frequency));
    }

    static resemblance(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) =>
            Truth.create((t.frequency + u.frequency) / 2, t.confidence * u.confidence));
    }

    static contraposition(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) => {
            const contraFreq = u.frequency * (1 - t.frequency);
            const denom = contraFreq + (1 - u.frequency) * t.frequency;
            return Truth.create(Truth.safeDiv(contraFreq, denom), t.confidence * u.confidence);
        });
    }

    static intersection(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) =>
            Truth.create(t.frequency * u.frequency, t.confidence * u.confidence));
    }

    static union(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) =>
            Truth.create(1 - (1 - t.frequency) * (1 - u.frequency), t.confidence * u.confidence));
    }

    static subtract(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) =>
            Truth.create(Math.max(0, t.frequency - u.frequency), t.confidence * u.confidence));
    }

    static diff(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) =>
            Truth.create(Math.abs(t.frequency - u.frequency), t.confidence * u.confidence));
    }

    static exemplification(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) => {
            const w = t.confidence / (t.confidence + 1); // weakening factor
            return Truth.create(t.frequency * u.frequency, w * t.confidence * u.confidence * t.frequency * u.frequency);
        });
    }

    static sameness(t1, t2) {
        return Truth.binaryOperation(t1, t2, (t, u) => {
            const diff = Math.abs(t.frequency - u.frequency);
            return Truth.create(1 - diff, t.confidence * u.confidence);
        });
    }

    static deductionWeak(t1, t2) {
        const result = Truth.deduction(t1, t2);
        return result ? Truth.create(result.f, Truth.weak(result.c)) : null;
    }

    static structuralDeduction(t) {
        return Truth.unaryOperation(t, t => {
             const c = t.confidence / (t.confidence + 1);
             return Truth.create(t.frequency * t.frequency, c * t.confidence);
        });
    }

    static structuralReduction(t) {
        return Truth.unaryOperation(t, t => Truth.create(t.frequency, Truth.weak(t.confidence)));
    }

    static isStronger(t1, t2) {
        return Truth.expectation(t1) > Truth.expectation(t2);
    }

    static weak(confidence) {
        return clamp(confidence / (confidence + TRUTH.WEAKENING_FACTOR), 0, 1);
    }

    static w2c(w) {
        return w / (w + 1);
    }

    static c2w(c) {
        const maxC = 1.0 - Number.EPSILON;
        const safeC = Math.min(c, maxC);
        return safeC / (1 - safeC);
    }

    equals(other) {
        return other instanceof Truth &&
            Math.abs(this._frequency - other.frequency) < TRUTH.EPSILON &&
            Math.abs(this._confidence - other.confidence) < TRUTH.EPSILON;
    }

    toString() {
        return `%${this._frequency.toFixed(TRUTH.PRECISION)};${this._confidence.toFixed(TRUTH.PRECISION)}%`;
    }
}
