import { TRUTH } from './config/constants.js';
import { TRUTH_DEFAULTS, TRUTH_THRESHOLDS, TRUTH_WEIGHTS, TRUTH_PRECISION } from './config/TruthConstants.js';
import { clamp } from '@senars/core/src/util/common.js';

export class Truth {
    constructor(frequency = TRUTH_DEFAULTS.NEUTRAL_FREQUENCY, confidence = TRUTH_DEFAULTS.DEFAULT_CONFIDENCE) {
        this._frequency = clamp(isNaN(frequency) ? TRUTH_DEFAULTS.NEUTRAL_FREQUENCY : frequency, 0, 1);
        this._confidence = clamp(isNaN(confidence) ? TRUTH_DEFAULTS.DEFAULT_CONFIDENCE : confidence, 0, 1);
        Object.freeze(this);
    }

    static get TRUE() { return Truth._TRUE || (Truth._TRUE = new Truth(1.0, TRUTH_DEFAULTS.DEFAULT_CONFIDENCE)); }
    static get FALSE() { return Truth._FALSE || (Truth._FALSE = new Truth(0.0, TRUTH_DEFAULTS.DEFAULT_CONFIDENCE)); }
    static get NEUTRAL() { return Truth._NEUTRAL || (Truth._NEUTRAL = new Truth(TRUTH_DEFAULTS.NEUTRAL_FREQUENCY, TRUTH_DEFAULTS.DEFAULT_CONFIDENCE)); }

    get frequency() { return this._frequency; }
    get confidence() { return this._confidence; }
    get f() { return this._frequency; }
    get c() { return this._confidence; }

    static create(f, c) {
        if (Math.abs(c - TRUTH_DEFAULTS.DEFAULT_CONFIDENCE) < TRUTH_THRESHOLDS.EPSILON) {
            if (Math.abs(f - 1.0) < TRUTH_THRESHOLDS.EPSILON) {return Truth.TRUE;}
            if (Math.abs(f - 0.0) < TRUTH_THRESHOLDS.EPSILON) {return Truth.FALSE;}
            if (Math.abs(f - TRUTH_DEFAULTS.NEUTRAL_FREQUENCY) < TRUTH_THRESHOLDS.EPSILON) {return Truth.NEUTRAL;}
        }
        return new Truth(f, c);
    }

    static safeDiv(num, den) {
        return den === 0 ? 0 : clamp(num / den, 0, 1);
    }

    static _binary(t1, t2, op) {
        return (t1 && t2) ? op(t1, t2) : null;
    }

    static _unary(t, op) {
        return t ? op(t) : null;
    }

    static deduction(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => Truth.create(a.f * b.f, a.c * b.c));
    }

    static induction(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => {
            const w = b.f * a.c * b.c;
            return Truth.create(b.f, Truth.w2c(w));
        });
    }

    static abduction(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => {
            const w = a.f * a.c * b.c;
            return Truth.create(a.f, Truth.w2c(w));
        });
    }

    static detachment(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => Truth.create(b.f, a.f * a.c * b.c));
    }

    static revision(t1, t2) {
        if (!t1 || !t2) {return t1 || t2;}
        if (t1 === t2 || t1.equals(t2)) {return t1;}

        const { f: f1, c: c1 } = t1;
        const { f: f2, c: c2 } = t2;

        const w1 = Truth.c2w(c1);
        const w2 = Truth.c2w(c2);
        const w = w1 + w2;

        if (w <= 0) {return Truth.create((f1 + f2) / 2, 0);}

        const f = (w1 * f1 + w2 * f2) / w;
        return Truth.create(f, Truth.w2c(w));
    }

    static choice(t1, t2) {
        if (!t1) {return t2;}
        if (!t2) {return t1;}

        const e1 = Truth.expectation(t1);
        const e2 = Truth.expectation(t2);

        if (Math.abs(e1 - e2) < Number.EPSILON) {
            return t1.confidence >= t2.confidence ? t1 : t2;
        }
        return e1 > e2 ? t1 : t2;
    }

    static negation(t) {
        return Truth._unary(t, (truth) => Truth.create(1 - truth.f, truth.c));
    }

    static conversion(t) {
        return Truth._unary(t, (truth) => Truth.create(truth.f, truth.f * truth.c));
    }

    static expectation(t) {
        if (!t) {return 0.5;}
        const { f, c } = t;
        return c * (f - 0.5) + 0.5;
    }

    static comparison(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => {
            const fProd = a.f * b.f;
            const denom = fProd + (1 - a.f) * (1 - b.f);
            return Truth.create(Truth.safeDiv(fProd, denom), a.c * b.c);
        });
    }

    static analogy(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => Truth.create(a.f * b.f, a.c * b.c * b.f));
    }

    static resemblance(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => Truth.create((a.f + b.f) / 2, a.c * b.c));
    }

    static contraposition(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => {
            const contraFreq = b.f * (1 - a.f);
            const denom = contraFreq + (1 - b.f) * a.f;
            return Truth.create(Truth.safeDiv(contraFreq, denom), a.c * b.c);
        });
    }

    static intersection(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => Truth.create(a.f * b.f, a.c * b.c));
    }

    static union(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => Truth.create(1 - (1 - a.f) * (1 - b.f), a.c * b.c));
    }

    static subtract(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => Truth.create(Math.max(0, a.f - b.f), a.c * b.c));
    }

    static diff(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => Truth.create(Math.abs(a.f - b.f), a.c * b.c));
    }

    static exemplification(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => {
            const w = a.c / (a.c + 1);
            return Truth.create(a.f * b.f, w * a.c * b.c * a.f * b.f);
        });
    }

    static sameness(t1, t2) {
        return Truth._binary(t1, t2, (a, b) => {
            const diff = Math.abs(a.f - b.f);
            return Truth.create(1 - diff, a.c * b.c);
        });
    }

    static deductionWeak(t1, t2) {
        const res = Truth.deduction(t1, t2);
        return res ? Truth.create(res.f, Truth.weak(res.c)) : null;
    }

    static structuralDeduction(t) {
        return Truth._unary(t, (truth) => {
            const c = truth.c / (truth.c + 1);
            return Truth.create(truth.f * truth.f, c * truth.c);
        });
    }

    static structuralReduction(t) {
        return Truth._unary(t, (truth) => Truth.create(truth.f, Truth.weak(truth.c)));
    }

    static isStronger(t1, t2) {
        return Truth.expectation(t1) > Truth.expectation(t2);
    }

    static weak(c) {
        return clamp(c / (c + TRUTH.WEAKENING_FACTOR), 0, 1);
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
            Math.abs(this._frequency - other.frequency) < TRUTH_THRESHOLDS.EPSILON &&
            Math.abs(this._confidence - other.confidence) < TRUTH_THRESHOLDS.EPSILON;
    }

    toString() {
        return `%${this._frequency.toFixed(TRUTH_PRECISION.DECIMAL_PLACES)};${this._confidence.toFixed(TRUTH_PRECISION.DECIMAL_PLACES)}%`;
    }
}
