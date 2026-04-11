#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

// Adjust path to point to core
import {MeTTaInterpreter, TermFactory} from '@senars/nar';

const run = async () => {
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error('Usage: node scripts/run_metta.js <file.metta>');
        process.exit(1);
    }

    const filePath = path.resolve(args[0]);
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    console.log(`Running: ${filePath}`);
    const code = fs.readFileSync(filePath, 'utf-8');

    const termFactory = new TermFactory();

    // We might need to load stdlib manually or the interpreter does it?
    // Looking at StdlibLoader, it seems MeTTaInterpreter uses it if we don't pass one, 
    // or we should check MeTTaInterpreter constructor.
    // Given the conversation history, StdlibLoader was implemented.

    const interpreter = new MeTTaInterpreter(null, {
        termFactory,
        // Assuming default config loads stdlib or is configured to do so
    });

    try {
        const results = interpreter.run(code);
        console.log('Results:');
        results.forEach((result, i) => {
            console.log(`${i + 1}. ${result?.toString() ?? 'null'}`);
        });
    } catch (error) {
        console.error('Error executing MeTTa code:');
        console.error(error);
    }
};

run();
