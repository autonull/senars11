/**
 * RuleCompiler.js
 *
 * Compiles declarative rule patterns into an optimized decision tree (Rete-like)
 * for efficient matching against the stream.
 */

import {Term} from '../../term/Term.js';

/**
 * Check if an object is already a Term instance or a mock term object
 */
function isTermInstance(obj) {
    return obj instanceof Term ||
        (obj && typeof obj.type === 'string' && typeof obj.name === 'string') ||
        (obj && obj.isTerm === true);
}

class DecisionNode {
    constructor(check = null) {
        this.check = check;
        this.children = new Map();
        this.rules = [];
        this.fallback = null;
    }

    addChild(value, node) {
        this.children.set(value, node);
    }
}

export class RuleCompiler {
    constructor(termFactory, discriminators = []) {
        this.root = new DecisionNode();
        this.termFactory = termFactory;
        this.discriminators = discriminators;
    }

    /**
     * Compile a list of pattern rules into a decision tree.
     * @param {Array<PatternRule>} rules
     * @returns {DecisionNode} Root of the execution tree
     */
    compile(rules) {
        this.root = new DecisionNode();

        for (const rule of rules) {
            // Hydrate pattern objects into Terms if needed
            ['p', 's'].forEach(key => {
                if (!isTermInstance(rule.pattern[key]) && this.termFactory) {
                    rule.pattern[key] = this.hydratePattern(rule.pattern[key]);
                }
            });

            this.insert(this.root, rule);
        }

        return this.root;
    }

    hydratePattern(patternObj) {
        // If already a Term instance, return as-is
        if (isTermInstance(patternObj)) {
            return patternObj;
        }

        if (typeof patternObj === 'string') {
            if (!this.termFactory) {
                throw new Error('TermFactory required for pattern hydration');
            }
            if (patternObj.startsWith('$')) return this.termFactory.variable(patternObj);
            return this.termFactory.atomic(patternObj);
        }

        if (patternObj.operator) {
            if (!this.termFactory) {
                throw new Error('TermFactory required for pattern hydration');
            }

            // Assuming binary operators for now if subject/predicate are present
            if (patternObj.subject && patternObj.predicate) {
                const subject = this.hydratePattern(patternObj.subject);
                const predicate = this.hydratePattern(patternObj.predicate);
                return this.termFactory.create(patternObj.operator, [subject, predicate]);
            }

            if (patternObj.components) {
                const components = patternObj.components.map(c => this.hydratePattern(c));
                return this.termFactory.create(patternObj.operator, components);
            }
        }

        throw new Error(`Cannot hydrate pattern: ${JSON.stringify(patternObj)}`);
    }

    insert(root, rule) {
        const p = rule.pattern.p;
        const s = rule.pattern.s;
        let node = root;

        for (const discriminator of this.discriminators) {
            const value = discriminator.getPatternValue(p, s);
            node = this.getOrCreateChild(node, discriminator.name, value);
        }

        // Leaf: Add rule
        node.rules.push(rule);
    }

    getOrCreateChild(node, checkType, value) {
        if (!node.check) {
            node.check = {type: checkType};
        }

        let child = node.children.get(value);
        if (!child) {
            child = new DecisionNode();
            node.children.set(value, child);
        }
        return child;
    }
}
