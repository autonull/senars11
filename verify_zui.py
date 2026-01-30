from playwright.sync_api import sync_playwright
import time

def verify_zui():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        page.on("console", lambda msg: print(f"Console: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PageError: {exc}"))

        try:
            page.goto("http://localhost:8080/senars-ui.html")

            # Wait for initialization (loader to disappear)
            page.wait_for_selector("#loader.hidden", state="attached", timeout=10000)

            # Wait a bit for graph animation/layout
            time.sleep(3)

            # Activate Scatter Mode
            page.click("#btn-scatter")
            time.sleep(1)

            # Take screenshot
            page.screenshot(path="verification_zui_enhanced.png")
            print("Screenshot saved to verification_zui_enhanced.png")
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification_zui_error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_zui()
