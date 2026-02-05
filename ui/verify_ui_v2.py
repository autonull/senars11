from playwright.sync_api import sync_playwright
import time
import os

os.makedirs("verification", exist_ok=True)

def verify_ui_v2():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            print("Verifying Agent Simple...")
            page.goto("http://localhost:5173/agent-simple.html")
            time.sleep(2)
            page.screenshot(path="verification/agent-simple-check-v2.png")
            print("Captured agent-simple-check-v2.png")

            print("Verifying Metrics Dashboard...")
            page.goto("http://localhost:5173/metrics-dashboard.html")
            time.sleep(2)
            page.screenshot(path="verification/metrics-dashboard-check-v2.png")
            print("Captured metrics-dashboard-check-v2.png")

            print("Verifying Explorer...")
            page.goto("http://localhost:5173/explorer.html")
            time.sleep(5)

            # Inject logs to verify colors
            page.evaluate("""
                () => {
                    const app = window.Explorer;
                    if (app) {
                        app.log("System Message Check", "system");
                        app.log("User Input Check", "user");
                        app.log("Agent Response Check", "agent");
                        app.log("Error Message Check", "error");
                        app.log("Success Message Check", "success");
                    }
                }
            """)
            time.sleep(1)

            page.screenshot(path="verification/explorer-check-v2.png")
            print("Captured explorer-check-v2.png")

            print("Verifying Shortcuts Modal...")
            page.keyboard.press("?")
            time.sleep(1)
            page.screenshot(path="verification/shortcuts-check.png")
            print("Captured shortcuts-check.png")

        except Exception as e:
            print(f"Error verification: {e}")

        browser.close()

if __name__ == "__main__":
    verify_ui_v2()
