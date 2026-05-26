import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {MeTTaInterpreter} from '@senars/metta/src/MeTTaInterpreter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runDemo = async () => {
    const demoName = 'maze_solver';
    const filePath = path.join(__dirname, '../../..', `examples/metta/demos/${demoName}.metta`);
    console.log(`\n=== Running Demo (Fresh): ${demoName} ===`);

    try {
        // Load Stdlib default
        const interpreter = new MeTTaInterpreter(null, {loadStdlib: true});

        // Wait for stdlib? It's sync.
        console.log(`Space size: ${interpreter.space.getAtomCount()}`);

        // DEBUG: Dump empty? rules
        const rules = interpreter.space.getRules().filter(r => r.pattern.toString().includes('empty?'));
        console.log("DEBUG: Found empty? rules:", rules.length);
        rules.forEach((r, i) => console.log(`Rule ${i}: ${r.pattern.toString()}`));

        // DEBUG: Manual Unify
        const debugExprCode = '(empty? (: (At 0 0) ()))';
        const debugExpr = interpreter.parser.parseMeTTa(debugExprCode)[0].term;
        console.log("DEBUG: Unifying expr:", debugExpr.toString());
        if (rules.length > 1) {
            const bindings = interpreter.matchEngine.unify(rules[1].pattern, debugExpr);
            console.log("DEBUG: Manual Unify Result:", bindings ? "SUCCESS" : "FAILURE");
            if (bindings) console.log("Bindings:", bindings);
        }
    }

    let code = fs.readFileSync(filePath, 'utf-8');
    // Remove import lines to avoid re-importing stdlib via metta
    // The file imports: core, list, search.
    // Interpreter loads: core, list, match, types, truth, nal, attention, control, search, learn.
    // So we can safely remove imports.
    code = code.replace(/^\s*\(import!.*\)/gm, '; (Implicilty imported)');

    const results = interpreter.run(code);

    console.log('Results:');
    results.forEach((res, i) => console.log(`${i + 1}. ${res}`));
}
catch
(e)
{
    console.error(`FAILED: ${e.message}`);
    console.error(e.stack);
}
}


runDemo();
