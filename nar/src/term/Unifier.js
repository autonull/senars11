import {getComponents, getOperator, getVariableName, isCompound, isVariable, termsEqual} from './TermUtils.js';
import * as UnifyCore from './UnifyCore.js';

const FAILURE = {success: false, substitution: {}};

export class Unifier {
    constructor(termFactory) {
        this.termFactory = termFactory;

        // NARS term adapter for UnifyCore
        this.adapter = {
            isVariable: term => isVariable(term),
            isCompound: term => isCompound(term),
            getVariableName: term => getVariableName(term),
            getOperator: term => getOperator(term) ?? '',
            getComponents: term => getComponents(term),
            equals: (t1, t2) => termsEqual(t1, t2),
            substitute: (term, bindings) => UnifyCore.substitute(term, bindings, this.adapter),
            reconstruct: (term, newComponents) => {
                const operator = getOperator(term);
                return this.termFactory.create(operator, newComponents);
            }
        };
    }

    unify(term1, term2, substitution = {}) {
        const result = UnifyCore.unify(term1, term2, substitution, this.adapter);
        return result ? {success: true, substitution: result} : {success: false, substitution: {}};
    }

    match(pattern, term, substitution = {}) {
        const result = UnifyCore.match(pattern, term, substitution, this.adapter);
        return result ? {success: true, substitution: result} : {success: false, substitution: {}};
    }

    applySubstitution(term, substitution) {
        return UnifyCore.substitute(term, substitution, this.adapter);
    }
}
