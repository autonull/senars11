from playwright.sync_api import sync_playwright
import time
import os

os.makedirs("verification", exist_ok=True)

def verify_versatile():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1400, "height": 900})

        try:
            print("Loading Explorer...")
            page.goto("http://localhost:5173/explorer.html")
            # Wait for app to be ready
            page.wait_for_selector("#graph-container")
            time.sleep(2)

            print("Opening Task Browser...")
            page.evaluate("window.Explorer.layoutManager.show('tasks')")
            time.sleep(1)

            print("Injecting Complex Scenario...")
            page.evaluate("""
                () => {
                    const app = window.Explorer;
                    // 1. Beliefs
                    app._onTaskAdded({
                        term: "cat",
                        type: "concept",
                        budget: { priority: 0.9 }
                    });
                    app._onTaskAdded({
                        term: "animal",
                        type: "concept",
                        budget: { priority: 0.8 }
                    });

                    // Link A -> B
                    app.graph.addEdge({ source: "cat", target: "animal", type: "inheritance" }, true);

                    // 2. Goal
                    app._onTaskAdded({
                        term: "cat_fed",
                        type: "goal",
                        punctuation: "!",
                        budget: { priority: 0.95 },
                        truth: null
                    });

                    // 3. Question
                    app._onTaskAdded({
                        term: "cat_status",
                        type: "question",
                        punctuation: "?",
                        budget: { priority: 0.85 },
                        truth: null
                    });

                    // 4. Derived Belief
                    const derived = {
                        term: "cat_living",
                        type: "judgment",
                        punctuation: ".",
                        budget: { priority: 0.88 },
                        truth: { f: 0.9, c: 0.8 },
                        derivation: {
                            rule: "Deduction",
                            sources: ["cat", "animal"]
                        }
                    };
                    app._onTaskAdded(derived);
                    app._onDerivation({
                        task: { term: "cat" },
                        belief: { term: "animal" },
                        derivedTask: derived,
                        inferenceRule: "Deduction"
                    });

                    app.graph.scheduleLayout();
                }
            """)
            time.sleep(3) # Wait for layout

            # 1. Full View
            page.screenshot(path="verification/1-full-scenario.png")
            print("Captured 1-full-scenario.png")

            # 2. Filter Interaction
            print("Testing Filters...")
            # Toggle Beliefs OFF
            page.click(".btn-toggle[data-type='belief']")
            time.sleep(1)
            page.screenshot(path="verification/2-filter-no-belief.png")
            print("Captured 2-filter-no-belief.png")

            # Toggle Goals OFF
            page.click(".btn-toggle[data-type='goal']")
            time.sleep(1)
            page.screenshot(path="verification/3-filter-questions-only.png")
            print("Captured 3-filter-questions-only.png")

            # Reset Filters (Toggle Beliefs ON, Goals ON)
            page.click(".btn-toggle[data-type='belief']")
            page.click(".btn-toggle[data-type='goal']")
            time.sleep(1)

            # 3. Graph Theme Verification
            print("Verifying Graph Theme...")
            # Ensure color mode is 'type' (might be default or need setting)
            page.evaluate("window.Explorer.mappings.color = 'type'; window.Explorer._updateGraphStyle();")
            time.sleep(1)
            page.screenshot(path="verification/4-graph-theme-types.png")
            print("Captured 4-graph-theme-types.png")

            # 4. Interaction: Tracing
            print("Testing Tracing...")
            # Click the trace button on the derived task 'cat_living'
            # We need to find the element. It's inside a details element.
            # First, expand the concept 'cat_living' (or finding the item inside it)
            # The Task Browser groups by Concept. 'cat_living' is the term.

            # Expand details for 'cat_living'
            # Note: The details might be collapsed by default.
            # Selector: details summary[title='cat_living']

            # Since 'cat_living' was added, it should be in the list.
            # However, the list renders "Concept Groups".
            # The "Derived Task" is inside the concept group "cat_living".

            # Wait for it to appear
            page.wait_for_selector("summary[title='cat_living']")
            page.click("summary[title='cat_living']") # Expand
            time.sleep(0.5)

            # Click Trace button (.trace-task-btn)
            # It appears on hover, but we can force click or hover.
            # Let's target the specific task item's trace button.
            # locator: .sub-task-item[data-term='cat_living'] .trace-task-btn

            # We trigger the click (Playwright can click hidden/hover-only elements if force=True or we hover first)
            page.hover(".sub-task-item[data-term='cat_living']")
            time.sleep(0.2)
            page.click(".sub-task-item[data-term='cat_living'] .trace-task-btn", force=True)

            time.sleep(1) # Wait for animation
            page.screenshot(path="verification/5-trace-active.png")
            print("Captured 5-trace-active.png")

            # 5. Interaction: Selection Focus
            print("Testing Focus...")
            # Click the concept 'cat' summary to focus it
            page.click("summary[title='cat']")
            time.sleep(1) # Wait for zoom animation
            page.screenshot(path="verification/6-focus-cat.png")
            print("Captured 6-focus-cat.png")

        except Exception as e:
            print(f"Error verification: {e}")
            import traceback
            traceback.print_exc()

        browser.close()

if __name__ == "__main__":
    verify_versatile()
