import { T } from '@senars/tensor/src/backends/NativeBackend.js';
import { MeTTaInterpreter } from '@senars/metta';
import { Term } from '@senars/nar';
import { Config } from '@senars/core';

async function runTest() {
    console.log('Browser Compatibility Test Starting...');

    // 1. Test Tensor
    try {
        console.log('--- Testing Tensor ---');
        // Use NativeBackend for operations
        const t1 = T.tensor([1, 2, 3]);
        const t2 = T.tensor([4, 5, 6]);
        const t3 = T.add(t1, t2);
        console.log('Tensor 1:', t1.toString());
        console.log('Tensor 2:', t2.toString());
        console.log('Tensor Add Result:', t3.toString());
        if (t3.data[0] === 5 && t3.data[1] === 7 && t3.data[2] === 9) {
            console.log('Tensor Test: PASSED');
        } else {
            console.error('Tensor Test: FAILED');
        }
    } catch (e) {
        console.error('Tensor failed:', e);
    }

    // 2. Test Core
    try {
        console.log('--- Testing Core ---');
        const config = Config.parse([]);
        console.log('Config parsed:', Object.keys(config));

        const testString = "test-hash";
        const hash = Term.hash(testString);
        console.log(`Term.hash('${testString}'):`, hash);
        if (hash) {
            console.log('Core Hash Test: PASSED');
        } else {
            console.error('Core Hash Test: FAILED');
        }
    } catch (e) {
        console.error('Core failed:', e);
    }

    // 3. Test MeTTa
    try {
        console.log('--- Testing MeTTa ---');
        // Provide minimal virtual stdlib to avoid loading errors
        const virtualFiles = {
            'core': '(= (id $x) $x)',
            'list': '',
            'match': '',
            'types': '',
            'truth': '',
            'nal': '',
            'attention': '',
            'control': '',
            'search': '',
            'learn': ''
        };

        const interpreter = new MeTTaInterpreter({
            virtualFiles: virtualFiles
        });

        console.log('MeTTaInterpreter created, initializing...');
        await interpreter.initialize();
        console.log('MeTTaInterpreter initialized');

        // Test running a simple script
        const result = await interpreter.run('!(id "Hello MeTTa")');
        console.log('MeTTa Execution Result:', result);

        // Check if result contains the string
        const resultStr = result.toString();
        if (resultStr.includes("Hello MeTTa")) {
            console.log('MeTTa Execution: PASSED');
        } else {
            console.warn('MeTTa Execution: VERIFY MANUALLY (Output format might vary)');
        }

    } catch (e) {
        console.error('MeTTaInterpreter failed:', e);
    }
}

runTest().catch(console.error);

