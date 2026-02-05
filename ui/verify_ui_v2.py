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

            print("Verifying Reasoning Derivation...")
            # Inject simulated reasoning event
            page.evaluate("""
                () => {
                    const app = window.Explorer;
                    if (app) {
                        // Mock derivation data structure matching SeNARS Core
                        const mockData = {
                            task: { term: "Concept_A", budget: { priority: 0.8 } },
                            belief: { term: "Concept_B", budget: { priority: 0.7 } },
                            derivedTask: { term: "Derived_C", budget: { priority: 0.9 } },
                            inferenceRule: "Deduction"
                        };

                        // Manually trigger the handler since we can't easily emit internal NAR events from here
                        app._onDerivation(mockData);
                        app.graph.scheduleLayout();
                    }
                }
            """)
            time.sleep(2) # Wait for layout
            page.screenshot(path="verification/derivation-check.png")
            print("Captured derivation-check.png")

            print("Verifying Shortcuts Modal...")
            page.keyboard.press("?")
            time.sleep(1)
            page.screenshot(path="verification/shortcuts-check.png")
            print("Captured shortcuts-check.png")

            print("Verifying Narsese Input...")
            page.keyboard.press("Escape") # Close modal
            time.sleep(0.5)
            # Inject Narsese derivation manually via REPL input
            page.type("#status-repl-input", "<A --> B>.")
            page.keyboard.press("Enter")
            time.sleep(0.5)
            page.type("#status-repl-input", "<B --> C>.")
            page.keyboard.press("Enter")
            time.sleep(1)
            # We can't easily verify the graph structure from here without deep inspection,
            # but we can take a screenshot of the result.
            page.screenshot(path="verification/narsese-check.png")
            print("Captured narsese-check.png")

            print("Verifying MeTTa Input...")
            page.type("#status-repl-input", "! (let $x 10)")
            page.keyboard.press("Enter")
            time.sleep(1)
            page.screenshot(path="verification/metta-check.png")
            print("Captured metta-check.png")

            print("Verifying Trace Path...")
            # Select the derived node from previous step
            page.evaluate("window.Explorer.graph.focusNode('Derived_C')")
            time.sleep(1)
            # Click trace button in inspector (if visible) or trigger directly
            page.evaluate("window.Explorer.inspectorPanel.onTrace('Derived_C')")
            time.sleep(2)
            page.screenshot(path="verification/trace-path-check.png")
            print("Captured trace-path-check.png")

        except Exception as e:
            print(f"Error verification: {e}")

        browser.close()

if __name__ == "__main__":
    verify_ui_v2()
