// Minimal browser test script
import { createNAR } from './core/src/index.browser.js';

console.log('Starting browser test...');
try {
    const nar = createNAR({
        memory: { capacity: 100 },
        lm: { enabled: false }
    });
    console.log('NAR initialized successfully');

    // Simulate basic usage
    nar.initialize().then(() => {
        console.log('NAR async initialized');
        nar.input('(cat --> animal).').then(() => {
            console.log('Input processed');
        });
    });
} catch (error) {
    console.error('Initialization failed:', error);
    process.exit(1);
}
