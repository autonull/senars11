from playwright.sync_api import sync_playwright
import time
import os
import sys

os.makedirs("verification", exist_ok=True)

def verify_fractal_zui():
    print("Starting verification...", flush=True)
    with sync_playwright() as p:
        print("Launching browser...", flush=True)
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}", flush=True))
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}", flush=True))

        try:
            print("Navigating to http://localhost:5173/explorer.html ...", flush=True)
            page.goto("http://localhost:5173/explorer.html", timeout=10000, wait_until='domcontentloaded')
            print("Page loaded.", flush=True)

            # Wait for graph
            print("Waiting for #graph-container...", flush=True)
            page.wait_for_selector("#graph-container", timeout=10000)
            time.sleep(2)
            print("Graph container found.", flush=True)

            # Inject widget node
            print("Injecting widget...", flush=True)
            page.evaluate("""
                () => {
                    try {
                        if (!window.Explorer || !window.Explorer.graph) {
                            console.error("Explorer or graph not found on window");
                            return;
                        }
                        console.log("Adding LODNode...");
                        window.Explorer.graph.addNode({id: 'LODNode', term: 'LODNode', position: {x: 0, y: 0}}, false);
                        console.log("Adding TargetNode...");
                        window.Explorer.graph.addNode({id: 'TargetNode', term: 'TargetNode', position: {x: 200, y: 200}}, false);
                        setTimeout(() => {
                            if (window.Explorer.graph.contextualWidget) {
                                console.log("Attaching widget...");
                                window.Explorer.graph.contextualWidget.attachTestWidget('LODNode');
                            } else {
                                console.error("ContextualWidget not found");
                            }
                        }, 100);
                    } catch (e) {
                        console.error("Injection error: " + e.message);
                    }
                }
            """)
            time.sleep(1)

            # --- Test 1: LOD Levels ---
            print("Testing LOD 0...", flush=True)
            page.evaluate("window.Explorer.graph.cy.zoom(0.2)")
            page.evaluate("window.Explorer.graph.cy.pan({x: 500, y: 500})")
            time.sleep(0.5)
            page.screenshot(path="verification/zui-lod-0.png")

            lod_class = page.evaluate("document.querySelector('.zui-transform-layer')?.className")
            print(f"LOD 0 Class: {lod_class}", flush=True)

            # --- Test 2: Hover Frame ---
            print("Testing Hover Frame...", flush=True)
            page.evaluate("window.Explorer.graph.cy.fit()")
            time.sleep(1)

            page.evaluate("""
                () => {
                    const node = window.Explorer.graph.cy.getElementById('TargetNode');
                    window.Explorer.graph.contextualWidget.showHoverFrame(node);
                }
            """)
            time.sleep(0.5)
            page.screenshot(path="verification/zui-hover-frame.png")

            frame_visible = page.evaluate("!!document.querySelector('.zui-hover-frame')")
            print(f"Hover Frame Visible: {frame_visible}", flush=True)

            # --- Test 3: AutoZoom (FlyTo) ---
            print("Testing AutoZoom (FlyTo)...", flush=True)
            initial_zoom = page.evaluate("window.Explorer.graph.cy.zoom()")

            page.evaluate("window.Explorer.graph.flyTo('TargetNode')")
            time.sleep(1)

            final_zoom = page.evaluate("window.Explorer.graph.cy.zoom()")
            print(f"Initial Zoom: {initial_zoom}, Final Zoom: {final_zoom}", flush=True)

            if final_zoom > initial_zoom:
                print("Zoom increased (FlyTo successful)", flush=True)
            else:
                print("Zoom did not increase", flush=True)

            page.screenshot(path="verification/zui-flyto.png")

            # --- Test 4: GoBack ---
            print("Testing GoBack...", flush=True)
            page.evaluate("window.Explorer.graph.goBack()")
            time.sleep(1)

            back_zoom = page.evaluate("window.Explorer.graph.cy.zoom()")
            print(f"Back Zoom: {back_zoom}", flush=True)

            if abs(back_zoom - initial_zoom) < 0.1:
                print("Returned to initial zoom (GoBack successful)", flush=True)
            else:
                print("Did not return to initial zoom", flush=True)

        except Exception as e:
            print(f"Error verification: {e}", flush=True)
            import traceback
            traceback.print_exc()

        browser.close()

if __name__ == "__main__":
    verify_fractal_zui()
