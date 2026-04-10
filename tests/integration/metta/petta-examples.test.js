import {spawn} from 'child_process';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXAMPLES_DIR = path.resolve(__dirname, '../../metta/examples');
const RUNNER = path.resolve(__dirname, '../../scripts/run-single-metta.js');
const TIMEOUT_MS = 1000;

const SKIPPED_FILES = new Set([
    'git_import.metta', 'git_import2.metta', 'fibsmartimport.metta',
    'library.metta', 'nars_direct.metta', 'nars_tuffy.metta',
    'llm_cities.metta', 'metta4_streams.metta', 'mutex_and_transaction.metta',
    'he_atomspace.metta'
]);

const results = {success: [], timeout: [], error: [], skipped: []};
const mettaFiles = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.metta')).sort();

function runOne(file) {
    return new Promise((resolve) => {
        if (SKIPPED_FILES.has(file)) { results.skipped.push(file); resolve(); return; }

        const child = spawn('node', ['--experimental-vm-modules', RUNNER, file, String(TIMEOUT_MS)], {
            stdio: ['ignore', 'ignore', 'ignore']
        });

        let killed = false;
        const timer = setTimeout(() => { child.kill('SIGKILL'); killed = true; results.timeout.push(file); resolve({timeout: true}); }, TIMEOUT_MS + 500);

        child.on('exit', (code, signal) => {
            clearTimeout(timer);
            if (killed) return;
            if (code === 0) { results.success.push(file); resolve({ok: true}); }
            else if (signal === 'SIGKILL') { results.timeout.push(file); resolve({timeout: true}); }
            else { results.error.push({file}); resolve({error: true}); }
        });

        child.on('error', () => {
            clearTimeout(timer);
            if (!killed) { results.error.push({file}); resolve({error: true}); }
        });
    });
}

afterAll(() => {
    const total = mettaFiles.length;
    const {success, timeout: to, error, skipped} = results;
    console.log('\n========================================');
    console.log('PeTTa Examples Test Report');
    console.log(`Timeout: ${TIMEOUT_MS}ms per file`);
    console.log('========================================');
    console.log(`Total files:    ${total}`);
    console.log(`✓ Passed:      ${success.length}`);
    console.log(`⏱ Timeout:     ${to.length}`);
    console.log(`✗ Errors:      ${error.length}`);
    console.log(`⊘ Skipped:     ${skipped.length}`);
    const runCount = total - skipped.length;
    console.log(`Success rate:  ${runCount > 0 ? Math.round(success.length / runCount * 100) : 0}%`);
    console.log('========================================\n');
});

describe.each(mettaFiles)('%s', (file) => {
    test('executes within timeout', async () => {
        const r = await runOne(file);
        if (SKIPPED_FILES.has(file)) return;
        if (r?.timeout) throw new Error(`Timeout after ${TIMEOUT_MS}ms`);
        if (r?.error) throw new Error('Execution error');
    }, TIMEOUT_MS + 2000);
});
