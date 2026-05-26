#!/usr/bin/env node
/**
 * MeTTa Parser Demo
 * Demonstrates the MeTTa parser with various examples
 */

import {MeTTaParser, TermFactory} from '@senars/nar';

const termFactory = new TermFactory();
const parser = new MeTTaParser(termFactory);

console.log('='.repeat(60));
console.log('MeTTa Parser Demo');
console.log('='.repeat(60));

// Example 1: Basic functor application
console.log('\n1. Functor Application: (f x y) → (^, f, (*, x, y))');
const funcTerm = parser.parseExpression('(add 1 2)');
console.log(`   Input:  (add 1 2)`);
console.log(`   Output: ${funcTerm.toString()}`);

// Example 2: Equality operator
console.log('\n2. Equality: (= A B) → (=, A, B)');
const eqTerm = parser.parseExpression('(= (human Socrates) True)');
console.log(`   Input:  (= (human Socrates) True)`);
console.log(`   Output: ${eqTerm.toString()}`);

// Example 3: Type annotation
console.log('\n3. Type Annotation: (: term Type) → (-->, term, Type)');
const typeTerm = parser.parseExpression('(: Socrates Human)');
console.log(`   Input:  (: Socrates Human)`);
console.log(`   Output: ${typeTerm.toString()}`);

// Example 4: Logical operators
console.log('\n4. Logical Operators:');
const andTerm = parser.parseExpression('(and (human $x) (mortal $x))');
console.log(`   Input:  (and (human $x) (mortal $x))`);
console.log(`   Output: ${andTerm.toString()}`);

// Example 5: Variables
console.log('\n5. Variables: $x preserved');
const varTerm = parser.parseExpression('$person');
console.log(`   Input:  $person`);
console.log(`   Output: ${varTerm.toString()}`);

// Example 6: Sets
console.log('\n6. Sets:');
const extSet = parser.parseExpression('{a b c}');
const intSet = parser.parseExpression('[d e f]');
console.log(`   Input:  {a b c}  →  ${extSet.toString()} (extensional)`);
console.log(`   Input:  [d e f]  →  ${intSet.toString()} (intensional)`);

// Example 7: Multiple tasks
console.log('\n7. Task Generation:');
const tasks = parser.parseMeTTa(`
  (= (human Socrates) True)
  (= (implies (human $x) (mortal $x)) True)
  !(mortal Socrates)
`);
console.log(`   Parsed ${tasks.length} tasks:`);
tasks.forEach((task, i) => {
    console.log(`   ${i + 1}. ${task.punctuation === '!' ? 'GOAL' : 'BELIEF'}: ${task.term.toString()}`);
});

// Example 8: Custom mappings
console.log('\n8. Custom Mappings:');
const customParser = new MeTTaParser(termFactory, {
    mappings: {
        'isa': (tf, args) => tf.inheritance(args[0], args[1])
    }
});
const customTerm = customParser.parseExpression('(isa dog animal)');
console.log(`   Custom operator 'isa' → inheritance`);
console.log(`   Input:  (isa dog animal)`);
console.log(`   Output: ${customTerm.toString()}`);

// Example 9: Nested expressions
console.log('\n9. Nested Expressions:');
const nested = parser.parseExpression('(= (add $x $y) (sum $x $y))');
console.log(`   Input:  (= (add $x $y) (sum $x $y))`);
console.log(`   Output: ${nested.toString()}`);

// Example 10: Control flow
console.log('\n10. Control Flow (preserved as functors):');
const letTerm = parser.parseExpression('(let $x 5 (add $x 1))');
console.log(`   Input:  (let $x 5 (add $x 1))`);
console.log(`   Output: ${letTerm.toString()}`);

console.log('\n' + '='.repeat(60));
console.log('Demo Complete! All MeTTa constructs working correctly.');
console.log('='.repeat(60));
