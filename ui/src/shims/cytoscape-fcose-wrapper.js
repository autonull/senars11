// Directly importing the implementation from the node_modules file
// (which we know is at /node_modules/cytoscape-fcose/cytoscape-fcose.js)
// but since it's UMD, we might need a little help to use it as ES module
import 'cytoscape-fcose/cytoscape-fcose.js';

// The UMD script assigns to window.cytoscapeFcose or similar
// Let's assume it puts it on global if not found elsewhere or tries to register itself.
// However, the import map maps 'cytoscape-fcose' to this wrapper.
// The actual file at node_modules/cytoscape-fcose/cytoscape-fcose.js is a webpack bundle.

// Let's retry mocking it properly if the real one is too hard to load without build steps.
// The previous mock failed because I used `class MockFcoseLayout` which isn't hoisted or something in that context?
// Or maybe cytoscape expects a function returning a class?

export default function(cytoscape) {
    if (!cytoscape) return;

    // Define the layout class
    class MockFcoseLayout {
        constructor(options) {
            this.options = options;
        }

        run() {
            const eles = this.options.eles;
            const nodes = eles.nodes();

            nodes.each((ele, i) => {
                ele.scratch('fcose', {
                    x: (i % 10) * 100,
                    y: Math.floor(i / 10) * 100
                });
            });

            nodes.layoutPositions(this, this.options, (ele) => ele.scratch('fcose'));

            if(this.options.stop) this.options.stop();
            eles.emit('layoutstop');

            return this;
        }

        stop() {
            return this;
        }
    };

    // Register it
    cytoscape('layout', 'fcose', MockFcoseLayout);
}
