import {App} from '../src/app/App.js';
import {Logger} from '../src/util/Logger.js';

async function run() {
    Logger.level = 'info';

    const config = {
        subsystems: {
            // Keep enabled here to ensure NAR initializes LM component
            lm: { enabled: true },
            embeddingLayer: {
                enabled: true,
                model: 'Xenova/all-MiniLM-L6-v2',
            },
            functors: ['core-arithmetic', 'set-operations'],
            rules: ['syllogistic-core', 'temporal'],
        },
        // Put full LM config here because AgentBuilder._setupLM uses this root config
        lm: {
            enabled: true,
            provider: 'transformers',
            modelName: 'Xenova/flan-t5-base',
            temperature: 0.1,
            circuitBreaker: {
                failureThreshold: 10,
                timeout: 300000, // 5 minutes for model download
                resetTimeout: 30000
            }
        },
        memory: { enabled: true },
        nar: {
            reasoning: {
                executionInterval: 50
            }
        }
    };

    console.log("🚀 Hybrid Reasoning Showcase");
    console.log("   Demonstrating: Quoted Input, Async Translation, Concept Elaboration, and Embedding-Augmented Analogy.");

    const app = new App(config);
    const agent = await app.start();
    agent.displaySettings.trace = true;

    // Monitor Derivations
    agent.on('reasoning.derivation', (data) => {
        const task = data.derivedTask;
        if (task.term.toString().includes('fusion_reactor')) {
            console.log(`   🔤 TRANSLATION: ${task}`);
        }

        if (task.term.toString().includes('solution_proposal')) {
             console.log(`   💡 ANALOGY SOLUTION: ${task.term}`);
        }
    });

    console.log("\n📚 Phase 1: Knowledge Injection");
    // Inject some background knowledge
    await agent.input('(sun --> star).');
    await agent.input('(star --> energy_source).');

    // Inject quoted natural language (triggers Translation and Elaboration)
    const quote = '"The sun is a massive fusion reactor."';
    console.log(`   Input: ${quote}`);
    await agent.input(quote);

    // Wait for processing (give time for translation model load + inference)
    console.log("   Processing quoted input (waiting for LM)...");
    await new Promise(r => setTimeout(r, 60000)); // Wait 60s

    console.log("\n🤔 Phase 2: Analogical Reasoning");
    // Pose a problem that needs analogy
    const goal = '(solve_energy_scarcity --> self)!';
    console.log(`   Goal: ${goal}`);
    await agent.input(goal);

    // Wait for reasoning
    console.log("   Reasoning (waiting for LM & Embedding)...");
    await new Promise(r => setTimeout(r, 60000)); // Wait 60s

    console.log("\n📝 Final Check");
    const beliefs = agent.getBeliefs();
    const solution = beliefs.find(b => b.term.toString().includes('solution_proposal'));

    if (solution) {
        console.log("✅ Solution Found via Analogy!");
        console.log(`   Term: ${solution.term}`);
    } else {
        console.log("⚠️ No specific solution proposal found.");
    }

    await app.shutdown();
}

run().catch(e => console.error(e));
