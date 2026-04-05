
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
        return match
            ? `(implies ${this._termToMetta(match[1])} ${this._termToMetta(match[2])})`
            : narsese;
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
            if (match) {return transform(match);}
        }
        return expr;
    },

    _mettaToTerm(term) {
        return term.trim().replace(/->/g, '-->');
    },

    parseQuestion(question) {
        const match = question.toString().match(NARSESE_PATTERNS.question);
        return match ? { subject: match[1], predicate: match[2] } : null;
    },

    valueToMetta(value) {
        if (Array.isArray(value)) {return `(${value.map(v => this.valueToMetta(v)).join(' ')})`;}
        if (value && typeof value === 'object') {return `(${Object.values(value).map(v => this.valueToMetta(v)).join(' ')})`;}
        return String(value);
    },

    // --- From SeNARSMettaTensor ---

    observationToNarsese(observation, prefix = 'obs') {
        if (Array.isArray(observation)) {return observation.map((v, i) => `<f${i} --> ${prefix}>.`).join(' ');}
        if (observation && typeof observation === 'object') {return Object.entries(observation).map(([k, v]) => `<${k} --> ${prefix}>.`).join(' ');}
        return `<${observation} --> ${prefix}>.`;
    },

    actionToNarsese(action, prefix = 'op') {
        if (Array.isArray(action)) {return `^${prefix}(${action.join(' ')})`;}
        return typeof action === 'number' ? `^${prefix}_${action}` : `^${action}`;
    },

    goalToNarsese(goal) {
        if (typeof goal === 'string') {return `${goal}!`;}
        if (goal && typeof goal === 'object') {
            const terms = Object.entries(goal).map(([k, v]) => `${k}_${v}`).join(' ');
            return `<(*, ${terms}) --> goal>!`;
        }
        return `${goal}!`;
    },

    parseOperation(operation) {
        if (!operation) {return null;}
        const match = operation.toString().match(/\^op_?(\d+|\(.*?\))/);
        if (!match) {return null;}

        const actionStr = match[1];
        return actionStr.startsWith('(')
            ? actionStr.slice(1, -1).split(/\s+/).map(Number)
            : parseInt(actionStr);
    }
};
