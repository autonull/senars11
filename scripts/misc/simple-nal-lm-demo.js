#!/usr/bin/env node

/**
 * Simple demonstration of NAL reasoning with the new model configuration
 */

import {NAR} from '@senars/nar';

async function simpleDemo() {
    console.log("🚀 Starting SeNARS NAL Reasoning Demo...\n");
    
    // Create NAR instance with default configuration
    const nar = new NAR({
        lm: {
            provider: 'transformers',
            modelName: 'Xenova/t5-small',
            enabled: false  // Disable LM for this demo to focus on NAL
        }
    });

    console.log("✅ NAR initialized\n");

    // Example 1: Basic inheritance reasoning
    console.log("📝 NAL Example 1: Inheritance Reasoning");
    console.log("Input: (bird --> animal).  [Birds are animals]");
    console.log("Input: (robin --> bird).   [Robins are birds]");
    console.log("Expected: (robin --> animal). via syllogistic inference\n");
    
    // Subscribe to output to see derivations
    nar.on('output', (task) => {
        if (task.punctuation === '.' && task.term.toString().includes('robin') && task.term.toString().includes('animal')) {
            console.log(`💡 Derived: ${task.term.toString()} with truth {f:${task.truth.frequency}, c:${task.truth.confidence}}`);
        }
    });
    
    try {
        await nar.input("(bird --> animal).");
        await nar.input("(robin --> bird).");
        
        // Process several reasoning cycles
        for (let i = 0; i < 10; i++) {
            await nar.step();
        }
        
        console.log("✅ Syllogistic reasoning completed\n");
    } catch (error) {
        console.error("❌ Reasoning error:", error.message);
    }

    // Example 2: Similarity reasoning
    console.log("📝 NAL Example 2: Similarity Reasoning");
    console.log("Input: (cat <-> dog).      [Cat is similar to dog]");
    console.log("Input: (cat --> mammal).   [Cats are mammals]");
    console.log("Expected: (dog --> mammal). via analogy\n");
    
    nar.on('output', (task) => {
        if (task.punctuation === '.' && task.term.toString().includes('dog') && task.term.toString().includes('mammal')) {
            console.log(`💡 Derived: ${task.term.toString()} with truth {f:${task.truth.frequency}, c:${task.truth.confidence}}`);
        }
    });
    
    try {
        await nar.input("(cat <-> dog).");
        await nar.input("(cat --> mammal).");
        
        for (let i = 0; i < 10; i++) {
            await nar.step();
        }
        
        console.log("✅ Similarity/analogical reasoning completed\n");
    } catch (error) {
        console.error("❌ Similarity reasoning error:", error.message);
    }

    // Example 3: Implication reasoning
    console.log("📝 NAL Example 3: Implication Reasoning");
    console.log("Input: (rain ==> wet).      [Rain implies wetness]");
    console.log("Input: (rain).              [It is raining]");
    console.log("Expected: (wet). via detachment rule\n");
    
    nar.on('output', (task) => {
        if (task.punctuation === '.' && task.term.toString().includes('wet')) {
            console.log(`💡 Derived: ${task.term.toString()} with truth {f:${task.truth.frequency}, c:${task.truth.confidence}}`);
        }
    });
    
    try {
        await nar.input("(rain ==> wet).");
        await nar.input("(rain).");
        
        for (let i = 0; i < 10; i++) {
            await nar.step();
        }
        
        console.log("✅ Implication reasoning completed\n");
    } catch (error) {
        console.error("❌ Implication reasoning error:", error.message);
    }

    // Example 4: Question answering
    console.log("📝 NAL Example 4: Question Answering");
    console.log("Input: (robin --> ?what)?   [What are robins?]");
    console.log("Expected: System should answer based on knowledge\n");
    
    nar.on('output', (task) => {
        if (task.punctuation === '?' && task.type === 'ANSWER') {
            console.log(`❓ Answer: ${task.term.toString()} with truth {f:${task.truth?.frequency}, c:${task.truth?.confidence}}`);
        }
    });
    
    try {
        await nar.input("(robin --> ?what)?");
        
        for (let i = 0; i < 15; i++) {
            await nar.step();
        }
        
        console.log("✅ Question answering completed\n");
    } catch (error) {
        console.error("❌ Question answering error:", error.message);
    }

    // Show system stats
    console.log("📊 System Statistics:");
    const beliefs = nar.getBeliefs();
    console.log(`   - Total beliefs: ${beliefs.length}`);
    console.log(`   - Sample beliefs:`);
    beliefs.slice(0, 5).forEach((task, i) => {
        console.log(`     ${i + 1}. ${task.term.toString()} {f:${task.truth?.frequency}, c:${task.truth?.confidence}}`);
    });
    
    console.log("\n🎯 NAL Reasoning Summary:");
    console.log("   - Performed syllogistic inference (A→B, B→C ⇒ A→C)");
    console.log("   - Applied similarity/analogical reasoning");
    console.log("   - Executed implication detachment");
    console.log("   - Processed question answering");
    console.log("   - Maintained truth values throughout reasoning");
    
    // Shutdown
    await nar.shutdown();
    console.log("\n👋 NAL reasoning demo completed successfully!");
}

// Run the demonstration
simpleDemo().catch(console.error);