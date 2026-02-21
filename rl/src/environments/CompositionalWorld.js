
import { RLEnvironment } from '../core/RLEnvironment.js';

/**
 * CompositionalWorld Environment for testing compositional generalization.
 *
 * Ideally, this would generate tasks composed of entities, relations, and goals.
 * For now, we implement a simple placeholder or a small grid world with dynamic objects.
 */
export class CompositionalWorld extends RLEnvironment {
    constructor(config = {}) {
        super();
        this.size = config.size || 10;
        this.numObjects = config.numObjects || 3;
        this.reset();
    }

    reset() {
        // Place agent
        this.agentPos = [0, 0];

        // Place objects
        this.objects = [];
        for(let i=0; i<this.numObjects; i++) {
            this.objects.push({
                id: i,
                pos: [
                    Math.floor(Math.random() * this.size),
                    Math.floor(Math.random() * this.size)
                ],
                type: 'target' // or different types
            });
        }

        this.steps = 0;
        return { observation: this._getObs(), info: {} };
    }

    _getObs() {
        // Return a symbolic-like observation or a tensor
        // For now, flat array: [agentX, agentY, obj1X, obj1Y, ...]
        const obs = [...this.agentPos];
        this.objects.forEach(o => obs.push(...o.pos));
        return obs;
    }

    step(action) {
        this.steps++;
        // Action: 0: Up, 1: Down, 2: Left, 3: Right
        let [x, y] = this.agentPos;
         if (action === 0) y = Math.max(0, y - 1);
        else if (action === 1) y = Math.min(this.size - 1, y + 1);
        else if (action === 2) x = Math.max(0, x - 1);
        else if (action === 3) x = Math.min(this.size - 1, x + 1);

        this.agentPos = [x, y];

        // Reward: +1 if on object
        let reward = 0;
        let terminated = false;

        // Check overlap
        const hitIndex = this.objects.findIndex(o => o.pos[0] === x && o.pos[1] === y);
        if (hitIndex >= 0) {
            reward = 1.0;
            // Remove object or respawn?
            // Let's say we collected it.
            this.objects.splice(hitIndex, 1);
            if (this.objects.length === 0) {
                terminated = true; // All collected
            }
        }

        // Truncate
        let truncated = this.steps > 100;

        return {
            observation: this._getObs(),
            reward,
            terminated,
            truncated,
            info: {}
        };
    }

    get observationSpace() {
        // Box space
        // Note: The observation size changes as objects are collected.
        // This violates standard Gym Box space fixed size assumption.
        // But for our flexible agents, it might be fine.
        return { type: 'Box', shape: [2 + 2 * this.objects.length], low: [0], high: [this.size] };
    }

    get actionSpace() {
        return { type: 'Discrete', n: 4 };
    }
}
