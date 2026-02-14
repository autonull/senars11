export default function(cytoscape) {
    if (!cytoscape) return;

    function MockFcoseLayout(options) {
        this.options = options;
    }

    MockFcoseLayout.prototype.run = function() {
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
    };

    MockFcoseLayout.prototype.stop = function() {
        return this;
    };

    cytoscape('layout', 'fcose', MockFcoseLayout);
}
