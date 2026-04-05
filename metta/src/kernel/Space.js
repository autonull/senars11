import {exp, sym} from './Term.js';
import {RuleIndex} from './RuleIndex.js';
import {PathTrie} from './PathTrie.js';
import {configManager} from '../config/config.js';

export class Space {
    #atoms = new Set();
    #ruleIndex = new RuleIndex();
    #pathTrie = configManager.get('pathTrie') ? new PathTrie() : null;
    #stats = {adds: 0, removes: 0, queries: 0};

    get ruleIndex() {
        return this.#ruleIndex;
    }

    get pathTrie() {
        return this.#pathTrie;
    }

    get atoms() {
        return this.#atoms;
    }

    add(atom) {
        if (!atom) {
            throw new Error('Cannot add null/undefined atom');
        }
        if (!this.#atoms.has(atom)) {
            this.#atoms.add(atom);
            const rule = {pattern: atom};
            this.#ruleIndex.addRule(rule);
            this.#pathTrie?.insert(atom, rule);
            this.#stats.adds++;
        }
        return this;
    }

    remove(atom) {
        if (this.#atoms.has(atom)) {
            this.#atoms.delete(atom);
            this.#ruleIndex.removeRule(atom);
            this.#stats.removes++;
            return true;
        }
        return false;
    }

    has(atom) {
        return this.#atoms.has(atom);
    }

    all() {
        return [...this.#atoms, ...this.#getRulesAsAtoms()];
    }

    #getRulesAsAtoms() {
        return this.#ruleIndex.allRules
            .filter(r => r.result && typeof r.result !== 'function' && r.pattern)
            .map(r => exp(sym('='), [r.pattern, r.result]));
    }

    addRule(pattern, result) {
        if (!pattern) {
            throw new Error('Pattern cannot be null');
        }
        const rule = {pattern, result};
        this.#ruleIndex.addRule(rule);
        this.#pathTrie?.insert(pattern, rule);
        return this;
    }

    getRules() {
        return this.#ruleIndex.allRules.filter(r => r.result != null);
    }

    rulesFor(term) {
        if (typeof term === 'string') {
            term = sym(term);
        }
        if (this.#pathTrie) {
            const trieRules = this.#pathTrie.query(term);
            if (trieRules.length > 0) {
                return trieRules;
            }
        }
        return this.#ruleIndex.rulesFor(term);
    }

    size() {
        return this.#atoms.size;
    }

    getAtomCount() {
        return this.#atoms.size;
    }

    getStats() {
        return {
            ...this.#stats,
            atomCount: this.#atoms.size,
            ruleCount: this.#ruleIndex.allRules.length,
            indexedFunctors: this.#ruleIndex.functorIndex.size,
            indexStats: this.#ruleIndex.getStats()
        };
    }

    stats() {
        return this.getStats();
    }

    query(pattern) {
        this.#stats.queries++;
        return [...this.#atoms].filter(atom => atom.equals?.(pattern));
    }

    clear() {
        this.#atoms.clear();
        this.#ruleIndex.clear();
        this.#stats = {adds: 0, removes: 0, queries: 0};
    }
}
