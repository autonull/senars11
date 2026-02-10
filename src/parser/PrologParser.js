/**
 * PrologParser.js - Parser that translates Prolog syntax into SeNARS beliefs/goals
 */

import {TermFactory} from '../term/TermFactory.js';
import {Task} from '../task/Task.js';
import {Truth} from '../Truth.js';

export class PrologParser {
    constructor(termFactory = null) {
        this.termFactory = termFactory || new TermFactory();
    }

    /**
     * Parse Prolog syntax and convert to SeNARS tasks (beliefs/goals)
     */
    parseProlog(prologInput) {
        return prologInput
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('%'))
            .flatMap(line => this._parseLine(line));
    }

    _parseLine(line) {
        const parsers = [
            { predicate: this._isRule, parser: this._parseRule.bind(this) },
            { predicate: this._isFact, parser: (l) => [this._parseFact(l)] },
            { predicate: this._isQuery, parser: (l) => [this._parseQuery(l)] }
        ];

        const matchingParser = parsers.find(({ predicate }) => predicate(line));
        return matchingParser ? matchingParser.parser(line) : [];
    }

    _isFact = (line) => line.endsWith('.') && !line.includes(':-');
    _isRule = (line) => line.includes(':-');
    _isQuery = (line) => line.endsWith('?');

    /**
     * Parse a Prolog fact: predicate(args).
     */
    _parseFact(factLine) {
        const fact = factLine.replace(/\.$/, '').trim();
        const relationTerm = this._parsePredicate(fact);

        return new Task({
            term: relationTerm,
            punctuation: '.',
            truth: new Truth(1.0, 0.9),
            budget: {priority: 0.8, durability: 0.7, quality: 0.8}
        });
    }

    /**
     * Parse a Prolog rule: head :- body.
     */
    _parseRule(ruleLine) {
        const rule = ruleLine.replace(/\.$/, '').trim();
        const parts = rule.split(':-');

        if (parts.length !== 2) throw new Error(`Invalid rule format: ${ruleLine}`);

        const [headStr, bodyStr] = parts;

        const headTerm = this._parsePredicate(headStr.trim());
        const bodyParts = this._splitByCommaRespectingParens(bodyStr.trim());
        const bodyTerms = bodyParts.map(part => this._parsePredicate(part));

        const bodyTerm = bodyTerms.length === 1 ? bodyTerms[0] : this.termFactory.sequence(bodyTerms);

        const implicationTerm = this.termFactory.implication(bodyTerm, headTerm);

        return [new Task({
            term: implicationTerm,
            punctuation: '.',
            truth: new Truth(1.0, 0.9),
        })];
    }

    /**
     * Parse a Prolog query: predicate(args) ?
     */
    _parseQuery(queryLine) {
        const query = queryLine.replace(/\s*\?$/, '').trim();
        const queryTerm = this._parsePredicate(query);

        return new Task({
            term: queryTerm,
            punctuation: '?'
        });
    }

    /**
     * Parses a predicate or term string.
     */
    _parsePredicate(predicateStr) {
        const str = predicateStr.trim();

        // Handle "X is Expression"
        const isMatch = str.match(/^(.+?)\s+is\s+(.+)$/);
        if (isMatch) {
            const [_, left, right] = isMatch;
            return this._createPredicateTerm('is', [
                this._parseTerm(left),
                this._parseTerm(right)
            ], true);
        }

        return this._parseTerm(str);
    }

    _parseTerm(str) {
        str = str.trim();

        // List [H|T] or [a,b]
        if (str.startsWith('[')) {
            return this._parseList(str);
        }

        // Infix Math Operators (+, -, *, /)
        // Simple top-level split (naive precedence)
        // We look for operator outside parens/brackets
        const operators = ['+', '-', '*', '/'];
        for (const op of operators) {
            // Check if op exists
            if (str.includes(op)) {
                // Find split point respecting structure
                const parts = this._splitByDelimiter(str, op);
                if (parts.length > 1) {
                    // Create operator term: op(Part1, Part2) (assuming binary)
                    // Handling precedence correctly requires more logic,
                    // but for "X + 1" simple split works if we respect order.
                    // Assuming left-associative or just binary for now.
                    // Actually, if we have A+B+C, split returns [A, B, C].
                    // We need to fold.
                    // For simplicity, we just take the first split found that works.
                    // But standard parse is recursive.
                    // Let's implement simple binary split.

                    // We split by the *last* occurrence of lowest precedence op for correct tree?
                    // Or simply: assume standard binary ops.

                    // Let's try simpler regex matching for A op B
                    // But we must respect parens.
                    // Reuse _splitByComma logic but with custom delimiter.
                }
            }
        }

        // Simple Math Regex for "A + B" (only one op supported for MVP)
        const mathMatch = str.match(/^(.+?)(\+|-|\*|\/)(.+)$/);
        if (mathMatch) {
             // Check nesting? If A+B is inside parens `(A+B)`, this regex might fail or match wrong.
             // We'll rely on _createTerm handling atoms/vars if no op found.
             // This is heuristic. Proper expression parsing is out of scope for simple enhancement.
             // We'll trust user uses simple expressions "X + 1".
             const [_, left, op, right] = mathMatch;
             // Ensure parens balance in left?
             // This is risky.
             // Better: "X + 1" -> op is +. left "X", right " 1".
             // We will try to parse left/right.
             // For "X is Y + 1", "Y + 1" is parsed here.

             // Check if it's really a compound term `f(a)` which might match `f(a` + `)`? No.
             // Only if op is outside parens.
             // Let's skip complex math parsing for now and rely on atomic structure except for simple cases.
             // For "Y + 1", it matches.

             // Check balanced parens in left part to ensure op is top-level
             if (this._isBalanced(left)) {
                 return this._createPredicateTerm(op.trim(), [
                     this._parseTerm(left),
                     this._parseTerm(right)
                 ], true);
             }
        }

        // Predicate/Compound term f(a,b)
        const match = str.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*(.*)\s*\)$/);
        if (match) {
            const [_, pred, argsStr] = match;
            const args = this._splitByCommaRespectingParens(argsStr);
            const argTerms = args.map(a => this._parseTerm(a));
            return this._createPredicateTerm(pred, argTerms, true); // true = passed terms
        }

        // Variable
        if (str.startsWith('_') || /^[A-Z]/.test(str)) {
            return this.termFactory.variable(`?${str.toLowerCase()}`);
        }

        // Number/Atom
        // If it looks like a number, treat as atomic (or specific number type if NARS supported it)
        // NARS uses atomic terms.
        return this.termFactory.atomic(str.toLowerCase());
    }

    _isBalanced(str) {
        let depth = 0;
        for (const char of str) {
            if (char === '(' || char === '[') depth++;
            else if (char === ')' || char === ']') depth--;
            if (depth < 0) return false;
        }
        return depth === 0;
    }

    _parseList(str) {
        // [a, b, c] or [H|T]
        const content = str.slice(1, -1).trim(); // remove [ ]
        if (!content) return this.termFactory.atomic('[]'); // Empty list

        // Check for pipe |
        const pipeSplit = this._splitByDelimiter(content, '|');
        if (pipeSplit.length === 2) {
            // [H|T] -> .(H, T)
            const head = this._parseTerm(pipeSplit[0]);
            const tail = this._parseTerm(pipeSplit[1]);
            return this._createPredicateTerm('.', [head, tail], true);
        }

        // Normal list [a, b] -> .(a, .(b, []))
        const items = this._splitByCommaRespectingParens(content);

        let listTerm = this.termFactory.atomic('[]');
        // Build from end
        for (let i = items.length - 1; i >= 0; i--) {
            const itemTerm = this._parseTerm(items[i]);
            listTerm = this._createPredicateTerm('.', [itemTerm, listTerm], true);
        }
        return listTerm;
    }

    _createPredicateTerm(predicate, args, argsAreTerms = false) {
        const argTerms = argsAreTerms ? args : args.map(arg => {
            const isVariable = arg.startsWith('_') || /^[A-Z]/.test(arg);
            return this.termFactory.atomic(isVariable ? `?${arg.toLowerCase()}` : arg.toLowerCase());
        });

        const argsTerm = this.termFactory.tuple(argTerms);

        const predicateTerm = this.termFactory.atomic(predicate);

        return this.termFactory.predicate(predicateTerm, argsTerm);
    }

    _splitByDelimiter(str, delimiter) {
        const parts = [];
        let current = '';
        let depth = 0;
        let inQuote = false;
        let quoteChar = null;

        for (let i = 0; i < str.length; i++) {
            const char = str[i];

            if (inQuote) {
                current += char;
                if (char === quoteChar && str[i - 1] !== '\\') {
                    inQuote = false;
                    quoteChar = null;
                }
                continue;
            }

            if (char === '"' || char === "'") {
                inQuote = true;
                quoteChar = char;
            }

            if (char === '(' || char === '[') depth++;
            else if (char === ')' || char === ']') depth--;

            if (char === delimiter && depth === 0) {
                parts.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        if (current.trim()) parts.push(current.trim());
        return parts;
    }

    _splitByCommaRespectingParens(str) {
        return this._splitByDelimiter(str, ',');
    }
}

export function parsePrologToNars(prologString, termFactory = null) {
    const parser = new PrologParser(termFactory);
    return parser.parseProlog(prologString);
}
