import {App} from '../src/app/App.js';
import {Logger} from '../src/util/Logger.js';

async function run() {
    // Set logger to info to see important updates but avoid spam
    Logger.level = 'info';

    const config = {
        subsystems: {
            lm: {
                enabled: true,
                provider: 'transformers', // Use local Transformers.js
                model: 'Xenova/LaMini-Flan-T5-248M', // Compact model
                // model: 'Xenova/Qwen1.5-0.5B-Chat', // Alternative if supported
                temperature: 0.7
            },
            rules: ['syllogistic-core', 'temporal'],
            // Ensure we use default memory and focus settings
            memory: { enabled: true },
            focus: { enabled: true }
        },
        nar: {
            reasoning: {
                executionInterval: 50 // Faster steps
            }
        }
    };

    console.log("🛸 Initializing Alien Encounter Demo...");
    console.log("   Model: Xenova/LaMini-Flan-T5-248M");

    const app = new App(config);
    const agent = await app.start();

    // 1. Input Background Knowledge (NAL)
    console.log("\n📚 Injecting Background Knowledge (NAL)...");

    // Define what a UFO implies
    await agent.input('(UFO --> extraterrestrial_origin).');
    await agent.input('(spaceship --> extraterrestrial_origin).');

    // Define context
    await agent.input('((/, landed_in, _, backyard) --> event).');

    // 2. Input Natural Language (Quoted)
    console.log("\n🗣️  Injecting Natural Language Input...");
    const nlInput = '"A shiny metal disc landed in the backyard."';
    console.log(`   Input: ${nlInput}`);
    await agent.input(nlInput);

    // 3. Monitor Reasoning
    console.log("\n🧠 Reasoning Phase (20 seconds)...");

    let elaborationCount = 0;
    let translationCount = 0;

    agent.on('reasoning.derivation', (data) => {
        const task = data.derivedTask;
        const source = task.metadata?.source || data.source || 'unknown';

        if (source === 'narsese-translation') {
            console.log(`   🔤 TRANSLATION: ${task}`);
            translationCount++;
        } else if (source === 'concept-elaboration') { // Metadata not set in ElaborationRule yet?
            // Rule logic doesn't set metadata source. I should fix that.
            // But I can guess from content or if I check generic LMRule metadata?
            // The TaskUtils.Task used in ElaborationRule sets metadata? No I removed it.
            // Wait, I updated LMNarseseTranslationRule to use Task from task/Task.js which creates empty metadata?
            // src/task/Task.js accepts metadata? No. It doesn't.
            // So I can't check source via metadata easily if Task doesn't support it.

            // But agent.on('reasoning.derivation') data wrapper has 'source' property if passed in emit.
            // Reasoner.js emits: this.emit('derivation', derivation);
            // It doesn't wrap it with source info from rule.

            // So 'source' in data is undefined if reasoner emits task directly.

            // However, NAR.js handles 'reasoning.derivation' event from streamReasoner.
            /*
            this._streamReasoner.on('derivation', (derivation) => {
                this._handleStreamDerivation(derivation);
            });
            */
            /*
            async _handleStreamDerivation(derivation) {
                // ...
                this._eventBus.emit('reasoning.derivation', {
                    derivedTask: derivation,
                    source: 'streamReasoner.stream',
                    timestamp: Date.now()
                });
            }
            */

           // So source is always 'streamReasoner.stream'.
           console.log(`   ✨ DERIVATION: ${task}`);
        } else {
            console.log(`   ✨ DERIVATION: ${task}`);
        }
    });

    // Run loop
    const duration = 20000;
    const interval = 1000;
    for (let t = 0; t < duration; t += interval) {
        process.stdout.write(".");
        await new Promise(r => setTimeout(r, interval));

        // Occasionally check for specific beliefs
        const beliefs = agent.getBeliefs();
        // Check for 'extraterrestrial_origin'
        const findings = beliefs.filter(b => b.term.toString().includes('extraterrestrial'));
        if (findings.length > 2) { // We started with 2
             console.log("\n   🚀 FOUND NEW EXTRATERRESTRIAL EVIDENCE!");
             findings.forEach(f => console.log(`      ${f}`));
             break;
        }
    }
    process.stdout.write("\n");

    // 4. Final Report
    console.log("\n📝 Final System State:");
    const beliefs = agent.getBeliefs();
    console.log(`   Total Beliefs: ${beliefs.length}`);

    // Check specific concepts
    const concepts = ["shiny_metal_disc", "UFO", "spaceship", "extraterrestrial_origin"];
    for (const c of concepts) {
        const belief = beliefs.find(b => b.term.toString().includes(c));
        if (belief) console.log(`   - Known: ${belief}`);
    }

    await app.shutdown();
}

run().catch(e => console.error(e));
