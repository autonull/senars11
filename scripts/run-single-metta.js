#!/usr/bin/env node
/**
 * Run a single .metta file. Used as child process by run-petta-examples.js.
 * Usage: node run-single-metta.js <file> <timeout_ms>
 * Exits 0 on success, 1 on error or test assertion failure.
 */
import {createMeTTa} from '../metta/src/MeTTa.js';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(__dirname, '../metta/examples');
const file = process.argv[2];
const TIMEOUT_MS = parseInt(process.argv[3], 10) || 1000;

const code = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf-8');
const m = createMeTTa({loadStdlib: false});

const results = await Promise.race([
    m.runAsync(code),
    new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), TIMEOUT_MS))
]);

// Check if any result is an Error atom (from test assertion failure)
const hasError = results?.some(r =>
    r.operator?.name === 'Error' ||
    (r.name === 'Error' && r.components)
);

process.exit(hasError ? 1 : 0);
