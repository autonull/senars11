/**
 * Parser.js - String to Atom parser
 * Converts MeTTa source code strings to atom structures
 */

import { sym, var_, exp } from './kernel/Term.js';

export class Parser {
    constructor() {
        this.tokenizer = new Tokenizer();
    }

    /**
     * Parse a MeTTa string into an atom
     * @param {string} str - MeTTa source string
     * @returns {Object} Parsed atom
     */
    parse(str) {
        const tokens = this.tokenizer.tokenize(str);
        if (tokens.length === 0) return null;
        const parser = new InternalParser(tokens);
        return parser.parse();
    }

    /**
     * Parse a MeTTa program (multiple expressions)
     * @param {string} str - MeTTa source string
     * @returns {Array} Array of parsed atoms
     */
    parseProgram(str) {
        const tokens = this.tokenizer.tokenize(str);
        const parser = new InternalParser(tokens);
        return parser.parseProgram();
    }

    // Legacy method support
    parseExpression(str) {
        return this.parse(str);
    }
}

class Tokenizer {
    tokenize(str) {
        // Remove comments (starting with ; and going to end of line)
        const noComments = str.replace(/;.*/g, '');
        
        // Split into tokens while preserving parentheses
        const tokens = [];
        let currentToken = '';
        let inString = false;
        let stringDelimiter = null;
        
        for (let i = 0; i < noComments.length; i++) {
            const char = noComments[i];
            
            if (char === '"' || char === "'") {
                if (!inString) {
                    inString = true;
                    stringDelimiter = char;
                    currentToken += char;
                } else if (char === stringDelimiter) {
                    inString = false;
                    currentToken += char;
                    tokens.push(currentToken);
                    currentToken = '';
                    stringDelimiter = null;
                } else {
                    currentToken += char;
                }
            } else if (inString) {
                currentToken += char;
            } else if (char === '(' || char === ')') {
                if (currentToken.trim() !== '') {
                    tokens.push(currentToken.trim());
                    currentToken = '';
                }
                tokens.push(char);
            } else if (/\s/.test(char)) {
                if (currentToken.trim() !== '') {
                    tokens.push(currentToken.trim());
                    currentToken = '';
                }
            } else {
                currentToken += char;
            }
        }
        
        if (currentToken.trim() !== '') {
            tokens.push(currentToken.trim());
        }
        
        return tokens;
    }
}

class InternalParser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    parse() {
        if (this.pos >= this.tokens.length) {
            return null;
        }
        
        const token = this.tokens[this.pos];
        
        if (token === '(') {
            return this.parseExpression();
        } else if (token.startsWith('$')) { // Changed ? to $ for variables
            this.pos++;
            return var_(token);
        } else {
            this.pos++;
            return sym(token);
        }
    }

    parseExpression() {
        if (this.tokens[this.pos] !== '(') {
            throw new Error(`Expected '(', got: ${this.tokens[this.pos]}`);
        }
        
        this.pos++; // Skip '('
        
        // Handle empty list ()
        if (this.tokens[this.pos] === ')') {
            this.pos++;
            return sym('()');
        }

        const components = [];
        
        while (this.pos < this.tokens.length && this.tokens[this.pos] !== ')') {
            if (this.tokens[this.pos] === '(') {
                components.push(this.parseExpression());
            } else if (this.tokens[this.pos].startsWith('$')) { // Changed ? to $
                components.push(var_(this.tokens[this.pos]));
                this.pos++;
            } else {
                components.push(sym(this.tokens[this.pos]));
                this.pos++;
            }
        }
        
        if (this.pos >= this.tokens.length) {
            throw new Error("Unexpected end of input, expected ')'");
        }
        
        this.pos++; // Skip ')'
        
        // Check if we have an operator (first component) and arguments
        if (components.length > 0) {
            const operator = components[0];
            const args = components.slice(1);

            // Pass the operator atom directly to exp
            // This ensures variables in head position (like $f) are preserved as atoms
            // and can be substituted during unification
            return exp(operator, args);
        }

        // Fallback for empty list (should be handled earlier)
        return sym('()');
    }

    parseProgram() {
        const expressions = [];
        
        while (this.pos < this.tokens.length) {
            const token = this.tokens[this.pos];
            // Basic validity check for start of expression
            if (token === '(' || token.startsWith('$') || token.length > 0) {
                expressions.push(this.parse());
            } else {
                this.pos++;
            }
        }
        
        return expressions;
    }
}
