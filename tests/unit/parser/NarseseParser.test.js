import {NarseseParser, Term, TermFactory} from '@senars/nar';

describe('NarseseParser', () => {
    let parser, termFactory;

    beforeEach(() => {
        parser = new NarseseParser();
        termFactory = new TermFactory();
    });

    describe('Basic Terms', () => {
        test.each([
            ['atomic', 'a.', 'a'],
            ['compound', '(a,b).', '(a, b)'],
            ['product', '(cat,dog).', '(cat, dog)']
        ])('%s', (_, input, expected) => {
            const result = parser.parse(input);
            expect(result.term).toBeInstanceOf(Term);
            expect(result.term.toString()).toBe(expected);
        });
    });

    describe('Statements & Punctuation', () => {
        test.each([
            ['question', 'a?', '?', 'QUESTION'],
            ['goal', 'a!', '!', 'GOAL'],
            ['belief', 'a.', '.', 'BELIEF'],
            ['quest', 'A@', '@', 'QUEST'],
            ['command', 'A;', ';', 'COMMAND']
        ])('%s', (_, input, punct, type) => {
            const result = parser.parse(input);
            expect(result.punctuation).toBe(punct);
            expect(result.taskType).toBe(type);
        });

        test('truth value', () => {
            expect(parser.parse('a. %1.0;0.9%').truthValue).toEqual({frequency: 1.0, confidence: 0.9});
        });
    });

    describe('Operators & Spacing', () => {
        const operators = [
            ['inheritance', '-->'], ['similarity', '<->'], ['equality', '='],
            ['conjunction', '&&'], ['disjunction', '||'], ['implication', '==>']
        ];

        test.each(operators)('%s tight', (name, op) => {
            const input = op === '==>' ? `<a${op}b>.` : `(a${op}b).`;
            expect(parser.parse(input).term.operator).toBe(op);
        });

        test.each(operators)('%s spaced', (name, op) => {
            const input = op === '==>' ? `<a ${op} b>.` : `(a ${op} b).`;
            expect(parser.parse(input).term.operator).toBe(op);
        });

        test('mixed brackets support', () => {
            expect(parser.parse('(a==>b).').term.operator).toBe('==>');
        });

        test('negation --A', () => {
            const result = parser.parse('--A.');
            expect(result.term.operator).toBe('--');
            expect(result.term.components[0].name).toBe('A');
        });

        test('difference operator <~>', () => {
            const result = parser.parse('<A <~> B>.');
            expect(result.term.operator).toBe('<~>');
        });

        test('compact inheritance A:B', () => {
            const result = parser.parse('A:B.');
            expect(result.term.operator).toBe('-->');
            expect(result.term.components[0].name).toBe('B');
            expect(result.term.components[1].name).toBe('A');
        });

        test.skip('delta operator ΔA - TODO: implement delta support in peggy grammar', () => {
            const result = parser.parse('ΔA.');
            expect(result.term.operator).toBe('Δ');
            expect(result.term.components[0].name).toBe('A');
        });
    });

    describe('Variables', () => {
        test.each([
            ['query', '?x.', '?x'],
            ['dependent', '$x.', '$x'],
            ['independent', '#x.', '#x'],
            ['pattern', '*.', '*']
        ])('%s variables', (_, input, expected) => {
            const result = parser.parse(input);
            expect(result.term.toString()).toBe(expected);
        });

        test('pattern variable in inheritance', () => {
            const result = parser.parse('(%v --> A).');
            const subj = result.term.components[0];
            expect(subj.name).toBe('%v');
        });

        test('products with variables', () => {
            const result = parser.parse('(?a, ?b).');
            expect(result.term.toString()).toBe('(?a, ?b)');
        });

        test('equality with variables', () => {
            const result = parser.parse('(?a = 1).');
            expect(result.term.toString()).toBe('(=, ?a, 1)');
        });

        test('complex expressions with variables', () => {
            const result = parser.parse('(add(?a, ?b) = 3).');
            expect(result.term.toString()).toBe('(=, (add, ?a, ?b), 3)');
        });

        test('complex back-solving formulas', () => {
            const result = parser.parse('((&, (?a = 1), (add(?a, ?b) = 3)) ==> accept(*, ?b)).');
            expect(result.term.toString()).toBe('(==>, (&, (=, ?a, 1), (=, (add, ?a, ?b), 3)), (accept, *, ?b))');
        });
    });

    describe('Comprehensive Format Support', () => {
        test.each([
            {input: 'cat.', desc: 'Atomic term with punctuation'},
            {input: '(cat --> animal).', desc: 'Parentheses with spaced inheritance'},
            {input: '<cat --> animal>.', desc: 'Angle brackets with spaced inheritance'},
            {input: '(a ==> b).', desc: 'Parentheses implication'},
            {input: '<a ==> b>.', desc: 'Angle implication'},
            {input: '(&, a, b).', desc: 'Prefix conjunction'},
            {input: '{a, b}.', desc: 'Extensional set'},
            {input: '[a].', desc: 'Intensional set (single element)'}
        ])('parses $desc: $input', ({input}) => {
            const result = parser.parse(input);
            expect(result?.term).toBeDefined();
        });
    });

    describe('Regression Tests', () => {
        test('tight operators with truth values', () => {
            const result = parser.parse('(a-->b). %1.0;0.9%');
            expect(result.term.toString()).toBe('(-->, a, b)');
            expect(result.truthValue).toEqual({frequency: 1.0, confidence: 0.9});
        });
    });
});
