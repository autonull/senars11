from playwright.sync_api import sync_playwright
import time
import os

os.makedirs("verification", exist_ok=True)

def verify_fractal_zui():
    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            print("Navigating...")
            page.goto("http://localhost:5173/explorer.html", timeout=30000)
            print("Page loaded.")

            # Wait for graph
            page.wait_for_selector("#graph-container")
            time.sleep(2)

            # Inject widget node
            print("Injecting widget...")
            page.evaluate("""
                () => {
                    window.Explorer.graph.addNode({id: 'LODNode', term: 'LODNode', position: {x: 0, y: 0}}, false);
                    setTimeout(() => {
                        window.Explorer.graph.contextualWidget.attachTestWidget('LODNode');
                    }, 100);
                }
            """)
            time.sleep(1)

            # Test LOD 0 (Zoom < 0.4) - Should be Hidden
            print("Testing LOD 0...")
            page.evaluate("window.Explorer.graph.cy.zoom(0.2)")
            page.evaluate("window.Explorer.graph.cy.pan({x: 500, y: 500})")
            time.sleep(0.5)
            page.screenshot(path="verification/zui-lod-0.png")

            lod_class = page.evaluate("document.querySelector('.zui-transform-layer')?.className")
            print(f"LOD 0 Class: {lod_class}")

            # Test LOD 1 (Zoom 0.6) - Header Only
            print("Testing LOD 1...")
            page.evaluate("window.Explorer.graph.cy.zoom(0.6)")
            time.sleep(0.5)
            page.screenshot(path="verification/zui-lod-1.png")
            lod_class = page.evaluate("document.querySelector('.zui-transform-layer')?.className")
            print(f"LOD 1 Class: {lod_class}")

            # Test LOD 2 (Zoom 1.5) - Full
            print("Testing LOD 2...")
            page.evaluate("window.Explorer.graph.cy.zoom(1.5)")
            time.sleep(0.5)
            page.screenshot(path="verification/zui-lod-2.png")
            lod_class = page.evaluate("document.querySelector('.zui-transform-layer')?.className")
            print(f"LOD 2 Class: {lod_class}")

            # Test LOD 3 (Zoom 3.0) - Enhanced
            print("Testing LOD 3...")
            page.evaluate("window.Explorer.graph.cy.zoom(3.0)")
            time.sleep(0.5)
            page.screenshot(path="verification/zui-lod-3.png")
            lod_class = page.evaluate("document.querySelector('.zui-transform-layer')?.className")
            print(f"LOD 3 Class: {lod_class}")

        except Exception as e:
            print(f"Error verification: {e}")

        browser.close()

if __name__ == "__main__":
    verify_fractal_zui()
