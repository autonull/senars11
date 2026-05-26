#!/usr/bin/env node
import {NAR} from '@senars/nar';
import {App} from '@senars/agent';

const section = (title) => console.log(`\n${'═'.repeat(60)}\n${title}\n${'═'.repeat(60)}`);
const log = (...args) => console.log('  ', ...args);

async function demonstrateErrorHandling() {
    section('Error Handling Patterns Demo');
    log('Demonstrating proper error handling, recovery, and graceful degradation\n');

    // 1. Try-Catch with Specific Error Types
    section('1️⃣  Basic Try-Catch Pattern');
    const nar = new NAR({lm: {enabled: false}});

    try {
        await nar.initialize();
        log('✅ NAR initialized');

        // Invalid Narsese input
        try {
            await nar.input('this is not valid narsese');
            log('Input processed (may auto-correct or ignore)');
        } catch (error) {
            log(`❌ Input error: ${error.message}`);
        }
    } catch (error) {
        log(`❌ Initialization error: ${error.message}`);
    }

    // 2. Graceful Degradation with LM
    section('2️⃣ Graceful Degradation (LM Fallback)');
    const app = new App({
        lm: {
            enabled: true,
            provider: 'transformers',
            modelName: 'invalid-model-name',
            loadTimeout: 5000
        }
    });

    try {
        await app.initialize();
        log('App initialized');
    } catch (error) {
        log(`LM initialization failed: ${error.message}`);
        log('Falling back to NAR-only mode...');

        // Fallback: reinitialize without LM
        const fallbackApp = new App({lm: {enabled: false}});
        await fallbackApp.initialize();
        log('✅ Fallback successful - running without LM');
        await fallbackApp.shutdown();
    }

    // 3. Timeout Handling
    section('3️⃣  Timeout Handling Pattern');

    async function withTimeout(promise, ms, errorMsg) {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(errorMsg)), ms)
        );
        return Promise.race([promise, timeout]);
    }

    try {
        await withTimeout(
            nar.runCycles(1000),
            100,
            'Reasoning timeout after 100ms'
        );
        log('Reasoning completed within timeout');
    } catch (error) {
        log(`❌ ${error.message}`);
        log('Recovering: stopping reasoning early');
        nar.stop();
    }

    // 4. Resource Cleanup (Finally Block)
    section('4️⃣  Resource Cleanup Pattern');
    let tempNAR = null;
    try {
        tempNAR = new NAR({lm: {enabled: false}});
        await tempNAR.initialize();
        await tempNAR.input('<test --> data>.');
        log('✅ Operations completed');
    } catch (error) {
        log(`❌ Error: ${error.message}`);
    } finally {
        if (tempNAR) {
            await tempNAR.dispose();
            log('✅ Resources cleaned up in finally block');
        }
    }

    // 5. Event-Based Error Monitoring
    section('5️⃣  Event-Based Error Monitoring');
    const {EventBus} = await import('@senars/nar');
    const eventBus = new EventBus();

    const errors = [];
    eventBus.on('error', (data) => {
        errors.push(data);
        log(`Error event: ${data.message}`);
    });

    const monitored = new NAR({lm: {enabled: false}, eventBus});
    await monitored.initialize();

    try {
        await monitored.input('<<invalid>>');
    } catch (e) {
        eventBus.emit('error', {message: e.message, type: 'parse-error'});
    }

    log(`Total errors logged: ${errors.length}`);
    await monitored.dispose();

    // 6. Retry Pattern with Exponential Backoff
    section('6️⃣  Retry with Exponential Backoff');

    async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                const delay = baseDelay * Math.pow(2, i);
                log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    let attempts = 0;
    try {
        await retryWithBackoff(async () => {
            attempts++;
            if (attempts < 3) throw new Error('Simulated failure');
            return 'Success';
        });
        log(`✅ Succeeded after ${attempts} attempts`);
    } catch (error) {
        log(`❌ Failed after all retries: ${error.message}`);
    }

    // 7. Error Recovery State Machine
    section('7️⃣  Error Recovery State Machine');
    const states = {
        HEALTHY: 'healthy',
        DEGRADED: 'degraded',
        FAILED: 'failed'
    };

    let systemState = states.HEALTHY;
    let errorCount = 0;

    function handleError(error) {
        errorCount++;
        log(`Error ${errorCount}: ${error.message}`);

        if (errorCount >= 5) {
            systemState = states.FAILED;
            log('State: FAILED - system shutdown required');
        } else if (errorCount >= 2) {
            systemState = states.DEGRADED;
            log('State: DEGRADED - running with reduced functionality');
        }
    }

    [1, 2, 3, 4, 5].forEach(i => {
        handleError(new Error(`Error ${i}`));
    });

    // Cleanup
    await nar.dispose();

    section('✨ Key Takeaways');
    log('• Use try-catch-finally for resource cleanup');
    log('• Implement graceful degradation for optional features');
    log('• Add timeouts to prevent indefinite hangs');
    log('• Use EventBus for centralized error monitoring');
    log('• Implement retry with exponential backoff for transient failures');
    log('• Track error counts for state-based recovery');
    log('• Always clean up resources in finally blocks\n');
}

demonstrateErrorHandling().catch(console.error);
