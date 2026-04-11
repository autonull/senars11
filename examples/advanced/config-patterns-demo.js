#!/usr/bin/env node
import {NAR} from '@senars/nar';
import {Config} from '@senars/nar';

const section = (title) => console.log(`\n${'═'.repeat(60)}\n${title}\n${'═'.repeat(60)}`);
const log = (...args) => console.log('  ', ...args);

async function demonstrateConfigPatterns() {
    section('Configuration Patterns Demo');
    log('Best practices for NAR configuration and tuning\n');

    // 1. Minimal Configuration
    section('1️⃣  Minimal Configuration (Defaults)');
    const minimal = new NAR({lm: {enabled: false}});
    await minimal.initialize();
    log('✅ Minimal config: uses all defaults');
    log(`  Stream reasoner: ${minimal.getStats().reasonerType === 'stream'}`);
    await minimal.dispose();

    // 2. Selective Subsystem Enablement
    section('2️⃣  Selective Subsystem Configuration');
    const selective = new NAR({
        lm: {enabled: true, provider: 'transformers', modelName: 'Xenova/LaMini-Flan-T5-248M'},
        subsystems: {
            lm: true,
            tools: false,
            embeddingLayer: false,
            rules: ['syllogistic-core']
        }
    });
    await selective.initialize();
    log('✅ Selective subsystems: LM + syllogistic rules only');
    await selective.dispose();

    // 3. Memory Tuning
    section('3️⃣  Memory Configuration');
    const memoryTuned = new NAR({
        lm: {enabled: false},
        memory: {
            maxConcepts: 10000,
            enableMemoryValidation: false,
            forgettingThreshold: 0.1
        }
    });
    await memoryTuned.initialize();
    log('✅ Memory tuned: 10k concepts, validation off, aggressive forgetting');
    const stats = memoryTuned.memory.getStats();
    log(`  Concept capacity: ${stats.conceptCount} / 10000`);
    await memoryTuned.dispose();

    // 4. Reasoning Engine Tuning
    section('4️⃣  Reasoning Engine Configuration');
    const streamReasoner = new NAR({
        lm: {enabled: false},
        reasoning: {
            useStreamReasoner: true,
            maxDerivationDepth: 10,
            cpuThrottleInterval: 0,
            streamSamplingObjectives: {
                priority: true,
                recency: true,
                novelty: false
            }
        }
    });
    await streamReasoner.initialize();
    log('✅ Stream reasoner: depth 10, no throttle, priority+recency sampling');
    await streamReasoner.dispose();

    // 5. LM Provider Configuration
    section('5️⃣  LM Provider Configuration');
    const lmConfig = new NAR({
        lm: {
            enabled: true,
            provider: 'transformers',
            modelName: 'Xenova/distilgpt2',
            temperature: 0.7,
            maxTokens: 100,
            loadTimeout: 120000,
            validation: {
                emptyOutput: 'warn',
                narsese: false
            },
            circuitBreaker: {
                failureThreshold: 3,
                timeout: 30000,
                resetTimeout: 60000
            }
        }
    });
    await lmConfig.initialize();
    log('✅ LM config: distilgpt2, temp 0.7, circuit breaker enabled');
    await lmConfig.dispose();

    // 6. Using Config Class
    section('6️⃣  Using Config Class for Validation');
    const config = new Config({
        lm: {enabled: true, provider: 'transformers', modelName: 'Xenova/LaMini-Flan-T5-248M'},
        subsystems: {lm: true, tools: true},
        memory: {maxConcepts: 5000}
    });

    log('Config validated: ✅');
    log(`  LM enabled: ${config.lm.enabled}`);
    log(`  Tools enabled: ${config.subsystems.tools}`);
    log(`  Max concepts: ${config.memory.maxConcepts}`);

    const configuredNAR = new NAR(config);
    await configuredNAR.initialize();
    await configuredNAR.dispose();

    // 7. Performance Tuning Patterns
    section('7️⃣  Performance Tuning Patterns');
    const performance = new NAR({
        lm: {enabled: false},
        reasoning: {
            useStreamReasoner: true,
            maxDerivationDepth: 5, // Lower = faster
            cpuThrottleInterval: 10 // Prevent CPU saturation
        },
        memory: {
            maxConcepts: 1000, // Lower = faster
            forgettingThreshold: 0.2 // Aggressive forgetting
        }
    });
    await performance.initialize();
    log('✅ Performance tuned: low depth, throttled, small memory');
    await performance.dispose();

    // 8. Development vs Production Patterns
    section('8️⃣  Development vs Production Patterns');

    const devConfig = {
        lm: {enabled: false}, // Fast iteration
        reasoning: {useStreamReasoner: false}, // Deterministic
        memory: {enableMemoryValidation: true} // Catch bugs
    };
    log('Dev config: validation on, deterministic, LM off');

    const prodConfig = {
        lm: {enabled: true, provider: 'ollama', circuitBreaker: {failureThreshold: 5}},
        reasoning: {useStreamReasoner: true}, // Performance
        memory: {enableMemoryValidation: false} // Performance
    };
    log('Prod config: LM on, stream reasoner, validation off, fault tolerance');

    section('✨ Key Takeaways');
    log('• Start minimal, add subsystems as needed');
    log('• Use Config class for validation');
    log('• memory.maxConcepts controls capacity');
    log('• reasoning.maxDerivationDepth balances depth vs speed');
    log('• Enable circuit breaker for LM fault tolerance');
    log('• Dev: enable validation, use cycle reasoner');
    log('• Prod: disable validation, use stream reasoner, add circuit breaker\n');
}

demonstrateConfigPatterns().catch(console.error);
