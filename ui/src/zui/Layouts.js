/**
 * Layout algorithms for SeNARS Graph
 */
export const Layouts = {
    /**
     * Applies a scatter plot layout based on node data attributes.
     * @param {Object} cy - Cytoscape instance
     * @param {string} xAxis - Attribute for X axis
     * @param {string} yAxis - Attribute for Y axis
     */
    applyScatter(cy, xAxis = 'priority', yAxis = 'confidence') {
        if (!cy) return;

        const nodes = cy.nodes();
        const width = cy.width() * 0.8;
        const height = cy.height() * 0.8;

        const getVal = (node, axis) => {
            const data = node.data('fullData') || {};
            const truth = data.truth || {};
            const budget = data.budget || {};

            switch (axis) {
                case 'priority': return budget.priority || 0;
                case 'durability': return budget.durability || 0;
                case 'quality': return budget.quality || 0;
                case 'frequency': return truth.frequency || 0;
                case 'confidence': return truth.confidence || 0;
                case 'taskCount': return Math.min((data.tasks?.length || 0) / 20, 1);
                default: return 0;
            }
        };

        cy.batch(() => {
            nodes.forEach(node => {
                const x = getVal(node, xAxis);
                const y = getVal(node, yAxis);
                // Map 0..1 to -width/2 .. width/2
                const posX = (x - 0.5) * width;
                const posY = -(y - 0.5) * height;
                node.position({ x: posX, y: posY });
            });
        });

        // Fit to view
        cy.animate({ fit: { eles: nodes, padding: 50 }, duration: 500 });
    },

    /**
     * Applies a grid layout sorted by a specific field.
     * @param {Object} cy - Cytoscape instance
     * @param {string} sortField - Field to sort by ('priority' or 'term')
     */
    applySortedGrid(cy, sortField = 'priority') {
        if (!cy) return;

        const nodes = cy.nodes().sort((a, b) => {
            const getVal = (n) => {
                 const d = n.data('fullData') || {};
                 if (sortField === 'priority') return d.budget?.priority || 0;
                 if (sortField === 'term') return n.id();
                 return 0;
            };
            return getVal(b) - getVal(a); // Descending
        });

        nodes.layout({
            name: 'grid',
            avoidOverlap: true,
            padding: 30,
            animate: true,
            animationDuration: 500
        }).run();
    }
};
