import {constructList, exp, flattenList, isExpression, isList, isVariable} from './Term.js';
import {getTypeTag, isSymbol as fastIsSymbol, TYPE_SYMBOL} from './FastPaths.js';
import {configManager} from '../config/config.js';
import * as UnifyCore from '@senars/nar/src/term/UnifyCore.js';
import {SMTBridge} from '../extensions/SMTOps.js';

let _smtBridge = null;
const getSMTBridge = () => _smtBridge ??= configManager.get('smt') ? new SMTBridge() : null;

const safeSubstitute = (rootTerm, bindings, rootVisited = new Set(), recursive = true) => {
    if (!rootTerm || !bindings || Object.keys(bindings).length === 0) {
        return rootTerm;
    }

    const stack = [{type: 'PROCESS', term: rootTerm, visited: rootVisited}];
    const resultStack = [];

    while (stack.length > 0) {
        const cmd = stack.pop();

        if (cmd.type === 'PROCESS') {
            const {term, visited} = cmd;
            if (!term) {
                resultStack.push(term);
                continue;
            }

            if (isVariable(term)) {
                const val = bindings[term.name];
                if (val !== undefined && val !== term) {
                    if (!recursive || visited.has(term.name)) {
                        resultStack.push(val);
                    } else {
                        const newVisited = new Set(visited).add(term.name);
                        stack.push({type: 'PROCESS', term: val, visited: newVisited});
                    }
                } else {
                    resultStack.push(term);
                }
                continue;
            }

            if (isExpression(term)) {
                if (isList(term)) {
                    const {elements, tail} = flattenList(term);
                    stack.push({type: 'CONSTRUCT_LIST', elemCount: elements.length, hasTail: !!tail, original: term});
                    if (tail) {
                        stack.push({type: 'PROCESS', term: tail, visited: new Set(visited)});
                    }
                    for (let i = elements.length - 1; i >= 0; i--) {
                        stack.push({type: 'PROCESS', term: elements[i], visited: new Set(visited)});
                    }
                    continue;
                }

                const op = term.operator;
                stack.push({
                    type: 'CONSTRUCT_EXPR',
                    original: term,
                    compCount: term.components.length,
                    opIsObj: typeof op === 'object'
                });
                for (let i = term.components.length - 1; i >= 0; i--) {
                    stack.push({type: 'PROCESS', term: term.components[i], visited: new Set(visited)});
                }
                if (typeof op === 'object') {
                    stack.push({type: 'PROCESS', term: op, visited});
                }
                continue;
            }

            resultStack.push(term);
            continue;
        }

        if (cmd.type === 'CONSTRUCT_EXPR') {
            const {original, compCount, opIsObj} = cmd;
            const items = resultStack.splice(resultStack.length - compCount - (opIsObj ? 1 : 0), compCount + (opIsObj ? 1 : 0));
            let newOp = original.operator;
            if (opIsObj) {
                newOp = items.shift();
            }
            const changed = newOp !== original.operator || items.some((c, i) => c !== original.components[i]);
            resultStack.push(changed ? exp(newOp, items) : original);
            continue;
        }

        if (cmd.type === 'CONSTRUCT_LIST') {
            const {elemCount, hasTail, original} = cmd;
            const items = resultStack.splice(resultStack.length - elemCount - (hasTail ? 1 : 0), elemCount + (hasTail ? 1 : 0));
            const newTail = hasTail ? items.pop() : undefined;
            const {elements: origElements, tail: origTail} = flattenList(original);
            const changed = newTail !== origTail || items.length !== origElements.length || items.some((e, i) => e !== origElements[i]);
            resultStack.push(changed ? constructList(items, newTail) : original);

        }
    }

    return resultStack[0];
};

const unifyLists = (t1, t2, bindings) => {
    const f1 = flattenList(t1);
    const f2 = flattenList(t2);
    const minLen = Math.min(f1.elements.length, f2.elements.length);

    let currBindings = bindings;
    for (let i = 0; i < minLen && currBindings; i++) {
        currBindings = unifiedUnify(f1.elements[i], f2.elements[i], currBindings);
    }
    if (!currBindings) {
        return null;
    }

    const t1Rem = f1.elements.length > minLen ? constructList(f1.elements.slice(minLen), f1.tail) : f1.tail;
    const t2Rem = f2.elements.length > minLen ? constructList(f2.elements.slice(minLen), f2.tail) : f2.tail;
    return unifiedUnify(t1Rem, t2Rem, currBindings);
};

const mettaAdapter = {
    isVariable,
    isCompound: isExpression,
    getVariableName: t => t.name,
    getOperator: t => t.operator,
    getComponents: t => t.components ?? [],
    equals: (t1, t2) => t1 === t2 || (t1?.equals?.(t2) ?? false),
    substitute: (t, b, opts) => safeSubstitute(t, b, undefined, opts?.recursive),
    reconstruct: (t, comps) => {
        if (isList(t)) {
            const {tail} = flattenList(t);
            return constructList(comps, tail);
        }
        return exp(t.operator, comps);
    }
};

const unifiedUnify = (t1, t2, binds = {}) => {
    if (configManager.get('fastPaths')) {
        const tag1 = getTypeTag(t1), tag2 = getTypeTag(t2);
        if (tag1 === TYPE_SYMBOL && tag2 === TYPE_SYMBOL) {
            return (t1 === t2 || t1.name === t2.name) ? binds : null;
        }
    } else if (fastIsSymbol(t1) && fastIsSymbol(t2)) {
        return (t1 === t2 || t1.name === t2.name) ? binds : null;
    }

    if (isList(t1) && isList(t2)) {
        return unifyLists(t1, t2, binds);
    }

    const result = UnifyCore.unify(t1, t2, binds, mettaAdapter);

    if (!result && configManager.get('smt')) {
        const bridge = getSMTBridge();
        if (bridge?.canSolve(binds)) {
            const smtResult = bridge.solve([t1, t2]);
            if (smtResult) {
                return smtResult;
            }
        }
    }

    return result;
};

export const Unify = {
    unify: unifiedUnify,
    subst: (term, bindings, options) => safeSubstitute(term, bindings, undefined, options?.recursive),
    match: (pat, term, binds = {}) => UnifyCore.match(pat, term, binds, mettaAdapter),
    matchAll: (pats, terms) => {
        const res = [];
        pats.forEach(p => terms.forEach(t => {
            const b = unifiedUnify(p, t);
            if (b) {
                res.push({pattern: p, term: t, bindings: b});
            }
        }));
        return res;
    },
    isVar: isVariable
};
