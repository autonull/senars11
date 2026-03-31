
const NARSESE_PATTERNS = {
    statement: /<(.+?) --> (.+?)>\.?/,
    question: /<(.+?) --> (.+?)>\?/,
    mettaImplies: /\(implies (.+?) (.+?)\)/,
    mettaInherits: /\(inherits (.+?) (.+?)\)/
};

const METTA_TRANSFORMS = [
    { pattern: NARSESE_PATTERNS.mettaImplies, transform: (m) => `<${m[1]} --> ${m[2]}>.` },
    { pattern: NARSESE_PATTERNS.mettaInherits, transform: (m) => `<${m[1]} --> ${m[2]}>.` }
];

export const NarseseUtils = {
    // --- From NarseseConverter ---

    toMetta(narsese) {
        const match = narsese.toString().match(NARSESE_PATTERNS.statement);
        if (!match) return narsese;
        const [, subject, predicate] = match;
        return `(implies ${this._termToMetta(subject)} ${this._termToMetta(predicate)})`;
    },

    _termToMetta(term) {
        return term.includes('(')
            ? term.replace(/<(.+?) --> (.+?)>/g, '(inherits $1 $2)')
            : term.replace(/-->/g, '->');
    },

    toNarsese(mettaExpr) {
        const expr = mettaExpr.toString();
        for (const { pattern, transform } of METTA_TRANSFORMS) {
            const match = expr.match(pattern);
            if (match) {
                const [, antecedent, consequent] = match;
                return this._mettaToTerm(antecedent) + ' --> ' + this._mettaToTerm(consequent) + '.';
            }
        }
        return expr;
    },

    _mettaToTerm(term) {
        return term.trim().replace(/->/g, '-->');
    },

    parseQuestion(question) {
        const match = question.toString().match(NARSESE_PATTERNS.question);
        if (!match) return null;
        return { subject: match[1], predicate: match[2] };
    },

    valueToMetta(value) {
        if (Array.isArray(value)) {
            return `(${value.map(v => this.valueToMetta(v)).join(' ')})`;
        }
        if (typeof value === 'object' && value !== null) {
            // Very simple object support
            return `(${Object.values(value).map(v => this.valueToMetta(v)).join(' ')})`;
        }
        return String(value);
    },

    // --- From SeNARSMettaTensor ---

    observationToNarsese(observation, prefix = 'obs') {
        if (Array.isArray(observation)) {
            return observation.map((v, i) => `<f${i} --> ${prefix}>.`).join(' ');
        }
        if (typeof observation === 'object' && observation !== null) {
            return Object.entries(observation).map(([k, v]) => `<${k} --> ${prefix}>.`).join(' ');
        }
        return `<${observation} --> ${prefix}>.`;
    },

    actionToNarsese(action, prefix = 'op') {
        if (typeof action === 'number') return `^${prefix}_${action}`;
        if (Array.isArray(action)) return `^${prefix}(${action.join(' ')})`;
        return `^${action}`;
    },

    goalToNarsese(goal) {
        if (typeof goal === 'string') return `${goal}!`;
        if (typeof goal === 'object' && goal !== null) {
            const terms = Object.entries(goal).map(([k, v]) => `${k}_${v}`).join(' ');
            return `<(*, ${terms}) --> goal>!`;
        }
        return `${goal}!`;
    },

    parseOperation(operation) {
        if (!operation) return null;
        const opStr = operation.toString();
        const match = opStr.match(/\^op_?(\d+|\(.*?\))/);
        if (match) {
            const actionStr = match[1];
            if (actionStr.startsWith('(')) {
                return actionStr.slice(1, -1).split(/\s+/).map(Number);
            }
            return parseInt(actionStr);
        }
        return null;
    }
};
