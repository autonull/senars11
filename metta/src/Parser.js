/**
 * Parser.js - String to Atom parser
 * Converts MeTTa source code strings to atom structures
 * Following AGENTS.md: Elegant, Consolidated, Consistent, Organized, Deeply deduplicated
 */

import { Tokenizer } from './parser/Tokenizer.js';
import { InternalParser } from './parser/InternalParser.js';

export class Parser {
    constructor() {
        this.tokenizer = new Tokenizer();
    }

    /**
     * Parse a single expression from a string
     */
    parse(str) {
        const tokens = this.tokenizer.tokenize(str);
        return tokens.length ? new InternalParser(tokens).parse() : null;
    }

    /**
     * Parse a program (sequence of expressions) from a string
     */
    parseProgram(str) {
        const tokens = this.tokenizer.tokenize(str);
        return new InternalParser(tokens).parseProgram();
    }

    /**
     * Legacy support for parsing expressions
     */
    parseExpression(str) {
        return this.parse(str);
    }
}
