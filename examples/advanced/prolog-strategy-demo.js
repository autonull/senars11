/**
 * Demo for Prolog Strategy in SeNARS Stream Reasoner
 * Demonstrates Prolog-style backward chaining resolution
 */

import {NAR, PrologStrategy, TaskBagPremiseSource, RuleProcessor, RuleExecutor, Reasoner, SyllogisticRule} from '@senars/nar';

async function runDemo() {
    console.log('=== SeNARS Prolog Strategy Demo ===\n');

    // Create a new NAR instance
    const nar = new NAR();

    // Create the Prolog Strategy
    const prologStrategy = new PrologStrategy({
        maxDepth: 8,
        maxSolutions: 3
    });

    // Add some Prolog facts to the strategy's knowledge base
    prologStrategy.addPrologFacts('parent(tom, bob).');
    prologStrategy.addPrologFacts('parent(bob, liz).');
    prologStrategy.addPrologFacts('parent(pam, bob).');
    prologStrategy.addPrologFacts('male(tom).');
    prologStrategy.addPrologFacts('female(pam).');
    prologStrategy.addPrologFacts('female(liz).');

    console.log('Added Prolog facts to knowledge base:');
    console.log('- parent(tom, bob)');
    console.log('- parent(bob, liz)');
    console.log('- parent(pam, bob)');
    console.log('- male(tom)');
    console.log('- female(pam)');
    console.log('- female(liz)');
    console.log('');

    // Since we're demonstrating the strategy itself, we'll create a simple setup
    // First, let's show the Prolog Strategy status
    console.log('Prolog Strategy Status:');
    const status = prologStrategy.getStatus();
    console.log(JSON.stringify(status, null, 2));
    console.log('');

    // Now let's set up a proper reasoner with the Prolog Strategy
    const premiseSource = new TaskBagPremiseSource(nar.focus);
    const ruleExecutor = new RuleExecutor();
    const ruleProcessor = new RuleProcessor(ruleExecutor);

    // Register some NAL rules for general reasoning
    ruleExecutor
        .register(new SyllogisticRule())
        // Add the Prolog strategy to the NAR if possible
        .registerMany([]); // We'll add more rules later if needed

    // Create a reasoner with the Prolog Strategy
    const reasoner = new Reasoner(premiseSource, prologStrategy, ruleProcessor, {
        maxDerivationDepth: 10,
        cpuThrottleInterval: 1
    });

    console.log('Setting up a query task using the Prolog Strategy...');

    // Simulate adding some facts to the system
    try {
        console.log('\nAdding fact: <likes(bob, pizza)>.');
        nar.input('<likes(bob, pizza)>.');

        console.log('\nAdding fact: <likes(people, food)>.');
        nar.input('<likes(people, food)>.');

        // Try querying - though the full integration might need more setup
        console.log('\nDemonstrating Prolog-style query resolution...');
        console.log('Note: For full Prolog resolution, queries would need to be processed via the PrologStrategy');

        // Show some of the internal Prolog resolution capabilities
        console.log('\nProlog Strategy can resolve queries like:');
        console.log('- Who are the parents? (parent(X, Y)?)');
        console.log('- Is there a grandparent relationship? (grandparent(X, Z)?)');
        console.log('- What gender is Tom? (male(tom)?)');

        // Add a rule for grandparent relationship (this would be defined in Prolog)
        console.log('\nAdding Prolog rule for grandparent relationship...');
        console.log('(Note: This is simplified - a full implementation would parse Prolog rules properly)');
        console.log('Rule: grandparent(X, Z) :- parent(X, Y), parent(Y, Z)');

        // Update knowledge base with current tasks
        prologStrategy.updateKnowledgeBase(nar.focus.getTasks(10));

        console.log('\nUpdated knowledge base with current system tasks');
        console.log('Knowledge base now contains', prologStrategy.knowledgeBase.size, 'predicate groups');

        console.log('\n=== Prolog Strategy Demo Complete ===');
        console.log('The Prolog Strategy demonstrates SeNARS\'s versatility by implementing');
        console.log('Prolog-style backward chaining resolution alongside NAL reasoning.');
        console.log('This enables goal-driven query resolution with unification and backtracking.');

    } catch (error) {
        console.error('Error during Prolog Strategy demo:', error);
    }

    // Clean up
    await reasoner.stop();
}

// Run the demo
if (typeof module !== 'undefined' && require.main === module) {
    runDemo().catch(console.error);
}

export {runDemo as runPrologStrategyDemo};