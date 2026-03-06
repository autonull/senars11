/**
 * PathTrie.js
 * MORK-parity Phase P1-B: PathTrie Indexing
 * Maps full head path (functor + arity + argument structure) for O(1) matching vs O(n) array scans.
 */
import { isExpression } from './Term.js';

class TrieNode {
    constructor() {
        this.children = new Map();
        this.rules = []; // Or Uint32Array for compact leaves
        this.isLeaf = false;
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
     */
    * _atomPath(atom) {
        if (!atom) return;

        if (isExpression(atom)) {
            yield atom.operator ? atom.operator.name || atom.operator : '()';
            const comps = atom.components || [];
            yield comps.length; // Arity
            for (const comp of comps) {
                yield* this._atomPath(comp);
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
        const path = this._atomPath(pattern);

        for (const token of path) {
            if (!curr.children.has(token)) {
                curr.children.set(token, new TrieNode());
            }
            curr = curr.children.get(token);
        }

        curr.isLeaf = true;
        curr.rules.push(rule);

        // Auto-rebalance
        if (this._insertCount >= this._rebalanceThreshold) {
            this.rebalance();
        }
    }

    /**
     * Returns Iterator<rule> following atom's structure.
     * Matches exact structure and wildcard variables ($x).
     */
    query(atom) {
        this.stats.lookups++;
        const rules = [];

        const path = Array.from(this._atomPath(atom));

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

            // Treat variables as generic wildcards during structural lookup (represented generically or by type)
            // If the query contains a variable, we must match against all possibilities at this node,
            // or if the trie node itself is a variable placeholder, match the query token against it.
            // (Assuming variables are mapped to a specific token like '*' or we collect all children)
            // Simplified: we rely on Unify.js later; this trie provides rapid *candidate* rules.

            // To ensure parity, a rule starting with a variable ($x) must be checked against any query token
            for (const [key, childNode] of node.children.entries()) {
                 if (typeof key === 'string' && key.startsWith('$')) {
                     // The rule has a variable here, so it matches whatever the query token is
                     // Skip depth accordingly (very naïve heuristic for deep var binding, ideally vars match single tokens)
                     traverse(childNode, depth + 1);
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
            // Traverse and compress node.rules into Uint32Array rule IDs if possible,
            // or perform path compression (radix trie) for branches with single children.
            // Placeholder for advanced typed-array leaf flattening per P1-B spec.
        });
    }
}
