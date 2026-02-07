export const DEMOS = {
    "Solar System": {
        "description": "A hierarchical view of celestial bodies.",
        "concepts": [
            { "term": "Sun", "priority": 0.99, "type": "concept" },
            { "term": "Planet", "priority": 0.90, "type": "concept" },
            { "term": "Earth", "priority": 0.95, "type": "concept" },
            { "term": "Mars", "priority": 0.90, "type": "concept" },
            { "term": "Jupiter", "priority": 0.92, "type": "concept" },
            { "term": "Moon", "priority": 0.85, "type": "concept" },
            { "term": "Phobos", "priority": 0.80, "type": "concept" },
            { "term": "Deimos", "priority": 0.80, "type": "concept" },
            { "term": "Europa", "priority": 0.85, "type": "concept" },
            { "term": "Io", "priority": 0.85, "type": "concept" },
            { "term": "Ganymede", "priority": 0.85, "type": "concept" },
            { "term": "Star", "priority": 0.95, "type": "concept" }
        ],
        "relationships": [
            ["Sun", "Star", "inheritance"],
            ["Earth", "Planet", "inheritance"],
            ["Mars", "Planet", "inheritance"],
            ["Jupiter", "Planet", "inheritance"],
            ["Earth", "Sun", "implication"],
            ["Moon", "Earth", "implication"],
            ["Phobos", "Mars", "implication"],
            ["Deimos", "Mars", "implication"],
            ["Europa", "Jupiter", "implication"],
            ["Io", "Jupiter", "implication"],
            ["Ganymede", "Jupiter", "implication"]
        ]
    },
    "Logic Chain": {
        "description": "Classic syllogistic reasoning structure.",
        "concepts": [
            { "term": "Socrates", "priority": 0.95, "type": "concept" },
            { "term": "Human", "priority": 0.90, "type": "concept" },
            { "term": "Mortal", "priority": 0.85, "type": "concept" },
            { "term": "Living_Thing", "priority": 0.80, "type": "concept" }
        ],
        "relationships": [
            ["Socrates", "Human", "inheritance"],
            ["Human", "Mortal", "inheritance"],
            ["Mortal", "Living_Thing", "inheritance"],
            ["Socrates", "Mortal", "implication"]
        ]
    },
    "Stress Test": {
        "description": "High volume of random nodes to test the Bag limit.",
        "concepts": [],
        "relationships": []
    },
    "Complex Interaction": {
        "description": "Simulated reasoning session via Narsese script.",
        "concepts": [],
        "relationships": [],
        "script": [
            "<cat --> animal>.",
            "<animal --> living>.",
            "<dog --> animal>.",
            "(-->, cat, meow).",
            "<cat --> ?x>?",
            "<tiger --> cat>.",
            "<tiger --> ?x>?"
        ]
    },
    "Complex Graph": {
        "description": "Large procedurally generated graph with communities.",
        "bagCapacity": 150,
        "generator": (graph) => {
            const communities = [
                { id: 'science', label: 'Science', color: '#44aaff' },
                { id: 'art', label: 'Arts', color: '#ffaa44' },
                { id: 'tech', label: 'Technology', color: '#44ffaa' }
            ];

            // Create community centers
            communities.forEach(c => {
                graph.addNode({
                    id: c.id,
                    term: c.label,
                    budget: { priority: 0.95 },
                    type: 'concept',
                    fullData: { community: c.id }
                }, false);
            });

            const nodesPerCommunity = 25;
            const nodes = [];

            // Generate nodes for each community
            communities.forEach(comm => {
                for (let i = 0; i < nodesPerCommunity; i++) {
                    const id = `${comm.id}_${i}`;
                    const label = `${comm.label} ${i}`;
                    const priority = 0.3 + (Math.random() * 0.6); // 0.3 - 0.9

                    graph.addNode({
                        id: id,
                        term: label,
                        budget: { priority },
                        type: 'concept',
                        fullData: { community: comm.id }
                    }, false);
                    nodes.push({ id, community: comm.id });

                    // Connect to center
                    if (Math.random() > 0.3) {
                        graph.addEdge({
                            source: id,
                            target: comm.id,
                            type: 'related'
                        }, false);
                    }
                }
            });

            // Random internal connections
            nodes.forEach(node => {
                const sameComm = nodes.filter(n => n.community === node.community && n.id !== node.id);
                // Connect to 1-3 others in same community
                const count = 1 + Math.floor(Math.random() * 3);
                for (let k = 0; k < count; k++) {
                    const target = sameComm[Math.floor(Math.random() * sameComm.length)];
                    graph.addEdge({
                        source: node.id,
                        target: target.id,
                        type: 'related'
                    }, false);
                }

                // Chance for external connection
                if (Math.random() > 0.85) {
                    const otherComm = nodes.filter(n => n.community !== node.community);
                    const target = otherComm[Math.floor(Math.random() * otherComm.length)];
                    graph.addEdge({
                        source: node.id,
                        target: target.id,
                        type: 'cross-link'
                    }, false);
                }
            });
        }
    },
    "Fractal Knowledge": {
        "description": "Recursive hierarchical structure.",
        "bagCapacity": 200,
        "generator": (graph) => {
            const addNode = (id, label, priority, parentId) => {
                graph.addNode({
                    id: id,
                    term: label,
                    budget: { priority },
                    type: 'concept'
                }, false);

                if (parentId) {
                    graph.addEdge({
                        source: parentId,
                        target: id,
                        type: 'part-of'
                    }, false);
                }
            };

            const generate = (depth, parentId, prefix) => {
                if (depth === 0) return;

                const count = 3 + Math.floor(Math.random() * 2);
                for (let i = 0; i < count; i++) {
                    const id = `${prefix}_${i}`;
                    const label = `${prefix.split('_').pop()}.${i}`;
                    const priority = 0.9 * (depth / 4);

                    addNode(id, label, priority, parentId);
                    generate(depth - 1, id, id);
                }
            };

            addNode('root', 'Root', 1.0, null);
            generate(3, 'root', 'root');
        }
    }
};
