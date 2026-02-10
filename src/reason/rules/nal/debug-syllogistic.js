import {SyllogisticRule} from './SyllogisticRule.js';
import {Task} from '../../../task/Task.js';
import {Truth} from '../../../Truth.js';
import {ArrayStamp} from '../../../Stamp.js';
import {TermFactory} from '../../../term/TermFactory.js';

// Create a simple context for testing
const termFactory = new TermFactory();

// Create test terms manually to ensure structure
const manTerm = termFactory.atomic('man');
const mortalTerm = termFactory.atomic('mortal');
const socratesTerm = termFactory.atomic('Socrates');

// Create compound terms
const manMortalTerm = termFactory.inheritance(manTerm, mortalTerm);
const socratesManTerm = termFactory.inheritance(socratesTerm, manTerm);

console.log('Debug - Term structures:');
console.log('manMortalTerm:', manMortalTerm.toString());
console.log('  isCompound:', manMortalTerm.isCompound);
console.log('  operator:', manMortalTerm.operator);
console.log('  components:', manMortalTerm.components.map(c => c.toString()));
console.log('socratesManTerm:', socratesManTerm.toString());
console.log('  isCompound:', socratesManTerm.isCompound);
console.log('  operator:', socratesManTerm.operator);
console.log('  components:', socratesManTerm.components.map(c => c.toString()));

// Create tasks with these terms
const manMortalTask = new Task({
    term: manMortalTerm,
    punctuation: '.',
    truth: new Truth(1.0, 0.9),
    stamp: new ArrayStamp({creationTime: 1})
});

const socratesManTask = new Task({
    term: socratesManTerm,
    punctuation: '.',
    truth: new Truth(1.0, 0.8),
    stamp: new ArrayStamp({creationTime: 2})
});

const rule = new SyllogisticRule();

console.log('\nTesting Syllogistic Rule...');
console.log('Primary premise:', manMortalTask.term.toString());
console.log('  Subject:', manMortalTask.term.components[0].toString());
console.log('  Object:', manMortalTask.term.components[1].toString());
console.log('Secondary premise:', socratesManTask.term.toString());
console.log('  Subject:', socratesManTask.term.components[0].toString());
console.log('  Object:', socratesManTask.term.components[1].toString());

// The expected syllogistic pattern is:
// (Socrates --> man) + (man --> mortal) => (Socrates --> mortal)
// So we want the object of first premise to match subject of second premise
const match1 = socratesManTask.term.components[1].equals(manMortalTask.term.components[0]); // man === man
const match2 = manMortalTask.term.components[1].equals(socratesManTask.term.components[0]); // mortal === Socrates (no)

console.log('\nComponent equality checks:');
console.log('socratesManTask.object (man) == manMortalTask.subject (man):', match1);
console.log('manMortalTask.object (mortal) == socratesManTask.subject (Socrates):', match2);

// Test if the rule can be applied
const canApply = rule.canApply(socratesManTask, manMortalTask, {termFactory});
console.log('\nCan apply (socratesMan + manMortal):', canApply);

// Test the application
const context = {termFactory};
const results = rule.apply(socratesManTask, manMortalTask, context);
console.log('Results count:', results.length);

if (results.length > 0) {
    console.log('Derived task:', results[0].term.toString());
    console.log('Derived truth:', results[0].truth.toString());
} else {
    console.log('No results derived');

    // Test the other order just for verification
    const canApply2 = rule.canApply(manMortalTask, socratesManTask, {termFactory});
    console.log('Can apply (manMortal + socratesMan):', canApply2);

    const results2 = rule.apply(manMortalTask, socratesManTask, context);
    console.log('Results count (manMortal + socratesMan):', results2.length);
}

console.log('Syllogistic rule test completed.');