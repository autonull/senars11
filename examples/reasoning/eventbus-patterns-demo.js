#!/usr/bin/env node
import {NAR, EventBus} from '@senars/nar';

const section = (title) => console.log(`\n${'═'.repeat(60)}\n${title}\n${'═'.repeat(60)}`);
const log = (...args) => console.log('  ', ...args);

async function demonstrateEventBus() {
    section('EventBus Patterns Demo');
    log('Demonstrating observability via EventBus event subscriptions\n');

    const eventBus = new EventBus();
    const events = [];

    // Subscribe to NAR lifecycle events
    eventBus.on('nar:initialized', (data) => {
        events.push({type: 'initialized', timestamp: Date.now()});
        log('✅ NAR initialized');
    });

    eventBus.on('nar:input', (data) => {
        events.push({type: 'input', content: data.content});
        log(`📝 Input: ${data.content}`);
    });

    eventBus.on('nar:derived', (data) => {
        events.push({type: 'derived', term: data.task?.term?.toString()});
        log(`🔗 Derived: ${data.task?.term?.toString() || 'N/A'}`);
    });

    eventBus.on('nar:belief-added', (data) => {
        events.push({type: 'belief', term: data.task?.term?.toString()});
        log(`💡 Belief added: ${data.task?.term?.toString() || 'N/A'}`);
    });

    // LM events
    eventBus.on('lm:inference-start', (data) => {
        events.push({type: 'lm-start', prompt: data.prompt?.substring(0, 50)});
        log(`🤖 LM inference started`);
    });

    eventBus.on('lm:inference-complete', (data) => {
        events.push({type: 'lm-complete', duration: data.duration});
        log(`✅ LM inference complete (${data.duration}ms)`);
    });

    // Memory events
    eventBus.on('memory:concept-created', (data) => {
        events.push({type: 'concept', name: data.term?.toString()});
        log(`🧠 Concept created: ${data.term?.toString() || 'N/A'}`);
    });

    // Custom application events
    eventBus.on('app:milestone', (data) => {
        events.push({type: 'milestone', name: data.name});
        log(`🎯 Milestone: ${data.name}`);
    });

    // Initialize NAR with EventBus
    section('1️⃣  NAR Initialization with EventBus');
    const nar = new NAR({
        lm: {enabled: false},
        eventBus,
        reasoning: {useStreamReasoner: false}
    });
    await nar.initialize();

    // Input some statements
    section('2️⃣  Processing Input');
    await nar.input('<bird --> animal>. %0.9;0.9%');
    await nar.input('<robin --> bird>. %0.9;0.8%');

    // Emit custom event
    eventBus.emit('app:milestone', {name: 'Initial knowledge loaded'});

    // Run reasoning
    section('3️⃣  Running Reasoning Cycles');
    await nar.runCycles(10);

    // Emit another custom event
    eventBus.emit('app:milestone', {name: 'Reasoning complete'});

    // Summary
    section('4️⃣  Event Summary');
    const eventCounts = events.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
    }, {});

    log('Event counts:');
    Object.entries(eventCounts).forEach(([type, count]) => {
        log(`  ${type}: ${count}`);
    });
    log(`\nTotal events: ${events.length}`);

    // Advanced: Event filtering
    section('5️⃣  Event Filtering Patterns');

    // Filter specific event types
    const derivations = events.filter(e => e.type === 'derived');
    log(`Derivations: ${derivations.length}`);
    derivations.slice(0, 3).forEach((e, i) => {
        log(`  ${i + 1}. ${e.term}`);
    });

    // One-time listeners
    section('6️⃣  One-Time Listeners');
    let oneTimeFired = false;
    const handler = () => {
        oneTimeFired = true;
        log('One-time handler fired!');
    };
    eventBus.once('test:event', handler);

    eventBus.emit('test:event', {data: 'first'}); // Fires
    eventBus.emit('test:event', {data: 'second'}); // Doesn't fire
    log(`One-time handler fired count: ${oneTimeFired ? 1 : 0}`);

    // Cleanup
    await nar.dispose();

    section('✨ Key Takeaways');
    log('• EventBus provides observability into NAR lifecycle');
    log('• Subscribe to built-in events: nar:*, lm:*, memory:*');
    log('• Emit custom application events for milestones');
    log('• Use .once() for one-time handlers');
    log('• Filter and analyze event logs for debugging\n');
}

demonstrateEventBus().catch(console.error);
