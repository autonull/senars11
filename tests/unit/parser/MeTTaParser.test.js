import {TermFactory, Term} from '@senars/nar';
import {MeTTaParser, parseMeTTaToNars, parseMeTTaExpression} from '@senars/nar/src/parser/MeTTaParser.js';

describe('MeTTaParser', () => {
    let parser, termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
        parser = new MeTTaParser(termFactory);
    });

    describe('Tokenization', () => {
        test('handles comments', () => {
            const tasks = parser.parseMeTTa('; This is a comment\nfoo');
            expect(tasks).toHaveLength(1);
            expect(tasks[0].term.name).toBe('foo');
        });

        test('handles strings', () => {
            const term = parser.parseExpression('"hello world"');
            expect(term.name).toBe('"hello world"');
        });

        test('handles escape sequences in strings', () => {
            const term = parser.parseExpression('"line1\\nline2"');
            expect(term.name).toContain('\n');
        });
    });

    describe('Atom Parsing', () => {
        test('parses symbols', () => {
            const term = parser.parseExpression('foo');
            expect(term.name).toBe('foo');
        });

        test('parses variables with $ prefix', () => {
            const term = parser.parseExpression('$x');
            expect(term.name).toBe('$x');
        });

        test('parses numbers', () => {
            const term = parser.parseExpression('42');
            expect(term.name).toBe('42');
        });

        test('parses negative numbers', () => {
            const term = parser.parseExpression('-3.14');
            expect(term.name).toBe('-3.14');
        });

        test('parses grounded atoms', () => {
            const term = parser.parseExpression('&self');
            expect(term.name).toBe('&self');
        });

        test('parses True as special atom', () => {
            const term = parser.parseExpression('True');
            expect(term.name).toBe('True');
        });

        test('parses False as special atom', () => {
            const term = parser.parseExpression('False');
            expect(term.name).toBe('False');
        });
    });

    describe('Expression Parsing', () => {
        test('parses empty expression', () => {
            const term = parser.parseExpression('()');
            expect(term.name).toBe('()');
        });

        test('parses single-element expression', () => {
            const term = parser.parseExpression('(foo)');
            expect(term.name).toBe('foo');
        });

        test('parses nested expressions', () => {
            const term = parser.parseExpression('(f (g x))');
            expect(term).toBeInstanceOf(Term);
            expect(term.operator).toBe('^');
        });
    });

    describe('Functor Application (^)', () => {
        test('(f x y) maps to functor + product', () => {
            const term = parser.parseExpression('(f x y)');
            // Should be (^, f, (*, x, y))
            expect(term.operator).toBe('^');
            expect(term.components[0].name).toBe('f');
            expect(term.components[1].operator).toBe('*');
        });

        test('(add 1 2) produces correct functor structure', () => {
            const term = parser.parseExpression('(add 1 2)');
            expect(term.operator).toBe('^');
            const [head, args] = term.components;
            expect(head.name).toBe('add');
            expect(args.components[0].name).toBe('1');
            expect(args.components[1].name).toBe('2');
        });
    });

    describe('Equality Operator (=)', () => {
        test('(= A B) maps to equality', () => {
            const term = parser.parseExpression('(= A B)');
            expect(term.operator).toBe('=');
            expect(term.components).toHaveLength(2);
        });

        test('(= (f x) result) handles nested expressions', () => {
            const term = parser.parseExpression('(= (f x) result)');
            expect(term.operator).toBe('=');
            expect(term.components[0].operator).toBe('^');
        });
    });

    describe('Type Annotations (:)', () => {
        test('(: term Type) maps to inheritance', () => {
            const term = parser.parseExpression('(: Socrates Human)');
            expect(term.operator).toBe('-->');
        });
    });

    describe('Logical Operators', () => {
        test('(and A B) maps to conjunction', () => {
            const term = parser.parseExpression('(and A B)');
            expect(term.operator).toBe('&');
        });

        test('(or A B) maps to disjunction', () => {
            const term = parser.parseExpression('(or A B)');
            expect(term.operator).toBe('|');
        });

        test('(not A) maps to negation', () => {
            const term = parser.parseExpression('(not A)');
            expect(term.operator).toBe('--');
        });

        test('(implies A B) maps to implication', () => {
            const term = parser.parseExpression('(implies A B)');
            expect(term.operator).toBe('==>');
        });
    });

    describe('Set Constructors', () => {
        test('[a b c] parses as intensional set', () => {
            const term = parser.parseExpression('[a b c]');
            expect(term.operator).toBe('[]');
            expect(term.components).toHaveLength(3);
        });

        test('{a b c} parses as extensional set', () => {
            const term = parser.parseExpression('{a b c}');
            expect(term.operator).toBe('{}');
            expect(term.components).toHaveLength(3);
        });
    });

    describe('Control Flow Constructs', () => {
        test('(if cond then else) preserves structure', () => {
            const term = parser.parseExpression('(if cond then else)');
            expect(term.operator).toBe('^');
            expect(term.components[0].name).toBe('if');
        });

        test('(let $x val body) preserves structure', () => {
            const term = parser.parseExpression('(let $x 1 (f $x))');
            expect(term.operator).toBe('^');
            expect(term.components[0].name).toBe('let');
        });

        test('(match space pattern template) preserves structure', () => {
            const term = parser.parseExpression('(match &self (human $x) $x)');
            expect(term.operator).toBe('^');
            expect(term.components[0].name).toBe('match');
        });
    });

    describe('Task Generation', () => {
        test('generates belief tasks by default', () => {
            const tasks = parser.parseMeTTa('(= A B)');
            expect(tasks).toHaveLength(1);
            expect(tasks[0].punctuation).toBe('.');
        });

        test('! prefix generates goal tasks', () => {
            const tasks = parser.parseMeTTa('!(query x)');
            expect(tasks).toHaveLength(1);
            expect(tasks[0].punctuation).toBe('!');
        });

        test('parses multiple expressions', () => {
            const tasks = parser.parseMeTTa(`
                (= fact1 True)
                (= fact2 True)
                !(query)
            `);
            expect(tasks).toHaveLength(3);
            expect(tasks[0].punctuation).toBe('.');
            expect(tasks[1].punctuation).toBe('.');
            expect(tasks[2].punctuation).toBe('!');
        });
    });

    describe('Configurable Mappings', () => {
        test('accepts custom mappings in constructor', () => {
            const customParser = new MeTTaParser(termFactory, {
                mappings: {
                    'myop': (tf, args) => tf.create('custom-op', args)
                }
            });
            const term = customParser.parseExpression('(myop a b)');
            expect(term.operator).toBe('custom-op');
        });

        test('addMapping works dynamically', () => {
            parser.addMapping('dynop', (tf, args) => tf.similarity(args[0], args[1]));
            const term = parser.parseExpression('(dynop A B)');
            expect(term.operator).toBe('<->');
        });

        test('getMappings returns current mappings', () => {
            const mappings = parser.getMappings();
            expect(mappings['=']).toBeDefined();
            expect(mappings['and']).toBeDefined();
        });
    });

    describe('Convenience Functions', () => {
        test('parseMeTTaToNars works', () => {
            const tasks = parseMeTTaToNars('(= A B)');
            expect(tasks).toHaveLength(1);
            expect(tasks[0].term.operator).toBe('=');
        });

        test('parseMeTTaExpression works', () => {
            const term = parseMeTTaExpression('(f x)');
            expect(term.operator).toBe('^');
        });
    });

    describe('Edge Cases', () => {
        test('handles empty input', () => {
            expect(parser.parseMeTTa('')).toEqual([]);
            expect(parser.parseMeTTa(null)).toEqual([]);
        });

        test('handles whitespace-only input', () => {
            expect(parser.parseMeTTa('   \n\t  ')).toEqual([]);
        });

        test('handles symbols with special characters', () => {
            const term = parser.parseExpression('foo-bar_baz');
            expect(term.name).toBe('foo-bar_baz');
        });

        test('handles unicode symbols', () => {
            const term = parser.parseExpression('λ');
            expect(term.name).toBe('λ');
        });
    });

    describe('Complex Examples', () => {
        test('parses MeTTa-style rule definition', () => {
            const tasks = parser.parseMeTTa(`
                (= (mortal $x) 
                   (human $x))
            `);
            expect(tasks).toHaveLength(1);
            expect(tasks[0].term.operator).toBe('=');
        });

        test('parses type hierarchy', () => {
            const tasks = parser.parseMeTTa(`
                (: Socrates Human)
                (: Human Mortal)
            `);
            expect(tasks).toHaveLength(2);
            expect(tasks[0].term.operator).toBe('-->');
            expect(tasks[1].term.operator).toBe('-->');
        });
    });
});
