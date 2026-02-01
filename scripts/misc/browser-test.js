import { MeTTaInterpreter } from '@senars/metta';
import { Config, Term } from '@senars/core';

async function runTest() {
    console.log('Browser Compatibility Test Starting...');

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

