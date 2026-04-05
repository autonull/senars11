export class CausalNode {
    constructor(id, config = {}) {
        this.id = id;
        this.type = config.type ?? 'default';
        this.data = config.data ?? {};
        this.parents = new Set();
        this.children = new Set();
        this.probability = config.probability ?? 0.5;
        this.intervention = null;
    }

    addParent(parentId) {
        this.parents.add(parentId);
    }

    addChild(childId) {
        this.children.add(childId);
    }

    intervene(value) {
        this.intervention = value;
    }

    reset() {
        this.intervention = null;
    }

    toJSON() {
        return {
            id: this.id, type: this.type, data: this.data,
            parents: Array.from(this.parents), children: Array.from(this.children),
            probability: this.probability, intervention: this.intervention
        };
    }
}
