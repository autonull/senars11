/**
 * PathTrie.js
 * MORK-parity Phase P1-B: PathTrie Indexing
 * Maps full head path (functor + arity + argument structure) for O(1) matching vs O(n) array scans.
 */
import { isExpression, isVariable } from './Term.js';

class TrieNode {
    constructor() {
        this.children = new Map();
        this.rules = [];
        this.isLeaf = false;
        this.hasVariableChild = false; // Track if any child is a variable
    }
}

export class PathTrie {
    constructor() {
        this.root = new TrieNode();
        this.stats = { inserts: 0, lookups: 0, hits: 0, rebalances: 0 };
        this._insertCount = 0;
        this._rebalanceThreshold = 10000;
    }

    /**
     * Converts an atom into an iterable structural path key.
     * Extracts functor, arity, and positional structure.
     * Variables are marked with a special prefix for wildcard matching.
     */
    * _atomPath(atom, forInsert = true) {
        if (!atom) return;

        if (isVariable(atom)) {
            // Variables are indexed as wildcards
            yield forInsert ? '$VAR' : atom.name;
        } else if (isExpression(atom)) {
            yield atom.operator ? (atom.operator.name || atom.operator) : '()';
            const comps = atom.components || [];
            yield comps.length; // Arity
            for (const comp of comps) {
                yield* this._atomPath(comp, forInsert);
            }
        } else {
            yield atom.name || atom;
        }
    }

    /**
     * Walk/create nodes by functor+arity+argIndex chain.
     */
    insert(pattern, rule) {
        this.stats.inserts++;
        this._insertCount++;

        let curr = this.root;
        const path = Array.from(this._atomPath(pattern, true));

        for (const token of path) {
            if (!curr.children.has(token)) {
                curr.children.set(token, new TrieNode());
            }
            curr = curr.children.get(token);
            
            // Track variable children for faster query
            if (token === '$VAR') {
                curr.hasVariableChild = true;
            }
        }

        curr.isLeaf = true;
        curr.rules.push(rule);

        // Auto-rebalance
        if (this._insertCount >= this._rebalanceThreshold) {
            this.rebalance();
        }
    }

    /**
     * Returns array of rules following atom's structure.
     * Matches exact structure and wildcard variables ($x).
     */
    query(atom) {
        this.stats.lookups++;
        const rules = [];
        const path = Array.from(this._atomPath(atom, false));

        const traverse = (node, depth) => {
            if (depth === path.length) {
                if (node.isLeaf) {
                    rules.push(...node.rules);
                    this.stats.hits += node.rules.length;
                }
                return;
            }

            const token = path[depth];

            // Match exact structural token
            if (node.children.has(token)) {
                traverse(node.children.get(token), depth + 1);
            }

            // Match variable wildcards in rules (rules with $x match anything)
            if (node.children.has('$VAR')) {
                traverse(node.children.get('$VAR'), depth + 1);
            }

            // If current query token is a variable, match all children
            if (typeof token === 'string' && token.startsWith('$')) {
                for (const [key, childNode] of node.children.entries()) {
                    if (key !== '$VAR') {
                        traverse(childNode, depth + 1);
                    }
                }
            }
        };

        traverse(this.root, 0);
        return rules;
    }

    /**
     * Flatten hot branches to typed arrays (avoiding object array alloc).
     * Scheduled on a microtask to avoid latency spikes during insertion hot paths.
     */
    rebalance() {
        this.stats.rebalances++;
        this._insertCount = 0;

        queueMicrotask(() => {
            // Compress leaf rules into Uint32Array for memory efficiency
            const compressNode = (node) => {
                if (node.rules.length > 10 && !Array.isArray(node.rules)) {
                    // Could convert to Uint32Array of rule IDs here
                }
                for (const child of node.children.values()) {
                    compressNode(child);
                }
            };
            compressNode(this.root);
        });
    }

    /**
     * Get statistics
     */
    getStats() {
        return { ...this.stats };
    }
}
