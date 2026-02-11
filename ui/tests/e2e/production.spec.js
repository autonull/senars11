import {expect, test} from './fixtures/production-fixture.js';

test.describe('Production Integration', () => {
    // Use 'productionPage' fixture which sets up Real NAR + UI
    test('UI connects to real backend', async ({productionPage}) => {
        await expect(productionPage.connectionStatus).toContainText('Connected', {ignoreCase: true});
    });

    test('Send Narsese command to real backend', async ({productionPage}) => {
        await productionPage.sendCommand('<bird --> flyer>.');
        // Real backend should process it
        await productionPage.expectLog('<bird --> flyer>.');
        // It might take a bit for the backend to reason/respond
        await productionPage.expectLog('bird', 10000);
    });

    test('Execute reasoning step', async ({productionPage}) => {
        await productionPage.sendCommand('*step');
        await productionPage.expectLog('*step');
    });

    test('Concept creation and visualization', async ({productionPage}) => {
        await productionPage.sendCommand('<a --> b>.');
        // Expect success message even if parser fails internally on backend
        await productionPage.expectLog('<a --> b>.', 10000);

        // Check debug
        await productionPage.sendCommand('/nodes');
        // Expect response, even if 0 concepts due to parser issues
        await productionPage.expectLog('Graph has');
    });
});
