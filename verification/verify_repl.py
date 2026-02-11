from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_explorer_repl(page: Page):
    print("Navigating to Explorer...")
    page.goto("http://localhost:8080/explorer.html")

    print("Waiting for page load...")
    expect(page).to_have_title("SeNARS Explorer")

    print("Checking REPL input...")
    input_locator = page.locator("#repl-input")
    expect(input_locator).to_be_visible()

    print("Entering command '/help'...")
    input_locator.fill("/help")
    input_locator.press("Enter")

    print("Checking log for output...")
    log_content = page.locator("#log-content")
    expect(log_content).to_contain_text("> /help")
    expect(log_content).to_contain_text("Available commands: /clear, /help")

    print("Waiting for graph to render edges...")
    # Wait for canvas to appear
    canvas = page.locator("#graph-container canvas").first
    expect(canvas).to_be_visible(timeout=10000)
    time.sleep(2) # Wait for layout animation

    print("Taking screenshot of REPL and Edges...")
    page.screenshot(path="verification/explorer_repl_edges_final.png")

    print("Verification complete.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 720})
        try:
            verify_explorer_repl(page)
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/error_repl.png")
        finally:
            browser.close()
