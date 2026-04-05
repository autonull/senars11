import { ArrayStamp } from '../Stamp.js';
import { Truth } from '../Truth.js';
import { Term } from '../term/Term.js';
import { getOperator, getComponents } from '../term/TermUtils.js';

const {freeze} = Object;

export const Punctuation = freeze({ BELIEF: '.', GOAL: '!', QUESTION: '?' });
const TaskType = freeze({ BELIEF: 'BELIEF', GOAL: 'GOAL', QUESTION: 'QUESTION' });

const PUNCTUATION_TO_TYPE = freeze({
    [Punctuation.BELIEF]: TaskType.BELIEF,
    [Punctuation.GOAL]: TaskType.GOAL,
    [Punctuation.QUESTION]: TaskType.QUESTION
});

const TYPE_TO_PUNCTUATION = freeze({
    [TaskType.BELIEF]: Punctuation.BELIEF,
    [TaskType.GOAL]: Punctuation.GOAL,
    [TaskType.QUESTION]: Punctuation.QUESTION
});

const DEFAULT_BUDGET = freeze({ priority: 0.5, durability: 0.5, quality: 0.5, cycles: 100, depth: 10 });

export class Task {
    constructor({ term, punctuation = Punctuation.BELIEF, truth = null, budget = DEFAULT_BUDGET, stamp = null, metadata = null }) {
        if (!(term instanceof Term)) {throw new Error('Task must be initialized with a valid Term object.');}

        this.type = PUNCTUATION_TO_TYPE[punctuation] ?? TaskType.BELIEF;

        // Handle negation unwrapping for terms like (-- (A))
        const { term: unwrappedTerm, truth: finalTruth } = this._unwrapNegation(term, truth);

        this._validateTruth(finalTruth);

        this.term = unwrappedTerm;
        this.truth = this._createTruth(finalTruth);
        this.budget = freeze({ ...budget });
        this.stamp = stamp ?? ArrayStamp.createInput();
        this.metadata = metadata ? freeze(metadata) : null;

        freeze(this);
    }

    get punctuation() { return TYPE_TO_PUNCTUATION[this.type]; }

    static fromJSON(data) {
        if (!data) {throw new Error('Task.fromJSON requires valid data object');}

        const term = typeof data.term === 'string'
            ? { toString: () => data.term, equals: (o) => o?.toString?.() === data.term }
            : data.term;

        return new Task({
            term,
            punctuation: data.punctuation,
            truth: data.truth ? Truth.create(data.truth.frequency ?? data.truth.f, data.truth.confidence ?? data.truth.c) : null,
            budget: data.budget ?? DEFAULT_BUDGET
        });
    }

    _unwrapNegation(term, truth) {
        if (getOperator(term) !== '--') {return {term, truth};}

        const comps = getComponents(term);
        if (comps.length !== 1) {return {term, truth};}

        const t = this._createTruth(truth);
        return {
            term: comps[0],
            truth: t ? Truth.create(1.0 - t.f, t.c) : truth
        };
    }

    _validateTruth(truth) {
        const hasTruth = truth !== null;
        const needsTruth = this.type !== TaskType.QUESTION;

        if (hasTruth !== needsTruth) {
            throw new Error(this.type === TaskType.QUESTION
                ? 'Questions cannot have truth values'
                : `${this.type} tasks must have valid truth values`);
        }
    }

    _createTruth(truth) {
        if (truth instanceof Truth) {return truth;}
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
        if (this === other) {return true;}
        if (!(other instanceof Task) || this.type !== other.type) {return false;}

        return (this.term === other.term || this.term.equals(other.term)) &&
               (this.truth === other.truth || (this.truth?.equals(other.truth) ?? false));
    }

    toString() {
        return `${this.term.toString()}${this.punctuation}${this.truth ? ` ${this.truth.toString()}` : ''}`;
    }

    serialize() {
        return {
            term: this.term.serialize ? this.term.serialize() : this.term.toString(),
            punctuation: this.punctuation,
            type: this.type,
            truth: this.truth?.serialize ? this.truth.serialize() : (this.truth ? { f: this.truth.f, c: this.truth.c } : null),
            budget: this.budget,
            stamp: this.stamp.serialize ? this.stamp.serialize() : null,
            version: '1.0.0'
        };
    }
}
