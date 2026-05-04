export class CausalEdge {
    constructor(from, to, config = {}) {
        this.from = from;
        this.to = to;
        this.strength = config.strength ?? 1.0;
        this.confidence = config.confidence ?? 0.5;
        this.observations = config.observations ?? 0;
    }

    update(strength, confidence) {
        this.strength = 0.7 * this.strength + 0.3 * strength;
        this.confidence = Math.min(1, this.confidence + 0.1);
        this.observations++;
        return this;
    }

    toJSON() {
        return {
            from: this.from,
            to: this.to,
            strength: this.strength,
            confidence: this.confidence,
            observations: this.observations
        };
    }
}
