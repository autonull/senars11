/**
 * Mock implementation of cytoscape-fcose for standalone UI testing without a bundler.
 * In a full build environment, this should be replaced by the actual 'cytoscape-fcose' package.
 */
export default function(cytoscape) {
    if (!cytoscape) {return;}

    function MockFcoseLayout(options) {
        this.options = options;
    }

    MockFcoseLayout.prototype.run = function() {
        const {eles} = this.options;
        const nodes = eles.nodes();

        console.log(`MockFcoseLayout delegating to COSE on ${nodes.length} nodes`);

        // Delegate to built-in COSE layout which provides organic force-directed layout
        if (eles.layout) {
            const coseOptions = {
                name: 'cose',
                animate: this.options.animate !== false,
                animationDuration: this.options.animationDuration || 500,
                fit: this.options.fit !== false,
                padding: this.options.padding || 30,
                randomize: this.options.randomize !== false,
                componentSpacing: 100,
                nodeRepulsion: 400000,
                nodeOverlap: 10,
                idealEdgeLength: 100,
                edgeElasticity: 100,
                nestingFactor: 5,
                gravity: 80,
                numIter: 1000,
                initialTemp: 200,
                coolingFactor: 0.95,
                minTemp: 1.0
            };

            // Run the actual layout
            eles.layout(coseOptions).run();
        } else {
            console.warn('Elements do not support layout method, falling back to grid');
            // Fallback if something is wrong with the cytoscape instance
            nodes.each((ele, i) => {
                ele.scratch('fcose', {
                    x: (i % 10) * 150,
                    y: Math.floor(i / 10) * 150
                });
            });
            nodes.layoutPositions(this, this.options, (ele) => ele.scratch('fcose'));
            eles.emit('layoutstop');
        }

        return this;
    };

    MockFcoseLayout.prototype.stop = function() {
        return this;
    };

    cytoscape('layout', 'fcose', MockFcoseLayout);
}
