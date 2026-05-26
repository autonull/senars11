export {Term, TermType} from './Term.js';
export {TermFactory} from './TermFactory.js';
export {TermCache} from './TermCache.js';
export {TermSerializer} from './TermSerializer.js';
export {
    termsEqual, isVariable, isCompound, isAtomic, getComponents, getOperator, hasOperator, getVariableName
} from './TermUtils.js';
export {Unifier} from './Unifier.js';
export {unify, substitute, match} from './UnifyCore.js';
