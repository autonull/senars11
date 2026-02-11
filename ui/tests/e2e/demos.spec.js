import {expect, test} from './fixtures/production-fixture.js';

test.describe('Demos Verification', () => {
    test.describe.configure({mode: 'serial'});

    test('Runs Basic Usage Demo', async ({productionPage}) => {
        // Ensure sidebar is open to see demo select
        await productionPage.ensureSidebarOpen();

        const demoSelect = productionPage.page.locator('#demo-select');
        const runDemoBtn = productionPage.page.locator('#run-demo');

        // Select 'Basic Usage Demo'
        await demoSelect.selectOption({value: 'basicUsage'});
        await runDemoBtn.click();

        // Wait for demo completion
        await productionPage.expectLog('Demo completed', 20000);

        // Verify no errors
        const logs = await productionPage.logsContainer.textContent();
        expect(logs).not.toContain('Error');
    });

    test('Runs Causal Reasoning Demo (File)', async ({productionPage}) => {
        await productionPage.resetSystem();
        await productionPage.ensureSidebarOpen();

        const demoSelect = productionPage.page.locator('#demo-select');
        const runDemoBtn = productionPage.page.locator('#run-demo');

        await demoSelect.selectOption({value: 'causal-reasoning'});
        await runDemoBtn.click();

        await productionPage.expectLog('Demo completed successfully', 20000);

        const logs = await productionPage.logsContainer.textContent();
        expect(logs).not.toContain('Error');
    });

    test('Runs Syllogism Demo', async ({productionPage}) => {
        await productionPage.resetSystem();
        await productionPage.ensureSidebarOpen();

        const demoSelect = productionPage.page.locator('#demo-select');
        const runDemoBtn = productionPage.page.locator('#run-demo');

        await demoSelect.selectOption({value: 'syllogism'});
        await runDemoBtn.click();

        await productionPage.expectLog('Syllogistic reasoning demo completed', 20000);

        const logs = await productionPage.logsContainer.textContent();
        expect(logs).not.toContain('Error');
    });

    test('Runs Inductive Demo', async ({productionPage}) => {
        await productionPage.resetSystem();
        await productionPage.ensureSidebarOpen();

        const demoSelect = productionPage.page.locator('#demo-select');
        const runDemoBtn = productionPage.page.locator('#run-demo');

        await demoSelect.selectOption({value: 'inductive'});
        await runDemoBtn.click();

        await productionPage.expectLog('Inductive reasoning demo completed', 20000);

        const logs = await productionPage.logsContainer.textContent();
        expect(logs).not.toContain('Error');
    });
});
