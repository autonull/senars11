/**
 * Mock implementation of cytoscape-fcose for standalone UI testing without a bundler.
 * In a full build environment, this should be replaced by the actual 'cytoscape-fcose' package.
 */
export default function(cytoscape) {
    if (!cytoscape) return;

    function MockFcoseLayout(options) {
        this.options = options;
    }

    MockFcoseLayout.prototype.run = function() {
        const eles = this.options.eles;
        const nodes = eles.nodes();

        console.log(`MockFcoseLayout running on ${nodes.length} nodes`);

        // Simple grid positioning as a fallback
        nodes.each((ele, i) => {
            ele.scratch('fcose', {
                x: (i % 10) * 150, // Increased spacing
                y: Math.floor(i / 10) * 150
            });
        });

        nodes.layoutPositions(this, this.options, (ele) => ele.scratch('fcose'));

        if (this.options.fit) {
            // Use a timeout to ensure positions are applied before fitting
            setTimeout(() => {
                if (eles.cy && typeof eles.cy === 'function') {
                    eles.cy().fit(this.options.padding);
                } else if (eles.cy && eles.cy.fit) {
                     eles.cy.fit(this.options.padding);
                }
            }, 50);
        }

        if(this.options.stop) this.options.stop();
        eles.emit('layoutstop');

        return this;
    };

    MockFcoseLayout.prototype.stop = function() {
        return this;
    };

    cytoscape('layout', 'fcose', MockFcoseLayout);
}
