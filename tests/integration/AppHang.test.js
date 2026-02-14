import { App } from '../../agent/src/app/App.js';
import { jest } from '@jest/globals';

describe('App Initialization Integration', () => {
    jest.setTimeout(10000);

    test('should instantiate App without hanging', async () => {
        console.log('Test: Creating App...');
        const app = new App({
            lm: { enabled: false } // Disable LM first to check basic App init
        });
        console.log('Test: App created');
        expect(app).toBeDefined();

        console.log('Test: Starting App...');
        await app.start({ startAgent: false });
        console.log('Test: App started');

        await app.shutdown();
        console.log('Test: App shutdown');
    });

    test('should instantiate App with TransformersJS without hanging', async () => {
        console.log('Test: Creating App with LM...');
        const app = new App({
            lm: {
                enabled: true,
                provider: 'transformers',
                modelName: 'Xenova/LaMini-Flan-T5-248M',
                loadTimeout: 20000
            }
        });

        console.log('Test: Starting App with LM...');
        const agent = await app.start({ startAgent: true });
        console.log('Test: App started with LM');

        // Force model load by generating text
        console.log('Test: Generating text...');
        const response = await agent.processInput('Hello');
        console.log('Test: Response received:', response);
        expect(response).toBeDefined();

        await app.shutdown();
    }, 30000);
});
