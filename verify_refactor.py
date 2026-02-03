from playwright.sync_api import sync_playwright
import time

def verify_refactor():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 720})

        # Capture console logs
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

        print("Navigating to Explorer...")
        page.goto("http://localhost:8080/explorer.html")

        print("Waiting for graph container...")
        page.wait_for_selector("#graph-container")
        time.sleep(2)

        # Verify styles loaded (graph visible)
        print("Taking screenshot: Refactor Verification...")
        page.screenshot(path="/home/jules/verification/explorer_refactor.png")

        # Verify interactions still work (e.g. search binding)
        print("Testing Search binding...")
        page.fill("#search-input", "Sun")
        time.sleep(1)

        # Verify layer toggle binding
        print("Testing Layer Toggle binding...")
        toggle = page.locator("input[data-layer='tasks']")
        if toggle.count() > 0:
            toggle.click()
            print("Layer toggle clicked.")
        else:
            print("ERROR: Layer toggle not found!")

        browser.close()
        print("Verification complete.")

if __name__ == "__main__":
    verify_refactor()
