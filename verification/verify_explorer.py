from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_explorer(page: Page):
    print("Navigating to Explorer...")
    page.goto("http://localhost:8080/explorer.html")

    print("Waiting for page load...")
    expect(page).to_have_title("SeNARS Explorer")

    print("Checking HUD elements...")
    expect(page.locator("h1")).to_have_text("SeNARS Explorer")
    expect(page.locator(".mode-btn[data-mode='visualization']")).to_be_visible()

    print("Waiting for graph to render...")
    # Wait for canvas to appear
    canvas = page.locator("#graph-container canvas").first
    expect(canvas).to_be_visible(timeout=10000)

    # Wait for nodes to settle (animations)
    time.sleep(2)

    print("Taking screenshot of initial state...")
    page.screenshot(path="verification/explorer_init.png")

    print("Switching mode...")
    page.click(".mode-btn[data-mode='representation']")
    import re
    expect(page.locator(".mode-btn[data-mode='representation']")).to_have_class(re.compile(r"active"))

    print("Taking screenshot of Representation mode...")
    page.screenshot(path="verification/explorer_rep.png")

    print("Opening LLM Config...")
    page.click("#btn-llm-config")
    expect(page.locator("#lm-config-overlay")).to_be_visible()

    print("Taking screenshot of LLM Config...")
    page.screenshot(path="verification/explorer_llm_config.png")

    print("Verification complete.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Set viewport size to capture everything nicely
        page.set_viewport_size({"width": 1280, "height": 720})
        try:
            verify_explorer(page)
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
