import { ArrayStamp } from '../Stamp.js';
import { Truth } from '../Truth.js';
import { Term } from '../term/Term.js';
import { getOperator, getComponents } from '../term/TermUtils.js';

const freeze = Object.freeze;

export const Punctuation = Object.freeze({ BELIEF: '.', GOAL: '!', QUESTION: '?' });
const TaskType = Object.freeze({ BELIEF: 'BELIEF', GOAL: 'GOAL', QUESTION: 'QUESTION' });

const PUNCTUATION_TO_TYPE = Object.freeze({
    [Punctuation.BELIEF]: TaskType.BELIEF,
    [Punctuation.GOAL]: TaskType.GOAL,
    [Punctuation.QUESTION]: TaskType.QUESTION
});

const TYPE_TO_PUNCTUATION = Object.freeze({
    [TaskType.BELIEF]: Punctuation.BELIEF,
    [TaskType.GOAL]: Punctuation.GOAL,
    [TaskType.QUESTION]: Punctuation.QUESTION
});

const DEFAULT_BUDGET = Object.freeze({ priority: 0.5, durability: 0.5, quality: 0.5, cycles: 100, depth: 10 });

export class Task {
    constructor({ term, punctuation = Punctuation.BELIEF, truth = null, budget = DEFAULT_BUDGET, stamp = null, metadata = null }) {
        if (!(term instanceof Term)) throw new Error('Task must be initialized with a valid Term object.');

        this.term = term;
        this.type = PUNCTUATION_TO_TYPE[punctuation] ?? TaskType.BELIEF;

        // Handle negation unwrapping for terms like (-- (A))
        const { term: unwrappedTerm, truth: adjustedTruth } = this._unwrapNegation(this.term, truth);
        this.term = unwrappedTerm;
        const finalTruth = adjustedTruth;

        this._validateTruth(finalTruth);

        this.truth = this._createTruth(finalTruth);
        this.budget = freeze({ ...budget });
        this.stamp = stamp ?? ArrayStamp.createInput();
        this.metadata = metadata ? freeze(metadata) : null;

        freeze(this);
    }

    get punctuation() { return TYPE_TO_PUNCTUATION[this.type]; }

    static fromJSON(data) {
        if (!data) throw new Error('Task.fromJSON requires valid data object');

        const term = typeof data.term === 'string'
            ? { toString: () => data.term, equals: (o) => o?.toString?.() === data.term } // Minimal mock for string terms
            : data.term;

        return new Task({
            term,
            punctuation: data.punctuation,
            truth: data.truth ? Truth.create(data.truth.frequency ?? data.truth.f, data.truth.confidence ?? data.truth.c) : null,
            budget: data.budget ?? DEFAULT_BUDGET
        });
    }

    _unwrapNegation(term, truth) {
        const op = getOperator(term);
        const comps = getComponents(term);

        if (op === '--' && comps.length === 1) {
            const unwrapped = comps[0];
            let newTruth = truth;
            if (newTruth) {
                const t = this._createTruth(newTruth);
                newTruth = t ? Truth.create(1.0 - t.f, t.c) : null;
            }
            return { term: unwrapped, truth: newTruth };
        }
        return { term, truth };
    }

    _validateTruth(truth) {
        const expectsTruth = this.type !== TaskType.QUESTION;
        if (expectsTruth !== (truth !== null)) {
            throw new Error(this.type === TaskType.QUESTION
                ? 'Questions cannot have truth values'
                : `${this.type} tasks must have valid truth values`);
        }
    }

    _createTruth(truth) {
        if (truth instanceof Truth) return truth;
        return (truth?.frequency != null && truth?.confidence != null)
            ? Truth.create(truth.frequency, truth.confidence)
            : null;
    }

    clone(overrides = {}) {
        return new Task({
            term: this.term,
            punctuation: this.punctuation,
            truth: this.truth,
            budget: { ...this.budget },
            stamp: this.stamp,
            ...overrides,
        });
    }

    isBelief() { return this.type === TaskType.BELIEF; }
    isGoal() { return this.type === TaskType.GOAL; }
    isQuestion() { return this.type === TaskType.QUESTION; }

    equals(other) {
        if (!(other instanceof Task) || this.type !== other.type) return false;
        if (this.term !== other.term && !this.term.equals(other.term)) return false;
        return this.truth === other.truth || (!!this.truth && !!other.truth && this.truth.equals(other.truth));
    }

    toString() {
        return `${this.term.toString()}${this.punctuation}${this.truth ? ` ${this.truth.toString()}` : ''}`;
    }

    serialize() {
        return {
            term: this.term.serialize ? this.term.serialize() : this.term.toString(),
            punctuation: this.punctuation,
            type: this.type,
            truth: this.truth ? (this.truth.serialize ? this.truth.serialize() : { f: this.truth.f, c: this.truth.c }) : null,
            budget: this.budget,
            stamp: this.stamp.serialize ? this.stamp.serialize() : null,
            version: '1.0.0'
        };
    }
}
