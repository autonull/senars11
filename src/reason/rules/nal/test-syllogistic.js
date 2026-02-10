/**
 * Test for the new Syllogistic Rule
 */

import {SyllogisticRule} from './SyllogisticRule.js';
import {Task} from '../../../task/Task.js';
import {Truth} from '../../../Truth.js';
import {ArrayStamp} from '../../../Stamp.js';
import {TermFactory} from '../../../term/TermFactory.js';

// Create a simple context for testing
const termFactory = new TermFactory();

// Create test tasks for syllogism: <man --> mortal> and <Socrates --> man>
const manMortalTask = new Task({
    term: termFactory.atomic('<man --> mortal>'),
    punctuation: '.',
    truth: new Truth(1.0, 0.9),
    stamp: new ArrayStamp({creationTime: 1})
});

const socratesManTask = new Task({
    term: termFactory.atomic('<Socrates --> man>'),
    punctuation: '.',
    truth: new Truth(1.0, 0.8),
    stamp: new ArrayStamp({creationTime: 2})
});

const rule = new SyllogisticRule();

console.log('Testing Syllogistic Rule...');
console.log('Primary premise:', manMortalTask.term.toString());
console.log('Secondary premise:', socratesManTask.term.toString());

// Test if the rule can be applied
const canApply = rule.canApply(manMortalTask, socratesManTask, {termFactory});
console.log('Can apply:', canApply);

// Test the application
const context = {termFactory};
const results = rule.apply(manMortalTask, socratesManTask, context);
console.log('Results count:', results.length);

if (results.length > 0) {
    console.log('Derived task:', results[0].term.toString());
    console.log('Derived truth:', results[0].truth.toString());
} else {
    console.log('No results derived - checking other order');

    // Try the other order: syllogism with <Socrates --> man> and <man --> mortal>
    const canApply2 = rule.canApply(socratesManTask, manMortalTask, {termFactory});
    console.log('Can apply (other order):', canApply2);

    const results2 = rule.apply(socratesManTask, manMortalTask, context);
    console.log('Results count (other order):', results2.length);

    if (results2.length > 0) {
        console.log('Derived task:', results2[0].term.toString());
        console.log('Derived truth:', results2[0].truth.toString());
    }
}

console.log('Syllogistic rule test completed.');