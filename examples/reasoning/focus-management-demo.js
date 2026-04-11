#!/usr/bin/env node
import {NAR} from '@senars/nar';

const section = (title) => console.log(`\n${'═'.repeat(60)}\n${title}\n${'═'.repeat(60)}`);
const log = (...args) => console.log('  ', ...args);

async function demonstrateFocusManagement() {
    section('Focus Management Demo');
    log('Demonstrating Focus system: attention direction and priority management\n');

    const nar = new NAR({lm: {enabled: false}});
    await nar.initialize();
    const focus = nar.focus;

    // 1. Initial focus state
    section('1️⃣  Initial Focus State');
    log(`Focus initialized: ${!!focus}`);
    log(`Active concepts in focus: ${focus?.getActiveConcepts?.()?.length || 'N/A'}`);

    // 2. Adding knowledge
    section('2️⃣  Adding Knowledge');
    await nar.input('<ai --> technology>. %0.9;0.9%');
    await nar.input('<neural-net --> ai>. %0.9;0.8%');
    await nar.input('<reasoning --> ai>. %0.8;0.85%');
    await nar.input('<logic --> reasoning>. %0.9;0.7%');
    await nar.input('<biology --> science>. %0.9;0.9%');
    await nar.input('<chemistry --> science>. %0.8;0.85%');

    // 3. Checking Focus after input
    section('3️⃣  Focus After Input');
    const activeConcepts = focus?.getActiveConcepts?.() || [];
    log(`Active concepts: ${activeConcepts.length}`);
    activeConcepts.slice(0, 5).forEach((term, i) => {
        log(`  ${i + 1}. ${term.toString()}`);
    });

    // 4. Manually focusing on specific concept
    section('4️⃣  Manual Focus Direction');
    const aiTerm = nar.terms.createAtom('ai');
    focus?.focus?.(aiTerm);
    log(`Focused on 'ai'`);

    const focusedConcepts = focus?.getActiveConcepts?.() || [];
    log(`Active concepts after focus:`);
    focusedConcepts.slice(0, 3).forEach((term, i) => {
        log(`  ${i + 1}. ${term.toString()}`);
    });

    // 5. Running cycles with focus
    section('5️⃣  Reasoning with Focus');
    log('Running 20 cycles with focused attention...');
    await nar.runCycles(20);

    const beliefs = nar.getBeliefs();
    log(`Beliefs derived: ${beliefs.length}`);

    // Check if focus influenced derivations
    const aiRelatedBeliefs = beliefs.filter(b => {
        const termStr = b.term.toString();
        return termStr.includes('ai') || termStr.includes('neural');
    });
    log(`AI-related beliefs: ${aiRelatedBeliefs.length}`);

    // 6. Clearing focus
    section('6️⃣  Clearing Focus');
    focus?.clear?.();
    log('Focus cleared');

    const afterClear = focus?.getActiveConcepts?.() || [];
    log(`Active concepts after clear: ${afterClear.length}`);

    // 7. Focus priority patterns
    section('7️⃣  Focus with Priority Management');
    const concepts = nar.memory.getAllConcepts();
    const sortedByPriority = concepts
        .filter(c => c.priority != null)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    log('Concepts by priority (top 5):');
    sortedByPriority.slice(0, 5).forEach((c, i) => {
        log(`  ${i + 1}. ${c.term.toString()} (${c.priority?.toFixed(3)})`);
    });

    // 8. Strategic focusing
    section('8️⃣  Strategic Focus Application');
    log('Focusing on high-priority concept and reasoning...');

    if (sortedByPriority[0]) {
        focus?.focus?.(sortedByPriority[0].term);
        log(`Focused on: ${sortedByPriority[0].term.toString()}`);
    }

    await nar.runCycles(10);
    const finalBeliefs = nar.getBeliefs();
    log(`Total beliefs after focused reasoning: ${finalBeliefs.length}`);

    // Cleanup
    await nar.dispose();

    section('✨ Key Takeaways');
    log('• focus.getActiveConcepts() - View currently focused concepts');
    log('• focus.focus(term) - Direct attention to specific concept');
    log('• focus.clear() - Clear focus state');
    log('• Focus influences which concepts get processing priority');
    log('• Combine focus with priority for strategic reasoning');
    log('• Use focus to guide inference toward relevant areas\n');
}

demonstrateFocusManagement().catch(console.error);
