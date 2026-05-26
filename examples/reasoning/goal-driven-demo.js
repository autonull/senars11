#!/usr/bin/env node
import {NAR} from '@senars/nar';
import {log, section, takeaways} from '../utils/demo-helpers.js';

async function demonstrateGoalDriven() {
    section('Goal-Driven Reasoning Demo');
    log('Demonstrating goal creation, pursuit, and achievement patterns\n');

    const nar = new NAR({lm: {enabled: false}});
    await nar.initialize();

    // 1. Setting up environment knowledge
    section('1️⃣  Environment Knowledge');
    await nar.input('<door --> object>. %0.9;0.9%');
    await nar.input('<key --> tool>. %0.9;0.9%');
    await nar.input('<<$x --> key> ==> <$x opens door>>. %0.9;0.8%');
    await nar.input('<golden-key --> key>. %0.95;0.9%');
    log('Knowledge added: keys open doors, golden-key is a key');

    // 2. Creating a goal
    section('2️⃣  Goal Creation');
    await nar.input('<door --> open>!');
    log('Goal: Make the door open');

    const goals = nar.getGoals();
    log(`Active goals: ${goals.length}`);
    goals.forEach((g, i) => {
        log(`  ${i + 1}. ${g.term.toString()} (desire: ${g.truth?.frequency?.toFixed(2) || 'N/A'})`);
    });

    // 3. Reasoning toward goal
    section('3️⃣  Goal-Directed Reasoning');
    log('Running 30 cycles to pursue goal...');
    await nar.runCycles(30);

    const beliefs = nar.getBeliefs();
    log(`\nBeliefs generated: ${beliefs.length}`);

    // Check for goal-relevant derivations
    const relevant = beliefs.filter(b => {
        const s = b.term.toString();
        return s.includes('open') || s.includes('key') || s.includes('door');
    });
    log(`Goal-relevant beliefs: ${relevant.length}`);
    relevant.slice(0, 5).forEach((b, i) => {
        log(`  ${i + 1}. ${b.term.toString()} ${b.truth?.toString() || ''}`);
    });

    // 4. Multi-step goal scenario
    section('4️⃣  Multi-Step Goal Scenario');
    await nar.input('<light --> device>. %0.9;0.9%');
    await nar.input('<<$x --> switch> ==> <$x controls light>>. %0.9;0.8%');
    await nar.input('<wall-switch --> switch>. %0.95;0.9%');
    await nar.input('<light --> on>!');
    log('Goal: Turn on the light');

    await nar.runCycles(30);

    const allGoals = nar.getGoals();
    log(`\nActive goals: ${allGoals.length}`);
    allGoals.forEach((g, i) => {
        log(`  ${i + 1}. ${g.term.toString()}`);
    });

    // 5. Goal achievement detection
    section('5️⃣  Goal Achievement Detection');
    await nar.input('<door --> open>. %1.0;0.9%');
    log('Belief added: door is open');

    const achievedGoals = nar.getGoals().filter(g => {
        const goalTerm = g.term.toString();
        return beliefs.some(b => b.term.toString() === goalTerm);
    });

    log(`Potentially achieved goals: ${achievedGoals.length}`);

    // 6. Goal priority
    section('6️⃣  Goal Priority Management');
    await nar.input('<food --> need>! %1.0;0.95%');
    await nar.input('<water --> need>! %1.0;0.98%');
    await nar.input('<sleep --> need>! %0.8;0.85%');

    const prioritizedGoals = nar.getGoals()
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    log('Goals by priority:');
    prioritizedGoals.slice(0, 5).forEach((g, i) => {
        log(`  ${i + 1}. ${g.term.toString()} (priority: ${g.priority?.toFixed(3) || 'N/A'})`);
    });

    // 7. Goal-based action planning
    section('7️⃣  Goal-Based Planning Pattern');
    log('Demonstrating planning toward goal...');

    await nar.input('<<$x finds food> ==> <food --> available>>. %0.9;0.8%');
    await nar.input('<<$x searches kitchen> ==> <$x finds food>>. %0.8;0.85%');
    await nar.input('<agent --> entity>. %1.0;0.9%');

    await nar.runCycles(40);

    const plans = beliefs.filter(b => {
        const s = b.term.toString();
        return s.includes('==') && (s.includes('food') || s.includes('search'));
    });

    log(`\nPlan-like beliefs (implications): ${plans.length}`);
    plans.slice(0, 3).forEach((p, i) => {
        log(`  ${i + 1}. ${p.term.toString()}`);
    });

    // Cleanup
    await nar.dispose();

    takeaways(
        'Create goals with "!" punctuation: <state>!',
        'nar.getGoals() - Retrieve active goals',
        'Goals guide reasoning toward achievement',
        'Multi-step goals require procedural knowledge (implications)',
        'Track goal achievement by matching beliefs',
        'Goal priority influences pursuit order'
    );
}

demonstrateGoalDriven().catch(console.error);
