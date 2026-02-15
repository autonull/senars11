import Logger from './logger.js';

/**
 * GraphAlgorithms - Advanced algorithms for graph analysis and manipulation
 */
class GraphAlgorithms {
    // Find shortest path between two nodes using Dijkstra's algorithm
    static findShortestPath(cytoscapeInstance, sourceId, targetId) {
        try {
            const source = cytoscapeInstance.getElementById(sourceId);
            const target = cytoscapeInstance.getElementById(targetId);

            if (!source || !target) {
                Logger.warn('Source or target node not found', { sourceId, targetId });
                return null;
            }

            // Use cytoscape's built-in pathfinding algorithm
            const path = cytoscapeInstance.elements().dijkstra(source, (edge) => {
                return edge.data('weight') || 1; // Default weight of 1
            });

            const shortestPath = path.pathTo(target);
            return {
                path: shortestPath,
                distance: path.distanceTo(target),
                nodes: shortestPath.nodes().map(node => node.id()),
                edges: shortestPath.edges().map(edge => edge.id())
            };
        } catch (error) {
            Logger.error('Error finding shortest path', { 
                error: error.message, 
                sourceId, 
                targetId 
            });
            return null;
        }
    }

    // Find all connected components in the graph
    static findConnectedComponents(cytoscapeInstance) {
        try {
            const components = [];
            const visited = new Set();
            const nodes = cytoscapeInstance.nodes();

            for (const node of nodes) {
                if (!visited.has(node.id())) {
                    const component = this._bfsTraversal(cytoscapeInstance, node.id(), visited);
                    components.push(component);
                }
            }

            return components;
        } catch (error) {
            Logger.error('Error finding connected components', { error: error.message });
            return [];
        }
    }

    // Detect cycles in the graph
    static detectCycles(cytoscapeInstance) {
        try {
            const nodes = cytoscapeInstance.nodes();
            const edges = cytoscapeInstance.edges();
            const visited = new Set();
            const recStack = new Set();
            const cycles = [];

            for (const node of nodes) {
                if (!visited.has(node.id())) {
                    const cycleDetection = this._detectCycleDFS(
                        cytoscapeInstance, 
                        node.id(), 
                        visited, 
                        recStack, 
                        cycles,
                        []
                    );
                }
            }

            return cycles;
        } catch (error) {
            Logger.error('Error detecting cycles', { error: error.message });
            return [];
        }
    }

    // Calculate centrality measures
    static calculateCentrality(cytoscapeInstance, type = 'degree') {
        try {
            const centralityMap = new Map();
            const nodes = cytoscapeInstance.nodes();

            switch (type) {
                case 'degree':
                    for (const node of nodes) {
                        const degree = node.connectedEdges().length;
                        centralityMap.set(node.id(), degree);
                    }
                    break;

                case 'betweenness':
                    return this._calculateBetweennessCentrality(cytoscapeInstance);
                    
                case 'closeness':
                    return this._calculateClosenessCentrality(cytoscapeInstance);

                default:
                    throw new Error(`Unknown centrality type: ${type}`);
            }

            return centralityMap;
        } catch (error) {
            Logger.error('Error calculating centrality', { 
                error: error.message, 
                type 
            });
            return new Map();
        }
    }

    // Find clusters/community structures in the graph
    static findClusters(cytoscapeInstance, algorithm = 'k-core') {
        try {
            switch (algorithm) {
                case 'k-core':
                    return this._findKCoreClusters(cytoscapeInstance);
                case 'connected-components':
                    return this.findConnectedComponents(cytoscapeInstance);
                case 'girvan-newman':
                    return this._findGirvanNewmanClusters(cytoscapeInstance);
                default:
                    throw new Error(`Unknown clustering algorithm: ${algorithm}`);
            }
        } catch (error) {
            Logger.error('Error finding clusters', { 
                error: error.message, 
                algorithm 
            });
            return [];
        }
    }

    // Analyze graph properties
    static analyzeGraph(cytoscapeInstance) {
        try {
            const nodes = cytoscapeInstance.nodes();
            const edges = cytoscapeInstance.edges();

            const analysis = {
                nodeCount: nodes.length,
                edgeCount: edges.length,
                density: this._calculateDensity(nodes.length, edges.length),
                diameter: this._calculateDiameter(cytoscapeInstance),
                clusteringCoefficient: this._calculateClusteringCoefficient(cytoscapeInstance),
                components: this.findConnectedComponents(cytoscapeInstance).length,
                hasCycles: this.detectCycles(cytoscapeInstance).length > 0,
                centrality: {
                    degree: this.calculateCentrality(cytoscapeInstance, 'degree'),
                    betweenness: this.calculateCentrality(cytoscapeInstance, 'betweenness')
                }
            };

            return analysis;
        } catch (error) {
            Logger.error('Error analyzing graph', { error: error.message });
            return null;
        }
    }

    // Calculate graph modularity
    static calculateModularity(cytoscapeInstance, clusters) {
        try {
            if (!clusters || clusters.length === 0) return 0;

            const edges = cytoscapeInstance.edges();
            const totalWeight = edges.reduce((sum, edge) => sum + (edge.data('weight') || 1), 0);
            if (totalWeight === 0) return 0;

            let modularity = 0;

            for (const cluster of clusters) {
                const clusterNodes = new Set(cluster.map(node => node.id()));
                let intraEdges = 0;
                let degreeSum = 0;

                for (const node of cluster) {
                    const nodeObj = cytoscapeInstance.getElementById(node.id());
                    const connectedEdges = nodeObj.connectedEdges();

                    for (const edge of connectedEdges) {
                        if (clusterNodes.has(edge.source().id()) && clusterNodes.has(edge.target().id())) {
                            intraEdges += edge.data('weight') || 1;
                        }
                        degreeSum += edge.data('weight') || 1;
                    }
                }

                modularity += (intraEdges / totalWeight) - Math.pow(degreeSum / (2 * totalWeight), 2);
            }

            return modularity;
        } catch (error) {
            Logger.error('Error calculating modularity', { error: error.message });
            return 0;
        }
    }

    // Private helper methods
    static _bfsTraversal(cytoscapeInstance, startNodeId, visited) {
        const queue = [startNodeId];
        const component = [];

        while (queue.length > 0) {
            const nodeId = queue.shift();
            
            if (visited.has(nodeId)) continue;
            
            visited.add(nodeId);
            component.push(cytoscapeInstance.getElementById(nodeId));

            const connectedEdges = cytoscapeInstance.getElementById(nodeId).connectedEdges();
            for (const edge of connectedEdges) {
                const neighborNode = edge.source().id() === nodeId ? edge.target() : edge.source();
                if (!visited.has(neighborNode.id())) {
                    queue.push(neighborNode.id());
                }
            }
        }

        return component;
    }

    static _detectCycleDFS(cytoscapeInstance, nodeId, visited, recStack, cycles, path) {
        visited.add(nodeId);
        recStack.add(nodeId);
        path.push(nodeId);

        const node = cytoscapeInstance.getElementById(nodeId);
        const connectedEdges = node.connectedEdges();

        for (const edge of connectedEdges) {
            const neighborNode = edge.source().id() === nodeId ? edge.target() : edge.source();
            const neighborId = neighborNode.id();

            if (!visited.has(neighborId)) {
                this._detectCycleDFS(cytoscapeInstance, neighborId, visited, recStack, cycles, path);
            } else if (recStack.has(neighborId)) {
                // Found a cycle
                const cycleStart = path.indexOf(neighborId);
                if (cycleStart !== -1) {
                    const cycle = path.slice(cycleStart).concat([neighborId]);
                    cycles.push(cycle);
                }
            }
        }

        recStack.delete(nodeId);
        path.pop();
    }

    static _calculateBetweennessCentrality(cytoscapeInstance) {
        const centralityMap = new Map();
        const nodes = cytoscapeInstance.nodes();

        // Initialize all nodes to 0
        for (const node of nodes) {
            centralityMap.set(node.id(), 0);
        }

        // For each node, calculate shortest paths to all other nodes
        for (const source of nodes) {
            const distances = new Map();
            const shortestPaths = new Map();
            const predecessors = new Map();
            const Q = [...nodes.map(n => n.id())];
            
            // Initialize
            for (const node of nodes) {
                distances.set(node.id(), Infinity);
                shortestPaths.set(node.id(), 0);
                predecessors.set(node.id(), []);
            }
            
            distances.set(source.id(), 0);
            shortestPaths.set(source.id(), 1);

            // Dijkstra-like algorithm
            while (Q.length > 0) {
                // Find node with minimum distance
                let minDist = Infinity;
                let minNode = null;
                for (const nodeId of Q) {
                    if (distances.get(nodeId) < minDist) {
                        minDist = distances.get(nodeId);
                        minNode = nodeId;
                    }
                }
                
                if (!minNode) break;
                
                Q.splice(Q.indexOf(minNode), 1);

                const node = cytoscapeInstance.getElementById(minNode);
                const neighbors = node.neighborhood().nodes();

                for (const neighbor of neighbors) {
                    const neighborId = neighbor.id();
                    if (!Q.includes(neighborId)) continue;

                    const alt = distances.get(minNode) + 1; // Simple unweighted distance
                    if (alt < distances.get(neighborId)) {
                        distances.set(neighborId, alt);
                        shortestPaths.set(neighborId, shortestPaths.get(minNode));
                        predecessors.set(neighborId, [minNode]);
                    } else if (alt === distances.get(neighborId)) {
                        shortestPaths.set(neighborId, shortestPaths.get(neighborId) + shortestPaths.get(minNode));
                        const preds = predecessors.get(neighborId);
                        preds.push(minNode);
                        predecessors.set(neighborId, preds);
                    }
                }
            }

            // Accumulate betweenness
            const delta = new Map();
            for (const node of nodes) {
                delta.set(node.id(), 0);
            }

            const sortedNodes = [...nodes]
                .filter(n => n.id() !== source.id())
                .sort((a, b) => distances.get(b.id()) - distances.get(a.id()));

            for (const w of sortedNodes) {
                const wId = w.id();
                for (const v of predecessors.get(wId) || []) {
                    const coefficient = shortestPaths.get(v) / shortestPaths.get(wId) * (1 + delta.get(wId));
                    delta.set(v, delta.get(v) + coefficient);
                }
                
                if (wId !== source.id()) {
                    const currentCentrality = centralityMap.get(wId) || 0;
                    centralityMap.set(wId, currentCentrality + delta.get(wId));
                }
            }
        }

        // Normalize values
        const n = nodes.length;
        const scale = (n - 1) * (n - 2) / 2;
        
        for (const [nodeId, value] of centralityMap) {
            centralityMap.set(nodeId, scale > 0 ? value / scale : 0);
        }

        return centralityMap;
    }

    static _calculateClosenessCentrality(cytoscapeInstance) {
        const centralityMap = new Map();
        const nodes = cytoscapeInstance.nodes();

        for (const node of nodes) {
            let totalDistance = 0;
            let reachableNodes = 0;

            for (const otherNode of nodes) {
                if (node.id() === otherNode.id()) continue;

                const path = this.findShortestPath(cytoscapeInstance, node.id(), otherNode.id());
                if (path) {
                    totalDistance += path.distance;
                    reachableNodes++;
                }
            }

            const closeness = reachableNodes > 0 ? reachableNodes / totalDistance : 0;
            centralityMap.set(node.id(), closeness);
        }

        return centralityMap;
    }

    static _findKCoreClusters(cytoscapeInstance) {
        // Simplified k-core algorithm
        const clusters = [];
        const nodes = [...cytoscapeInstance.nodes()];
        const k = 2; // minimum degree for k-core

        while (nodes.length > 0) {
            // Find nodes with degree >= k
            const coreNodes = nodes.filter(node => node.connectedEdges().length >= k);
            if (coreNodes.length === 0) break;

            // Add to clusters and remove from main list
            clusters.push(coreNodes);
            coreNodes.forEach(node => {
                const index = nodes.indexOf(node);
                if (index > -1) nodes.splice(index, 1);
            });
        }

        return clusters;
    }

    static _findGirvanNewmanClusters(cytoscapeInstance) {
        // Simplified version - remove edges with highest betweenness
        const clusters = this.findConnectedComponents(cytoscapeInstance);
        return clusters;
    }

    static _calculateDensity(nodeCount, edgeCount) {
        if (nodeCount < 2) return 0;
        return (2 * edgeCount) / (nodeCount * (nodeCount - 1));
    }

    static _calculateDiameter(cytoscapeInstance) {
        // Approximate diameter using eccentricity of a sample of nodes
        const nodes = cytoscapeInstance.nodes();
        if (nodes.length === 0) return 0;

        // For performance, only calculate for first 10 nodes or all if less than 10
        const sampleNodes = nodes.length > 10 ? nodes.slice(0, 10) : nodes;

        let maxDistance = 0;
        for (const source of sampleNodes) {
            for (const target of nodes) {
                if (source.id() === target.id()) continue;

                const path = this.findShortestPath(cytoscapeInstance, source.id(), target.id());
                if (path && path.distance > maxDistance) {
                    maxDistance = path.distance;
                }
            }
        }

        return maxDistance;
    }

    static _calculateClusteringCoefficient(cytoscapeInstance) {
        const nodes = cytoscapeInstance.nodes();
        if (nodes.length === 0) return 0;

        let totalCoefficient = 0;
        let validNodes = 0;

        for (const node of nodes) {
            const neighbors = node.neighborhood().nodes().not(node);
            const neighborCount = neighbors.length;

            if (neighborCount < 2) continue; // Need at least 2 neighbors for triangles

            // Count actual connections between neighbors
            let actualConnections = 0;
            for (let i = 0; i < neighborCount; i++) {
                for (let j = i + 1; j < neighborCount; j++) {
                    if (neighbors[i].connectedTo(neighbors[j])) {
                        actualConnections++;
                    }
                }
            }

            // Calculate clustering coefficient
            const possibleConnections = (neighborCount * (neighborCount - 1)) / 2;
            const coefficient = possibleConnections > 0 ? actualConnections / possibleConnections : 0;

            totalCoefficient += coefficient;
            validNodes++;
        }

        return validNodes > 0 ? totalCoefficient / validNodes : 0;
    }
}

export default GraphAlgorithms;