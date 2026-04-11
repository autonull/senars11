#!/usr/bin/env node
/**
 * Complete MeTTa Interpreter Demo
 * Demonstrates full MeTTa/Hyperon integration with SeNARS
 */

import {MeTTaInterpreter, TermFactory} from '@senars/nar';

console.log('='.repeat(70));
console.log('MeTTa/Hyperon Interpreter Demo - Complete Integration');
console.log('='.repeat(70));

// Initialize
const termFactory = new TermFactory();
const interpreter = new MeTTaInterpreter(null, {
    termFactory,
    typeChecking: false
});

console.log('\n✓ Interpreter initialized with all subsystems\n');

// Example 1: Basic evaluation with reduction
console.log('1. Arithmetic Evaluation (Reduction Engine)');
console.log('   MeTTa: (+ 10 32)');
const result1 = interpreter.run('!(+ 10 32)');
console.log(`   Result: ${result1[0]?.toString()}\n`);

// Example 2: Pattern matching with match
console.log('2. Pattern Matching (Match Engine)');
interpreter.load(`
    (= (human Socrates) True)
    (= (human Plato) True)
    (= (mortal $x) (human $x))
`);
const humans = interpreter.query(
    termFactory.equality(
        termFactory.predicate(
            termFactory.atomic('human'),
            termFactory.product(termFactory.atomic('$x'))
        ),
        termFactory.createTrue()
    ),
    termFactory.atomic('$x')
);
console.log('   Loaded: (human Socrates), (human Plato)');
console.log('   Query: Who is human?');
console.log(`   Results: ${humans.map(h => h.toString()).join(', ')}\n`);

// Example 3: Type annotations
console.log('3. Type System');
interpreter.load('(: Socrates Human)');
const term = termFactory.atomic('42');
const type = interpreter.typeSystem.inferType(term);
console.log(`   Inferred type of "42": ${type}\n`);

// Example 4: Non-determinism
console.log('4. Non-Determinism (Superpose/Collapse)');
const superpos = interpreter.nonDeterminism.superpose(1, 2, 3, 4, 5);
console.log(`   Superposition: ${superpos.toString()}`);
const collapsed = interpreter.nonDeterminism.collapse(superpos);
console.log(`   Collapsed to: ${collapsed}\n`);

// Example 5: Grounded atoms
console.log('5. Grounded Atoms (Built-in Operations)');
const sum = interpreter.groundedAtoms.execute('&+',
    termFactory.atomic('10'),
    termFactory.atomic('20')
);
console.log(`   &+ 10 20 = ${sum.toString()}`);

const comparison = interpreter.groundedAtoms.execute('&>',
    termFactory.atomic('5'),
    termFactory.atomic('3')
);
console.log(`   &> 5 3 = ${comparison.toString()}\n`);

// Example 6: State management
console.log('6. State Management');
const stateId = interpreter.stateManager.newState(termFactory.atomic('initial'));
console.log(`   Created state: ${stateId}`);
interpreter.stateManager.changeState(stateId, termFactory.atomic('modified'));
const currentValue = interpreter.stateManager.getState(stateId);
console.log(`   Current value: ${currentValue.toString()}\n`);

// Example 7: Macro expansion
console.log('7. Macro Expansion');
interpreter.macroExpander.defineMacro(
    'when',
    termFactory.predicate(
        termFactory.atomic('when'),
        termFactory.product(
            termFactory.atomic('$cond'),
            termFactory.atomic('$body')
        )
    ),
    termFactory.predicate(
        termFactory.atomic('if'),
        termFactory.product(
            termFactory.atomic('$cond'),
            termFactory.atomic('$body'),
            termFactory.atomic('Empty')
        )
    )
);
console.log('   Defined macro: (when $cond $body) → (if $cond $body Empty)');

const macroTest = termFactory.predicate(
    termFactory.atomic('when'),
    termFactory.product(
        termFactory.createTrue(),
        termFactory.atomic('action')
    )
);
const expanded = interpreter.macroExpander.expand(macroTest);
console.log(`   Expanded: ${expanded.toString()}\n`);

// Example 8: Complete MeTTa program
console.log('8. Complete MeTTa Program');
const program = `
; Define knowledge
(= (parent Bob Alice) True)
(= (parent Alice Charlie) True)

; Define rules
(= (grandparent $x $z)
   (and (parent $x $y) (parent $y $z)))

; Query (commented, would need full evaluation)
; !(grandparent Bob Charlie)
`;
interpreter.load(program);
console.log('   Loaded complete program with facts and rules');
console.log(`   Space now contains ${interpreter.space.getAtomCount()} atoms\n`);

// Statistics
console.log('='.repeat(70));
console.log('Interpreter Statistics:');
console.log('='.repeat(70));
const stats = interpreter.getStats();
console.log(`Atoms in space: ${stats.space.atomCount}`);
console.log(`Reduction rules: ${stats.reductionEngine.ruleCount}`);
console.log(`Macros defined: ${stats.macroExpander.macroCount}`);
console.log(`Grounded atoms: ${stats.groundedAtoms.groundedCount}`);
console.log(`States created: ${stats.stateManager.stateCount}`);
console.log(`Type rules: ${stats.typeSystem.typeRules}`);

console.log('\n' + '='.repeat(70));
console.log('Demo Complete! Full MeTTa/Hyperon integration working.');
console.log('='.repeat(70));
