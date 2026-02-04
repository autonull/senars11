import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log('Navigating to Explorer...');
    await page.goto('http://localhost:8080/explorer.html');

    // Wait for init
    await page.waitForTimeout(2000);

    // Switch to Control Mode
    console.log('Switching to Control Mode...');
    await page.click('.mode-btn[data-mode="control"]');

    // Toggle Log Panel via StatusBar
    console.log('Toggling Log Panel...');
    await page.click('#toggle-logs');

    // Input Narsese via REPL to generate logs
    console.log('Inputting Narsese...');
    await page.fill('#status-repl-input', '<live --> reasoning>.');
    await page.press('#status-repl-input', 'Enter');

    // Wait for log update
    await page.waitForTimeout(1000);

    console.log('Taking screenshot...');
    await page.screenshot({ path: 'verification/verification_logs.png' });

    console.log('Done.');
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
