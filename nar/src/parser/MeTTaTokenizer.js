/**
 * MeTTa Tokenizer
 * Handles tokenization for MeTTa S-expressions
 */

export const TokenType = {
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    LBRACKET: 'LBRACKET',
    RBRACKET: 'RBRACKET',
    LBRACE: 'LBRACE',
    RBRACE: 'RBRACE',
    SYMBOL: 'SYMBOL',
    VARIABLE: 'VARIABLE',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    BANG: 'BANG',
    GROUNDED: 'GROUNDED',
    EOF: 'EOF'
};

export class MeTTaTokenizer {
    constructor(input) {
        this.input = input;
        this.pos = 0;
        this.tokens = [];
    }

    tokenize() {
        while (this.pos < this.input.length) {
            this._skipWhitespaceAndComments();
            if (this.pos >= this.input.length) break;

            const char = this.input[this.pos];

            if (char === '(') {
                this.tokens.push({ type: TokenType.LPAREN, value: '(' });
                this.pos++;
            } else if (char === ')') {
                this.tokens.push({ type: TokenType.RPAREN, value: ')' });
                this.pos++;
            } else if (char === '[') {
                this.tokens.push({ type: TokenType.LBRACKET, value: '[' });
                this.pos++;
            } else if (char === ']') {
                this.tokens.push({ type: TokenType.RBRACKET, value: ']' });
                this.pos++;
            } else if (char === '{') {
                this.tokens.push({ type: TokenType.LBRACE, value: '{' });
                this.pos++;
            } else if (char === '}') {
                this.tokens.push({ type: TokenType.RBRACE, value: '}' });
                this.pos++;
            } else if (char === '!') {
                this.tokens.push({ type: TokenType.BANG, value: '!' });
                this.pos++;
            } else if (char === '"') {
                this.tokens.push(this._readString());
            } else if (char === '$') {
                this.tokens.push(this._readVariable());
            } else if (char === '&') {
                this.tokens.push(this._readGrounded());
            } else if (this._isNumberStart(char)) {
                this.tokens.push(this._readNumber());
            } else {
                this.tokens.push(this._readSymbol());
            }
        }

        this.tokens.push({ type: TokenType.EOF, value: null });
        return this.tokens;
    }

    _skipWhitespaceAndComments() {
        while (this.pos < this.input.length) {
            const char = this.input[this.pos];
            if (/\s/.test(char)) {
                this.pos++;
            } else if (char === ';') {
                // Skip line comment
                while (this.pos < this.input.length && this.input[this.pos] !== '\n') {
                    this.pos++;
                }
            } else {
                break;
            }
        }
    }

    _readString() {
        this.pos++; // Skip opening quote
        let value = '';
        while (this.pos < this.input.length && this.input[this.pos] !== '"') {
            if (this.input[this.pos] === '\\' && this.pos + 1 < this.input.length) {
                this.pos++;
                const escaped = this.input[this.pos];
                value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
            } else {
                value += this.input[this.pos];
            }
            this.pos++;
        }
        this.pos++; // Skip closing quote
        return { type: TokenType.STRING, value };
    }

    _readVariable() {
        let value = '$';
        this.pos++; // Skip $
        while (this.pos < this.input.length && this._isSymbolChar(this.input[this.pos])) {
            value += this.input[this.pos++];
        }
        return { type: TokenType.VARIABLE, value };
    }

    _readGrounded() {
        let value = '&';
        this.pos++; // Skip &
        while (this.pos < this.input.length && this._isSymbolChar(this.input[this.pos])) {
            value += this.input[this.pos++];
        }
        return { type: TokenType.GROUNDED, value };
    }

    _isNumberStart(char) {
        return /[0-9]/.test(char) || (char === '-' && this.pos + 1 < this.input.length && /[0-9]/.test(this.input[this.pos + 1]));
    }

    _readNumber() {
        let value = '';
        if (this.input[this.pos] === '-') {
            value += this.input[this.pos++];
        }
        while (this.pos < this.input.length && /[0-9.]/.test(this.input[this.pos])) {
            value += this.input[this.pos++];
        }
        return { type: TokenType.NUMBER, value };
    }

    _readSymbol() {
        let value = '';
        while (this.pos < this.input.length && this._isSymbolChar(this.input[this.pos])) {
            value += this.input[this.pos++];
        }
        return { type: TokenType.SYMBOL, value };
    }

    _isSymbolChar(char) {
        return !/[\s()\[\]{}";]/.test(char);
    }
}
