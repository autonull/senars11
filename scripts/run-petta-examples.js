#!/usr/bin/env node
/**
 * Runs each PeTTa .metta example as a separate child process.
 * Each process is killed after TIMEOUT_MS (default 1000ms).
 * Output from individual tests is suppressed.
 *
 * Usage:
 *   node run-petta-examples.js          # 1s per file
 *   node run-petta-examples.js 500      # 500ms per file
 *   TIMEOUT_MS=2000 node run-petta-examples.js
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {spawn} from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(__dirname, '../metta/examples');
const RUNNER = path.resolve(__dirname, 'run-single-metta.js');
const TIMEOUT_MS = parseInt(process.argv[2] || process.env.TIMEOUT_MS || 1000, 10);

const SKIPPED_FILES = new Set([
    'git_import.metta', 'git_import2.metta', 'fibsmartimport.metta',
    'library.metta', 'nars_direct.metta', 'nars_tuffy.metta',
    'llm_cities.metta', 'metta4_streams.metta', 'mutex_and_transaction.metta',
    'he_atomspace.metta'
]);

const files = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.metta')).sort();
const results = {pass: 0, timeout: 0, error: 0, skip: 0};

function runOne(file) {
    return new Promise((resolve) => {
        if (SKIPPED_FILES.has(file)) { results.skip++; resolve('⊘'); return; }

        const child = spawn('node', ['--experimental-vm-modules', RUNNER, file, String(TIMEOUT_MS)], {
            stdio: ['ignore', 'ignore', 'ignore']
        });

        let killed = false;
        const timer = setTimeout(() => { child.kill('SIGKILL'); killed = true; results.timeout++; resolve('⏱'); }, TIMEOUT_MS + 500);

        child.on('exit', (code, signal) => {
            clearTimeout(timer);
            if (killed) return;
            if (code === 0) { results.pass++; resolve('✓'); }
            else if (signal === 'SIGKILL') { results.timeout++; resolve('⏱'); }
            else { results.error++; resolve('✗'); }
        });

        child.on('error', () => {
            clearTimeout(timer);
            if (!killed) { results.error++; resolve('✗'); }
        });
    });
}

for (const f of files) {
    const s = await runOne(f);
    console.log(`${s} ${f}`);
}

const total = files.length, runCount = total - results.skip;
console.log(`\nTotal: ${total} | ✓ ${results.pass} | ⏱ ${results.timeout} | ✗ ${results.error} | ⊘ ${results.skip} | ${runCount > 0 ? Math.round(results.pass / runCount * 100) : 0}%`);
process.exit(results.error > 0 || results.timeout > 0 ? 1 : 0);
