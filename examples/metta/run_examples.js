#!/usr/bin/env node
/**
 * MeTTa Examples Runner
 * Loads and executes all .metta example files
 */

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

import {MeTTaInterpreter, TermFactory, Term} from '@senars/nar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const findMettaFiles = (dir) =>
    fs.readdirSync(dir, {withFileTypes: true}).flatMap(item => {
        const fullPath = path.join(dir, item.name);
        return item.isDirectory() ? findMettaFiles(fullPath) :
            item.name.endsWith('.metta') ? [fullPath] : [];
    });

const runFile = (filePath) => {
    const relativePath = path.relative(__dirname, filePath);
    console.log(`\n${'='.repeat(70)}\nRunning: ${relativePath}\n${'='.repeat(70)}`);

    Term.clearSymbolTable();
    const interpreter = new MeTTaInterpreter({
        termFactory: new TermFactory(),
        typeChecking: false,
        loadStdlib: true,
        maxReductionSteps: 100000
    });

    try {
        const code = fs.readFileSync(filePath, 'utf-8');
        console.log(code, '\nResults:\n' + '-'.repeat(70));

        console.time('Execution Time');
        const results = interpreter.run(code);
        console.timeEnd('Execution Time');

        results.forEach((result, i) => console.log(`${i + 1}. ${result?.toString() ?? 'null'}`));
        return {success: true, file: filePath};
    } catch (error) {
        console.error(`✗ Error: ${error.message}\n${error.stack}`);
        return {success: false, file: filePath, error: error.message};
    }
};

console.log('MeTTa Examples Runner\n' + '='.repeat(70));
const files = findMettaFiles(__dirname);
console.log(`Found ${files.length} example files\n`);

const results = files.map(runFile);
const failed = results.filter(r => !r.success);

console.log(`\n${'='.repeat(70)}\nSummary\n${'='.repeat(70)}`);
console.log(`Total: ${files.length}\nSuccess: ${files.length - failed.length}\nFailed: ${failed.length}`);

if (failed.length > 0) {
    console.log('\nFailed files:');
    failed.forEach(({file, error}) => console.log(`  - ${path.relative(__dirname, file)}: ${error}`));
    process.exit(1);
}
