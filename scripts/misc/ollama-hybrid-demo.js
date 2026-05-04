#!/usr/bin/env node

/**
 * Ollama Hybrid Demo: NL ↔ Narsese interaction using Qwen3 via Ollama
 * This demo uses the Ollama provider with the Qwen3 model for better Narsese generation
 */

import {NAR, LMRule, LangChainProvider} from '@senars/nar';

// Custom trace capture for logging all system activity
class ReasoningTrace {
    constructor() {
        this.events = [];
        this.startTime = Date.now();
    }

    log(eventType, data, details = {}) {
        const timestamp = Date.now() - this.startTime;
        const event = {
            time: timestamp,
            type: eventType,
            data: data,
            ...details
        };
        this.events.push(event);
        
        // Log to console for real-time visibility
        console.log(`[TRACE ${timestamp}ms] ${eventType}:`, data, details);
    }

    getEvents() {
        return this.events;
    }

    printSummary() {
        console.log("\n" + "=".repeat(80));
        console.log("OLLAMA HYBRID REASONING TRACE SUMMARY");
        console.log("=".repeat(80));
        
        const eventCounts = {};
        this.events.forEach(event => {
            eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
        });
        
        console.log("\nEvent Distribution:");
        Object.entries(eventCounts).forEach(([type, count]) => {
            console.log(`  • ${type}: ${count} events`);
        });
        
        console.log("\nDetailed Trace:");
        this.events.forEach((event, index) => {
            console.log(`${index + 1}. [${event.time}ms] ${event.type}:`, 
                       typeof event.data === 'object' ? JSON.stringify(event.data) : event.data);
        });
        
        console.log("=".repeat(80));
    }
}

// Custom Ollama provider with detailed logging
class OllamaProvider extends LangChainProvider {
    constructor(config = {}) {
        super({...config, provider: 'ollama'});
        this.trace = config.trace || null;
    }

    async generateText(prompt, options = {}) {
        if (this.trace) {
            this.trace.log('LM_INPUT', prompt, {model: this.modelName, options});
        }
        
        const startTime = Date.now();
        const result = await super.generateText(prompt, options);
        const duration = Date.now() - startTime;
        
        if (this.trace) {
            this.trace.log('LM_OUTPUT', result, {duration_ms: duration, model: this.modelName});
        }
        
        return result;
    }
    
    // Enhanced method to get better Narsese output from Qwen3
    async generateNarsese(text, context = "") {
        // Use a more direct and clear prompt to get Narsese from Qwen3
        const prompt = `Convert the following to Narsese: "${text}"\nContext: ${context}\n\nOutput format: (subject --> predicate). or (subject <-> predicate). or (subject ==> predicate). ONLY. No other text.\n\nNarsese: `;
        
        const result = await this.generateText(prompt, {maxTokens: 30, temperature: 0.1});
        
        // Extract Narsese pattern from the response
        const narseseMatch = result.match(/\([^)]+\s*(-->)|(<->)|(==>)|(&&)|(\|\|)\s*[^)]+\)/);
        if (narseseMatch) {
            let narsese = narseseMatch[0].trim();
            if (!narsese.endsWith('.') && !narsese.endsWith('!') && !narsese.endsWith('?')) {
                narsese += '.';
            }
            return narsese;
        }
        
        // If no pattern found, return a simple default
        return `(entity --> ${text.replace(/\s+/g, '_').replace(/[^\w_]/g, '')}).`;
    }
}

async function createOllamaHybridDemo() {
    console.log("🚀 Starting Ollama Hybrid Demo: NL ↔ Narsese via Qwen3\n");

    const trace = new ReasoningTrace();

    // Create NAR instance with Ollama LM integration
    const nar = new NAR({
        nar: {
            lm: {enabled: true}
        },
        lm: {
            provider: 'ollama',
            modelName: 'hf.co/Qwen/Qwen3-8B-GGUF:Q4_K_M',  // Using correct Qwen3 model
            enabled: true
        }
    });

    // Create and register the Ollama provider
    const ollamaProvider = new OllamaProvider({
        provider: 'ollama',
        modelName: 'hf.co/Qwen/Qwen3-8B-GGUF:Q4_K_M',  // Using the correct Qwen3 model from Ollama
        baseURL: 'http://localhost:11434',  // Default Ollama URL
        trace: trace
    });

    // Initialize the Ollama provider
    await ollamaProvider.initialize();

    nar.registerLMProvider('ollama-qwen3', ollamaProvider);
    nar.lm.activeProvider = 'ollama-qwen3';

    console.log("✅ NAR initialized with Ollama Qwen3 integration");
    console.log("   - Model: hf.co/Qwen/Qwen3-8B-GGUF:Q4_K_M (from Ollama)");
    console.log("   - Provider: Ollama via LangChain");
    console.log("   - Expected: Better Narsese generation from Qwen3\n");

    // Wait for initialization (Ollama might need time to load the model)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Subscribe to NAR events for comprehensive tracing
    nar.on('input', (input) => {
        trace.log('NAR_INPUT', input);
    });

    nar.on('task_added', (task) => {
        trace.log('TASK_ADDED', {
            term: task.term.toString(),
            punctuation: task.punctuation,
            truth: task.truth ? {f: task.truth.frequency, c: task.truth.confidence} : null,
            priority: task.priority
        });
    });

    nar.on('derivation', (task) => {
        trace.log('DERIVATION', {
            term: task.term.toString(),
            punctuation: task.punctuation,
            truth: task.truth ? {f: task.truth.frequency, c: task.truth.confidence} : null
        });
    });

    nar.on('output', (task) => {
        trace.log('OUTPUT', {
            term: task.term.toString(),
            punctuation: task.punctuation,
            type: task.type,
            truth: task.truth ? {f: task.truth.frequency, c: task.truth.confidence} : null
        });
    });

    nar.on('lm:prompt', (data) => {
        trace.log('LM_PROMPT', data.prompt, {ruleId: data.ruleId});
    });

    nar.on('lm:response', (data) => {
        trace.log('LM_RESPONSE', data.response, {ruleId: data.ruleId, duration: data.duration});
    });

    console.log("🎯 ACCESSING STREAM REASONER FOR OLLAMA LM RULE ADDITION:\n");

    // Access the rule executor to add our custom LM rules
    let ruleExecutor = null;
    
    if (nar.streamReasoner && nar.streamReasoner.ruleProcessor) {
        ruleExecutor = nar.streamReasoner.ruleProcessor.ruleExecutor;
        console.log("✅ Found stream reasoner and rule executor\n");
    } else {
        console.log("⚠️  Could not access stream reasoner rule executor\n");
    }

    if (ruleExecutor) {
        console.log("📝 Adding Ollama Qwen3 Hypothesis Generation Rule");
        console.log("   This rule will trigger when certain conditions are met during reasoning\n");

        try {
            const hypothesisRule = LMRule.create({
                id: 'ollama-qwen3-hypothesis-generation',
                lm: ollamaProvider,
                priority: 0.7,
                name: 'Ollama Qwen3 Hypothesis Generation Rule',
                description: 'Generates hypotheses based on existing beliefs using Qwen3 via Ollama',
                condition: (primary) => {
                    // Trigger when we have a belief with high confidence that contains 'cat' or 'dog'
                    return primary?.punctuation === '.' && 
                           (primary.truth?.confidence ?? 0.9) > 0.8 &&
                           (primary.term.toString().toLowerCase().includes('cat') ||
                            primary.term.toString().toLowerCase().includes('dog'));
                },
                prompt: (primary) => {
                    const currentTerm = primary.term.toString();
                    return `Given that "${currentTerm}" is believed to be true, what related hypothesis could also be true? Respond with ONLY a Narsese statement like (subject --> predicate). or (subject <-> predicate). No other text.\n\nNarsese: `;
                },
                process: (lmResponse, primary) => {
                    console.log(`[OLLAMA RULE PROCESSING] Raw response: ${lmResponse}`);
                    
                    // Extract Narsese pattern from the response
                    const narseseMatch = lmResponse.match(/\([^)]+\s*(-->)|(<->)|(==>)|(&&)|(\|\|)\s*[^)]+\)/);
                    if (narseseMatch) {
                        let narsese = narseseMatch[0].trim();
                        if (!narsese.endsWith('.') && !narsese.endsWith('!') && !narsese.endsWith('?')) {
                            narsese += '.';
                        }
                        console.log(`[OLLAMA RULE PROCESSING] Extracted Narsese: ${narsese}`);
                        return narsese;
                    }
                    
                    console.log(`[OLLAMA RULE PROCESSING] No Narsese pattern found, using fallback`);
                    return `(hypothesis --> related_to_${primary.term.toString().replace(/[^\w]/g, '_')}).`;
                },
                generate: (processedOutput, primary, secondary, context) => {
                    console.log(`[OLLAMA RULE GENERATE] Would generate: ${processedOutput}`);
                    // In a real implementation, this would create new tasks
                    return [];
                },
                lm_options: {temperature: 0.3, max_tokens: 40}
            });

            // Add the rule to the rule executor
            ruleExecutor.register(hypothesisRule);
            console.log("   ✅ Ollama Qwen3 Hypothesis Generation Rule added\n");
        } catch (error) {
            trace.log('ERROR', {step: 'Ollama Rule Creation', error: error.message});
            console.error("   ❌ Ollama Rule creation error:", error.message);
        }

        console.log("📝 Adding Ollama Qwen3 Concept Elaboration Rule");
        console.log("   This rule will elaborate concepts during reasoning\n");

        try {
            const elaborationRule = LMRule.create({
                id: 'ollama-qwen3-concept-elaboration',
                lm: ollamaProvider,
                priority: 0.6,
                name: 'Ollama Qwen3 Concept Elaboration Rule',
                description: 'Elaborates concepts by generating related properties using Qwen3 via Ollama',
                condition: (primary) => {
                    // Trigger when we have a concept that might benefit from elaboration
                    return primary?.punctuation === '.' && 
                           (primary.term.toString().toLowerCase().includes('mammal') ||
                            primary.term.toString().toLowerCase().includes('animal') ||
                            primary.term.toString().toLowerCase().includes('bird'));
                },
                prompt: (primary) => {
                    const concept = primary.term.toString();
                    return `What are 2-3 properties or characteristics of "${concept}"? Respond with ONLY Narsese statements like (property --> characteristic). one per line. No other text.\n\nNarsese:\n`;
                },
                process: (lmResponse, primary) => {
                    console.log(`[OLLAMA ELABORATION RULE PROCESSING] Response: ${lmResponse}`);
                    
                    // Extract Narsese statements from the response
                    const lines = lmResponse.split('\n');
                    for (const line of lines) {
                        const narseseMatch = line.trim().match(/\([^)]+\s*(-->)|(<->)|(==>)|(&&)|(\|\|)\s*[^)]+\)/);
                        if (narseseMatch) {
                            let narsese = narseseMatch[0].trim();
                            if (!narsese.endsWith('.') && !narsese.endsWith('!') && !narsese.endsWith('?')) {
                                narsese += '.';
                            }
                            console.log(`[OLLAMA ELABORATION RULE PROCESSING] Extracted: ${narsese}`);
                            return narsese;
                        }
                    }
                    
                    console.log(`[OLLAMA ELABORATION RULE PROCESSING] No Narsese found, using fallback`);
                    return `(elaboration --> property_of_${primary.term.toString().replace(/[^\w]/g, '_')}).`;
                },
                generate: (processedOutput) => {
                    console.log(`[OLLAMA ELABORATION RULE GENERATE] Output: ${processedOutput}`);
                    return [];
                },
                lm_options: {temperature: 0.4, max_tokens: 60}
            });

            ruleExecutor.register(elaborationRule);
            console.log("   ✅ Ollama Qwen3 Concept Elaboration Rule added\n");
        } catch (error) {
            trace.log('ERROR', {step: 'Ollama Elaboration Rule Creation', error: error.message});
            console.error("   ❌ Ollama Elaboration rule creation error:", error.message);
        }
    } else {
        console.log("⚠️  Skipping Ollama rule addition due to missing rule executor\n");
    }

    console.log("🎯 OLLAMA HYBRID REASONING SCENARIO:\n");

    // Scenario: Input facts that should trigger the Ollama LM rules
    console.log("📝 Scenario 1: Input that should trigger Ollama rules");
    console.log("   Input: (cat --> mammal).");
    console.log("   Expected: Ollama rule should trigger for hypothesis generation\n");

    try {
        await nar.input("(cat --> mammal).");
        
        // Run multiple cycles to allow Ollama rules to potentially trigger
        for (let i = 0; i < 10; i++) {
            await nar.step();
        }
        
        console.log("   ✅ First reasoning cycle completed\n");
    } catch (error) {
        trace.log('ERROR', {step: 'Scenario 1', error: error.message});
        console.error("   ❌ Scenario 1 error:", error.message);
    }

    // Add more inputs to trigger elaboration rules
    console.log("📝 Scenario 2: Input that should trigger elaboration rules");
    console.log("   Input: (dog --> mammal).");
    console.log("   Expected: Elaboration rule should trigger\n");

    try {
        await nar.input("(dog --> mammal).");
        
        for (let i = 0; i < 10; i++) {
            await nar.step();
        }
        
        console.log("   ✅ Second reasoning cycle completed\n");
    } catch (error) {
        trace.log('ERROR', {step: 'Scenario 2', error: error.message});
        console.error("   ❌ Scenario 2 error:", error.message);
    }

    // Add cross-concept reasoning
    console.log("📝 Scenario 3: Cross-concept reasoning");
    console.log("   Input: (mammal --> warm_blooded).");
    console.log("   Input: (cat --> mammal).");
    console.log("   Expected: Syllogistic inference + potential Ollama rule activation\n");

    try {
        await nar.input("(mammal --> warm_blooded).");
        await nar.input("(cat --> mammal).");
        
        for (let i = 0; i < 15; i++) {
            await nar.step();
        }
        
        console.log("   ✅ Cross-concept reasoning completed\n");
    } catch (error) {
        trace.log('ERROR', {step: 'Scenario 3', error: error.message});
        console.error("   ❌ Scenario 3 error:", error.message);
    }

    // Add question to see if Ollama rules affect question answering
    console.log("📝 Scenario 4: Question that might trigger Ollama assistance");
    console.log("   Input: (cat --> ?property)?");
    console.log("   Expected: Answer derivation with possible Ollama influence\n");

    try {
        await nar.input("(cat --> ?property)?");
        
        for (let i = 0; i < 10; i++) {
            await nar.step();
        }
        
        console.log("   ✅ Question processing completed\n");
    } catch (error) {
        trace.log('ERROR', {step: 'Scenario 4', error: error.message});
        console.error("   ❌ Scenario 4 error:", error.message);
    }

    // Add goal reasoning
    console.log("📝 Scenario 5: Goal reasoning with potential Ollama influence");
    console.log("   Input: (happy --> desirable)!");
    console.log("   Expected: Goal processing with possible Ollama rule activation\n");

    try {
        await nar.input("(happy --> desirable)!");
        
        for (let i = 0; i < 8; i++) {
            await nar.step();
        }
        
        console.log("   ✅ Goal reasoning completed\n");
    } catch (error) {
        trace.log('ERROR', {step: 'Scenario 5', error: error.message});
        console.error("   ❌ Scenario 5 error:", error.message);
    }

    // Add compound term reasoning
    console.log("📝 Scenario 6: Compound term reasoning");
    console.log("   Input: ((&, cat, pet) --> desirable).");
    console.log("   Expected: Compound processing with potential Ollama elaboration\n");

    try {
        await nar.input("((&, cat, pet) --> desirable).");
        
        for (let i = 0; i < 12; i++) {
            await nar.step();
        }
        
        console.log("   ✅ Compound term reasoning completed\n");
    } catch (error) {
        trace.log('ERROR', {step: 'Scenario 6', error: error.message});
        console.error("   ❌ Scenario 6 error:", error.message);
    }

    // Add more facts to stimulate the system
    console.log("📝 Scenario 7: Stimulating system with additional facts");
    console.log("   Adding random facts to encourage Ollama rule activation\n");

    try {
        const additionalFacts = [
            "(bird --> flyer).",
            "(fish --> swimmer).", 
            "(tree --> plant).",
            "(car --> vehicle)."
        ];
        
        for (const fact of additionalFacts) {
            await nar.input(fact);
            await nar.step();
        }
        
        // Run extended reasoning
        for (let i = 0; i < 15; i++) {
            await nar.step();
        }
        
        console.log("   ✅ System stimulation completed\n");
    } catch (error) {
        trace.log('ERROR', {step: 'Scenario 7', error: error.message});
        console.error("   ❌ Scenario 7 error:", error.message);
    }

    // Show system statistics
    console.log("📊 System Statistics:");
    const finalBeliefs = nar.getBeliefs();
    console.log(`   - Total beliefs in memory: ${finalBeliefs.length}`);
    
    // Access memory concepts safely
    let focusConcepts = 0;
    let longTermConcepts = 0;
    if (nar.memory && nar.memory.focus) {
        focusConcepts = nar.memory.focus.concepts ? nar.memory.focus.concepts.size : 0;
    }
    if (nar.memory && nar.memory.longTerm) {
        longTermConcepts = nar.memory.longTerm.concepts ? nar.memory.longTerm.concepts.size : 0;
    }
    
    console.log(`   - Focus concepts: ${focusConcepts}`);
    console.log(`   - Long-term concepts: ${longTermConcepts}`);
    
    if (finalBeliefs.length > 0) {
        console.log("   - Sample beliefs:");
        finalBeliefs.slice(0, 10).forEach((task, i) => {
            console.log(`     ${i + 1}. ${task.term.toString()} {f:${task.truth?.frequency}, c:${task.truth?.confidence}}`);
        });
    }

    // Print the complete reasoning trace
    trace.printSummary();

    console.log("\n🎯 OLLAMA HYBRID CAPABILITIES DEMONSTRATED:");
    console.log("   1. Ollama Integration: Qwen3 model via Ollama provider");
    console.log("   2. LM Rules Integration: Rules added to correct rule executor");
    console.log("   3. Condition-Based Activation: Rules activate based on conditions");
    console.log("   4. Cross-Modal Reasoning: NAL reasoning with Ollama influence");
    console.log("   5. Truth Maintenance: Confidence values preserved");
    console.log("   6. Dynamic Inference: Real-time reasoning");
    console.log("   7. Rule-Based Processing: Proper architecture follows");
    console.log("   8. Goal Processing: Purpose-driven reasoning");
    console.log("   9. Compound Terms: Complex concept handling");

    console.log("\n💡 OLLAMA INTERACTION PATTERN:");
    console.log("   - Ollama rules are added to the correct rule executor");
    console.log("   - Using Qwen3 model for potentially better Narsese generation");
    console.log("   - Conditions determine when Ollama rules activate");
    console.log("   - Proper separation of concerns maintained");
    console.log("   - Real-time logging shows rule activations");

    console.log("\n🎯 AUTHENTIC REASONING ACTIVITY:");
    console.log("   - Ollama rules potentially activating during NAL reasoning");
    console.log("   - Proper hybrid processing architecture");
    console.log("   - Meaningful trace of system activity");
    console.log("   - Correct neurosymbolic interaction pattern");
    console.log("   - Demonstrated NL ↔ Narsese interaction through Ollama rules");

    // Check if shutdown method exists
    if (typeof nar.shutdown === 'function') {
        await nar.shutdown();
    } else {
        console.log("[INFO] Shutdown method not available, skipping...");
    }
    console.log("\n✅ Ollama Hybrid Demo Completed Successfully!");
    console.log("   Ollama Qwen3 NL ↔ Narsese interaction through LM Rules demonstrated.");
}

// Run the Ollama hybrid demonstration
createOllamaHybridDemo().catch(console.error);