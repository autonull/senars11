from playwright.sync_api import sync_playwright
import time
import os

os.makedirs("verification", exist_ok=True)

def verify_refactor():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            print("Navigating to IDE...")
            page.goto("http://localhost:8080/ide.html")
            time.sleep(5) # Wait for load

            # Screenshot IDE View
            page.screenshot(path="verification/ui_ide.png")
            print("Captured ui_ide.png")

            # Check for notebook elements
            notebook = page.locator('.notebook-container')
            if notebook.is_visible():
                print("Notebook container is visible")
            else:
                print("Notebook container NOT visible")

            # Check for grid cell wrapper if any cells exist (might be empty initially)
            # NotebookManager creates a view container.

            # We can check if settings panel loads
            # But that requires clicking sidebar/settings button which might be complex without seeing it

        except Exception as e:
            print(f"Error verification: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_refactor()
