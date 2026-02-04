import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log('Navigating to Explorer...');
    // Listen for console logs from the page
    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        if (text.includes('ExplorerApp') || text.includes('NAR') || type === 'error') {
            console.log(`[Browser ${type}] ${text}`);
        }
    });

    await page.goto('http://localhost:8085/explorer.html');

    // Wait for init
    console.log('Waiting for initialization...');
    await page.waitForTimeout(3000);

    // Switch to Control Mode
    console.log('Switching to Control Mode...');
    await page.click('.mode-btn[data-mode="control"]');

    // Ensure Log Panel is visible
    console.log('Checking Log Panel visibility...');
    const logWidget = await page.$('#log-widget');
    const isVisible = await logWidget.isVisible();

    if (!isVisible) {
        console.log('Log Panel is hidden, toggling it ON...');
        const toggleLogs = await page.$('#toggle-logs');
        if (!toggleLogs) throw new Error('#toggle-logs button not found');
        await toggleLogs.click();
        await page.waitForSelector('#log-widget', { state: 'visible', timeout: 5000 });
    } else {
        console.log('Log Panel is already visible.');
    }

    // Input Narsese via REPL
    console.log('Inputting Narsese: <live --> reasoning>.');
    await page.fill('#status-repl-input', '<live --> reasoning>.');
    await page.press('#status-repl-input', 'Enter');

    // Wait for log update - look for "INPUT: <live --> reasoning>"
    console.log('Waiting for log entry...');
    try {
        await page.waitForFunction(() => {
            const logs = document.getElementById('log-content');
            return logs && logs.innerText.includes('live --> reasoning');
        }, { timeout: 5000 });
        console.log('Log entry found.');
    } catch (e) {
        console.error('Timed out waiting for log entry.');
        // Dump current logs
        const logs = await page.evaluate(() => document.getElementById('log-content')?.innerText);
        console.log('Current Logs:', logs);
    }

    // Wait for graph update
    console.log('Waiting for graph nodes...');
    await page.waitForTimeout(2000); // Give layout time

    // Check nodes count via ExplorerApp instance if available
    const nodeCount = await page.evaluate(() => {
        if (window.Explorer && window.Explorer.graph && window.Explorer.graph.cy) {
            return window.Explorer.graph.cy.nodes().length;
        }
        return -1;
    });
    console.log(`Node count: ${nodeCount}`);

    console.log('Taking screenshot...');
    await page.screenshot({ path: 'verification/verification_logs.png', fullPage: true });

    console.log('Done.');
  } catch (e) {
    console.error('Verification failed:', e);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
