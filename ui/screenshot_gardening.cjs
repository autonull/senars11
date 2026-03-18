
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/explorer.html');
  await page.waitForSelector('#graph-container canvas');

  // Switch to Control Mode
  await page.click('.mode-btn[data-mode="control"]');

  // Wait a bit for transition
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'verification/explorer_gardening_ui.png' });
  await browser.close();
})();
