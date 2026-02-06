import asyncio
from playwright.async_api import async_playwright
import os

async def verify_panels():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        url = 'http://localhost:5173/explorer.html'

        print(f"Loading Explorer from: {url}")
        try:
            await page.goto(url)
        except Exception as e:
            print(f"Failed to load URL: {e}")
            print("Make sure the Vite server is running on port 5173.")
            await browser.close()
            return

        # Wait for App initialization
        print("Waiting for ExplorerApp (window.Explorer)...")
        try:
            await page.wait_for_function("() => window.Explorer", timeout=10000)
        except Exception as e:
            print(f"ExplorerApp did not initialize: {e}")
            await page.screenshot(path='verification/error-init.png')
            await browser.close()
            return

        await asyncio.sleep(2)  # Allow UI to settle

        print("Injecting Dummy Data into Panels...")

        # Inject logs
        await page.evaluate("""
            const app = window.Explorer;
            if (app && app.logPanel) {
                app.logPanel.addLog('System initialized successfully.', 'system');
                app.logPanel.addLog('User command received: <cat --> animal>.', 'user');
                app.logPanel.addLog('Concept "cat" created.', 'agent');
                app.logPanel.addLog('Warning: Memory pressure high.', 'warning');
                app.logPanel.addLog('Error: Connection lost.', 'error');
                app.logPanel.addLog('Task processed: <dog --> animal>.', 'success');
            } else {
                console.error("LogPanel not found");
            }
        """)

        # Inject metrics
        await page.evaluate("""
            const app = window.Explorer;
            if (app && app.metricsPanel) {
                // Simulate a history of updates
                let tps = 10;
                for (let i = 0; i < 20; i++) {
                    tps += (Math.random() - 0.5) * 5;
                    if (tps < 0) tps = 0;
                    app.metricsPanel.update({
                        performance: { throughput: tps, avgLatency: 5 + Math.random() * 2 },
                        resourceUsage: { heapUsed: 500 + i*10, heapTotal: 1000 },
                        taskProcessing: { totalProcessed: 100 + i, successful: 100 + i },
                        reasoningSteps: 500 + i*5,
                        uptime: 10000 + i*500
                    });
                }
            } else {
                console.error("MetricsPanel not found");
            }
        """)

        await asyncio.sleep(1)

        # Ensure directory exists
        if not os.path.exists('verification'):
            os.makedirs('verification')

        print("Capturing System Metrics Panel...")
        metrics_widget = page.locator('#metrics-widget')
        if await metrics_widget.count() > 0:
            # Force visible if hidden (just in case, for verification)
            await page.evaluate("document.querySelector('#metrics-widget').classList.remove('hidden')")
            await metrics_widget.screenshot(path='verification/7-panel-metrics.png')
        else:
            print("Metrics widget not found in DOM!")

        print("Capturing Log Panel...")
        # The log panel might be in a widget container
        log_panel = page.locator('.log-panel-container')
        if await log_panel.count() > 0:
            # Ensure parent widget is visible
            await page.evaluate("""
                const el = document.querySelector('.log-panel-container');
                if (el && el.closest('.hud-widget')) {
                    el.closest('.hud-widget').classList.remove('hidden');
                }
            """)
            await log_panel.screenshot(path='verification/8-panel-logs.png')
        else:
            print("Log panel not found in DOM!")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_panels())
