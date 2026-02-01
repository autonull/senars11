#!/usr/bin/env node
/**
 * SeNARS Demo Runner - Run and validate all examples
 *
 * Usage:
 *   node demos.js                    # Run all demos
 *   node demos.js --lm-only          # Run only LM-dependent demos
 *   node demos.js --provider ollama  # Use specific LM provider
 *   node demos.js --record           # Record to Asciinema (if installed)
 *   node demos.js --quick            # Run quick subset only
 */

import {spawn} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Demo definitions with metadata
const DEMOS = [
    // Core reasoning (no LM required)
    {path: 'reasoning/syllogism-demo.js', name: 'Syllogism', category: 'reasoning', lmRequired: false, quick: true},
    {path: 'reasoning/causal-reasoning-demo.js', name: 'Causal Reasoning', category: 'reasoning', lmRequired: false},
    {
        path: 'reasoning/inductive-reasoning-demo.js',
        name: 'Inductive Reasoning',
        category: 'reasoning',
        lmRequired: false
    },
    {
        path: 'reasoning/temporal-reasoning-demo.js',
        name: 'Temporal Reasoning',
        category: 'reasoning',
        lmRequired: false
    },
    {
        path: 'reasoning/syllogism-comparison-demo.js',
        name: 'Reasoner Comparison',
        category: 'reasoning',
        lmRequired: false
    },

    // Advanced features (no LM required)
    {
        path: 'advanced/stream-reasoning.js',
        name: 'Stream Reasoning',
        category: 'advanced',
        lmRequired: false,
        quick: true
    },
    {path: 'advanced/prolog-strategy-demo.js', name: 'Prolog Strategy', category: 'advanced', lmRequired: false},
    {path: 'advanced/performance-benchmark.js', name: 'Performance Benchmark', category: 'advanced', lmRequired: false},

    // NARS-GPT (mock LM - no external LM required)
    {path: 'narsgpt/demo-narsgpt.js', name: 'NARS-GPT Demo', category: 'narsgpt', lmRequired: false, quick: true},
    {path: 'narsgpt/domain-knowledge.js', name: 'Domain Knowledge', category: 'narsgpt', lmRequired: false},

    // LM-dependent demos (require external LM provider)
    {
        path: 'demos/demo-system-verification.js',
        name: 'System Verification',
        category: 'lm',
        lmRequired: true,
        quick: true
    },
    {path: 'narsgpt/production-lm.js', name: 'Production LM', category: 'narsgpt', lmRequired: true},
    {path: 'repl/example-agent-repl.js', name: 'Agent REPL', category: 'repl', lmRequired: true},
    {path: 'repl/example-research-scenario.js', name: 'Research Scenario', category: 'repl', lmRequired: true},
    {path: 'repl/example-fallback-mechanism.js', name: 'Fallback Mechanism', category: 'repl', lmRequired: true},
];

// Parse CLI arguments
function parseArgs() {
    const args = process.argv.slice(2);
    return {
        lmOnly: args.includes('--lm-only'),
        quick: args.includes('--quick'),
        record: args.includes('--record'),
        provider: args.includes('--provider') ? args[args.indexOf('--provider') + 1] : null,
        model: args.includes('--model') ? args[args.indexOf('--model') + 1] : null,
        help: args.includes('--help') || args.includes('-h'),
    };
}

// Run a single demo with timeout
async function runDemo(demoPath, options = {}) {
    const fullPath = path.join(__dirname, demoPath);
    const timeout = options.timeout || 60000; // 60 second default timeout

    return new Promise((resolve) => {
        const startTime = Date.now();

        // Set environment variables for LM provider
        const env = {...process.env};
        if (options.provider) {
            env.LM_PROVIDER = options.provider;
        }
        if (options.model) {
            env.OLLAMA_MODEL = options.model;
            env.LM_MODEL = options.model;
        }

        const child = spawn('node', [fullPath], {
            cwd: path.dirname(fullPath),
            env,
            timeout,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        const timeoutId = setTimeout(() => {
            child.kill('SIGTERM');
            resolve({
                success: false,
                error: 'Timeout exceeded',
                duration: Date.now() - startTime,
                stdout,
                stderr
            });
        }, timeout);

        child.on('close', (code) => {
            clearTimeout(timeoutId);
            const duration = Date.now() - startTime;

            // Check for errors in output
            const hasError = code !== 0 ||
                stderr.includes('Error') ||
                stderr.includes('ERR_MODULE_NOT_FOUND') ||
                stdout.includes('Error:') && !stdout.includes('handled');

            resolve({
                success: !hasError,
                code,
                duration,
                stdout: stdout.slice(-2000), // Last 2000 chars
                stderr: stderr.slice(-1000),
                error: hasError ? (stderr || 'Non-zero exit code') : null
            });
        });

        child.on('error', (err) => {
            clearTimeout(timeoutId);
            resolve({
                success: false,
                error: err.message,
                duration: Date.now() - startTime,
                stdout,
                stderr
            });
        });
    });
}

// Format duration for display
function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

// Main runner
async function main() {
    const opts = parseArgs();

    if (opts.help) {
        console.log(`
SeNARS Demo Runner

Usage: node demos.js [options]

Options:
  --lm-only         Run only LM-dependent demos
  --quick           Run quick subset (4 key demos)
  --provider NAME   Set LM provider (e.g., ollama, openai, transformers)
  --model NAME      Set model name. For transformers, use huggingface ID
  --record          Record session with Asciinema (if installed)
  -h, --help        Show this help

Examples:
  # Standard usage
  node demos.js                          # Run all non-LM demos
  node demos.js --quick                  # Run quick validation

  # Ollama Provider
  node demos.js --lm-only --provider ollama --model llama2

  # Transformers.js Provider (Local, no server needed)
  # Good for testing: Xenova/LaMini-Flan-T5-783M (small, capable)
  node demos.js --lm-only --provider transformers --model Xenova/LaMini-Flan-T5-783M
`);
        return;
    }

    console.log('═'.repeat(60));
    console.log('  SeNARS Demo Runner');
    console.log('═'.repeat(60));

    if (opts.provider) console.log(`  Provider: ${opts.provider}`);
    if (opts.model) console.log(`  Model: ${opts.model}`);
    console.log('');

    // Filter demos based on options
    let demosToRun = DEMOS;

    if (opts.lmOnly) {
        demosToRun = demosToRun.filter(d => d.lmRequired);
        console.log('  Mode: LM-only demos\n');
    } else if (opts.quick) {
        demosToRun = demosToRun.filter(d => d.quick);
        console.log('  Mode: Quick demos\n');
    } else {
        // By default, skip LM-required demos unless provider specified
        if (!opts.provider) {
            demosToRun = demosToRun.filter(d => !d.lmRequired);
            console.log('  Mode: Non-LM demos (use --provider to include LM demos)\n');
        }
    }

    // Results tracking
    const results = {passed: 0, failed: 0, skipped: 0, errors: []};

    // Optional Asciinema recording
    let recorder = null;
    if (opts.record) {
        try {
            // Check if asciinema is available
            const {execSync} = await import('child_process');
            execSync('which asciinema', {stdio: 'ignore'});
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const recordFile = `demos-${timestamp}.cast`;
            console.log(`  Recording to: ${recordFile}\n`);
            // Note: Full Asciinema integration would wrap the entire session
        } catch {
            console.log('  Asciinema not found, skipping recording\n');
        }
    }

    // Run demos
    for (const demo of demosToRun) {
        process.stdout.write(`  ${demo.name.padEnd(25)} `);

        try {
            const result = await runDemo(demo.path, {
                timeout: 30000,
                provider: opts.provider,
                model: opts.model
            });

            if (result.success) {
                console.log(`✓ ${formatDuration(result.duration)}`);
                results.passed++;
            } else {
                console.log(`✗ ${formatDuration(result.duration)}`);
                results.failed++;
                results.errors.push({
                    demo: demo.name,
                    path: demo.path,
                    error: result.error || result.stderr,
                    stdout: result.stdout
                });
            }
        } catch (err) {
            console.log(`✗ Error: ${err.message}`);
            results.failed++;
            results.errors.push({demo: demo.name, path: demo.path, error: err.message});
        }
    }

    // Summary
    console.log('\n' + '─'.repeat(60));
    console.log(`  Results: ${results.passed} passed, ${results.failed} failed`);

    if (results.errors.length > 0) {
        console.log('\n  Errors:');
        for (const err of results.errors) {
            console.log(`\n  ✗ ${err.demo} (${err.path})`);
            const errorLines = (err.error || '').split('\n').slice(0, 5);
            errorLines.forEach(line => console.log(`    ${line}`));
        }
    }

    console.log('\n' + '═'.repeat(60));

    // Exit with error code if any failed
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
