export class TermSerializer {
    constructor(config = {}) {
        this.config = config;
    }

    stringify(term, options = {}) {
        if (!term) return '';
        if (term.isAtomic) return term.name;

        const op = term.operator;

        switch (op) {
            case '[]':
            case 'SETi':
                return this.printSet(term, '[', ']');
            case '{}':
            case 'SETe':
                return this.printSet(term, '{', '}');
            case '--':
            case 'NEG':
                return this.printNegation(term);
            case 'Δ':
            case 'DELTA':
                return this.printDelta(term);
            default:
                return this.isStatement(term) ? this.printStatement(term) : this.printCompound(term);
        }
    }

    isStatement(term) {
        // Simple check if operator is typically infix statement
        const op = term.operator;
        return ['-->', '<->', '==>', '<=>', '<~>', '=/>', '=|', '=/=', '='].includes(op);
    }

    printStatement(term) {
        return `(${this.stringify(term.subject)} ${term.operator} ${this.stringify(term.predicate)})`;
    }

    printSet(term, open, close) {
        return `${open}${term.components.map(c => this.stringify(c)).join(', ')}${close}`;
    }

    printNegation(term) {
        const inner = term.comp(0);
        // Standard Narsese --A
        return `--${this.stringify(inner)}`;
    }

    printDelta(term) {
        return `Δ${this.stringify(term.comp(0))}`;
    }

    printCompound(term) {
        if (!term.operator) return this.printTuple(term);
        return `(${term.operator}, ${term.components.map(c => this.stringify(c)).join(', ')})`;
    }

    printTuple(term) {
        return `(${term.components.map(c => this.stringify(c)).join(', ')})`;
    }
}
