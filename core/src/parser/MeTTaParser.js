/**
 * MeTTaParser.js - Complete MeTTa Parser with Configurable Translation
 *
 * Parses MeTTa S-expression syntax and translates to SeNARS terms.
 * Uses configurable mapper for flexible MeTTa→SeNARS translation.
 */

import { BaseParser } from './BaseParser.js';
import { MeTTaTokenizer, TokenType } from './MeTTaTokenizer.js';
import { Task } from '../task/Task.js';
import { Truth } from '../Truth.js';
import { DEFAULT_MAPPINGS } from './MeTTaMappings.js';

/**
 * MeTTa Parser - Recursive descent parser for S-expressions
 */
export class MeTTaParser extends BaseParser {
    /**
     * @param {TermFactory} termFactory - Term factory for creating SeNARS terms
     * @param {Object} options - Configuration options
     * @param {Object} options.mappings - Custom operator mappings to merge with defaults
     * @param {Object} options.defaultTruth - Default truth value {frequency, confidence}
     */
    constructor(termFactory = null, options = {}) {
        super(termFactory, options);
        this.mappings = { ...DEFAULT_MAPPINGS, ...options.mappings };
        this.defaultTruth = options.defaultTruth ?? { frequency: 1.0, confidence: 0.9 };
        this.tokens = [];
        this.pos = 0;
    }

    /**
     * Parse MeTTa input and convert to SeNARS tasks
     * @param {string} mettaInput - MeTTa source code
     * @returns {Array<Task>} - Array of SeNARS tasks
     */
    parse(mettaInput) {
        return this.parseMeTTa(mettaInput);
    }

    /**
     * Parse MeTTa input (alias)
     * @param {string} mettaInput
     * @returns {Array<Task>}
     */
    parseMeTTa(mettaInput) {
        if (!mettaInput?.trim()) return [];

        this._validateInput(mettaInput);
        const tokenizer = new MeTTaTokenizer(mettaInput);
        this.tokens = tokenizer.tokenize();
        this.pos = 0;

        const tasks = [];

        while (!this._isAtEnd()) {
            const { expr, isImmediate } = this._parseTopLevel();
            if (expr) {
                const term = this._toTerm(expr);
                if (term) {
                    tasks.push(this._createTask(term, isImmediate));
                }
            }
        }

        return tasks;
    }

    /**
     * Parse a single MeTTa expression and return the SeNARS term
     * @param {string} mettaExpr - Single MeTTa expression
     * @returns {Term} - SeNARS term
     */
    parseExpression(mettaExpr) {
        this._validateInput(mettaExpr);
        const tokenizer = new MeTTaTokenizer(mettaExpr);
        this.tokens = tokenizer.tokenize();
        this.pos = 0;

        const expr = this._parseExpr();
        return expr ? this._toTerm(expr) : null;
    }

    /**
     * Add or override operator mappings
     * @param {string} operator - Operator name
     * @param {Function} mapperFn - Function (termFactory, args, headTerm) => Term
     */
    addMapping(operator, mapperFn) {
        this.mappings[operator] = mapperFn;
    }

    /**
     * Get current operator mappings
     * @returns {Object} - Current mappings
     */
    getMappings() {
        return { ...this.mappings };
    }

    // ===== Parser internals =====

    _parseTopLevel() {
        let isImmediate = false;

        // Check for ! immediate evaluation
        if (this._check(TokenType.BANG)) {
            this._advance();
            isImmediate = true;
        }

        const expr = this._parseExpr();
        return { expr, isImmediate };
    }

    _parseExpr() {
        if (this._isAtEnd()) return null;

        const { type } = this._peek();

        if (type === TokenType.LPAREN) return this._parseList();
        if (type === TokenType.LBRACKET) return this._parseBracketList();
        if (type === TokenType.LBRACE) return this._parseBraceSet();

        if ([TokenType.SYMBOL, TokenType.VARIABLE, TokenType.STRING, TokenType.NUMBER, TokenType.GROUNDED].includes(type)) {
            return this._parseAtom();
        }

        this._advance(); // Skip unknown token
        return null;
    }

    _parseList() {
        this._expect(TokenType.LPAREN);
        const elements = [];

        while (!this._check(TokenType.RPAREN) && !this._isAtEnd()) {
            const expr = this._parseExpr();
            if (expr !== null) {
                elements.push(expr);
            }
        }

        this._expect(TokenType.RPAREN);
        return { type: 'list', elements };
    }

    _parseBracketList() {
        this._expect(TokenType.LBRACKET);
        const elements = [];

        while (!this._check(TokenType.RBRACKET) && !this._isAtEnd()) {
            const expr = this._parseExpr();
            if (expr !== null) {
                elements.push(expr);
            }
        }

        this._expect(TokenType.RBRACKET);
        return { type: 'bracket-list', elements };
    }

    _parseBraceSet() {
        this._expect(TokenType.LBRACE);
        const elements = [];

        while (!this._check(TokenType.RBRACE) && !this._isAtEnd()) {
            const expr = this._parseExpr();
            if (expr !== null) {
                elements.push(expr);
            }
        }

        this._expect(TokenType.RBRACE);
        return { type: 'set', elements };
    }

    _parseAtom() {
        const token = this._advance();
        return {
            type: 'atom',
            tokenType: token.type,
            value: token.value
        };
    }

    // ===== Term conversion =====

    _toTerm(expr) {
        if (!expr) return null;

        const converters = {
            'atom': this._atomToTerm,
            'list': (e) => this._listToTerm(e.elements),
            'bracket-list': (e) => this._bracketListToTerm(e.elements),
            'set': (e) => this._setToTerm(e.elements)
        };

        const converter = converters[expr.type];
        return converter ? converter.call(this, expr) : null;
    }

    _atomToTerm(atom) {
        const { tokenType, value } = atom;

        switch (tokenType) {
            case TokenType.VARIABLE:
                // Preserve $ prefix for MeTTa variables
                return this.termFactory.atomic(value);
            case TokenType.STRING:
                return this.termFactory.atomic(`"${value}"`);
            case TokenType.NUMBER:
                return this.termFactory.atomic(value);
            case TokenType.GROUNDED:
                return this.termFactory.atomic(value);
            case TokenType.SYMBOL:
            default:
                // Check for special atoms
                if (value === 'True') return this.termFactory.createTrue();
                if (value === 'False') return this.termFactory.createFalse();
                return this.termFactory.atomic(value);
        }
    }

    _listToTerm(elements) {
        if (elements.length === 0) {
            return this.termFactory.atomic('()');
        }

        // Get head and arguments
        const head = elements[0];
        const args = elements.slice(1);

        // Check if head is a known operator
        if (head.type === 'atom' && head.tokenType === TokenType.SYMBOL) {
            const op = head.value;

            // Check for custom mapping
            if (this.mappings[op]) {
                const argTerms = args.map(a => this._toTerm(a));
                const headTerm = this._atomToTerm(head);
                return this.mappings[op](this.termFactory, argTerms, headTerm);
            }
        }

        // Default: functor application (f x y) → (^, f, (*, x, y))
        const headTerm = this._toTerm(head);
        if (args.length === 0) {
            // Single symbol in parens - just return it
            return headTerm;
        }

        const argTerms = args.map(a => this._toTerm(a));
        return this.termFactory.predicate(headTerm, this.termFactory.product(...argTerms));
    }

    _bracketListToTerm(elements) {
        // [a b c] → intensional set
        const terms = elements.map(e => this._toTerm(e));
        return this.termFactory.setInt(...terms);
    }

    _setToTerm(elements) {
        // {a b c} → extensional set
        const terms = elements.map(e => this._toTerm(e));
        return this.termFactory.setExt(...terms);
    }

    _createTask(term, isImmediate) {
        return new Task({
            term,
            punctuation: isImmediate ? '!' : '.',
            truth: new Truth(this.defaultTruth.frequency, this.defaultTruth.confidence),
            budget: { priority: 0.8, durability: 0.7, quality: 0.8 }
        });
    }

    // ===== Token helpers =====

    _peek() {
        return this.tokens[this.pos];
    }

    _advance() {
        if (!this._isAtEnd()) {
            return this.tokens[this.pos++];
        }
        return this.tokens[this.pos];
    }

    _check(type) {
        return !this._isAtEnd() && this._peek()?.type === type;
    }

    _expect(type) {
        if (this._check(type)) {
            return this._advance();
        }
        throw new Error(`Expected ${type} but got ${this._peek().type}`);
    }

    _isAtEnd() {
        return this._peek().type === TokenType.EOF;
    }
}

/**
 * Convenience function to parse MeTTa and return SeNARS tasks
 * @param {string} mettaString - MeTTa source code
 * @param {TermFactory} termFactory - Optional term factory
 * @param {Object} options - Parser options
 * @returns {Array<Task>} - Array of SeNARS tasks
 */
export function parseMeTTaToNars(mettaString, termFactory = null, options = {}) {
    const parser = new MeTTaParser(termFactory, options);
    return parser.parseMeTTa(mettaString);
}

/**
 * Convenience function to parse a single MeTTa expression to a term
 * @param {string} mettaExpr - Single MeTTa expression
 * @param {TermFactory} termFactory - Optional term factory
 * @returns {Term} - SeNARS term
 */
export function parseMeTTaExpression(mettaExpr, termFactory = null) {
    const parser = new MeTTaParser(termFactory);
    return parser.parseExpression(mettaExpr);
}