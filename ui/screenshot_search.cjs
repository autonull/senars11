
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/explorer.html');
  await page.waitForSelector('#graph-container canvas');

  // Type in search
  await page.fill('#search-input', 'Sun');

  await page.screenshot({ path: 'verification/explorer_search_ui.png' });
  await browser.close();
})();
