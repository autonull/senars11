import { Environment } from '../core/RLCore.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    size: 10,
    numObjects: 3,
    maxSteps: 100,
    actions: [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0]
    ]
};

/**
 * CompositionalWorld - Environment with multiple objects for composition testing
 */
export class CompositionalWorld extends Environment {
    constructor(config = {}) {
        const mergedConfig = deepMergeConfig(DEFAULTS, config);
        super(mergedConfig);
        this.reset();
    }

    reset() {
        this.agentPos = [0, 0];
        this.objects = Array.from({ length: this.config.numObjects }, (_, i) => ({
            id: i,
            pos: [
                Math.floor(Math.random() * this.config.size),
                Math.floor(Math.random() * this.config.size)
            ],
            type: 'target'
        }));
        this.steps = 0;
        return { observation: this._getObs(), info: {} };
    }

    _getObs() {
        return [
            ...this.agentPos,
            ...this.objects.flatMap(o => o.pos)
        ];
    }

    step(action) {
        this.steps++;
        const [dx, dy] = this.config.actions[action] ?? [0, 0];
        const [x, y] = this.agentPos;

        this.agentPos = [
            Math.max(0, Math.min(this.config.size - 1, x + dx)),
            Math.max(0, Math.min(this.config.size - 1, y + dy))
        ];

        const [hitIndex, reward, terminated] = this._checkOverlap();
        if (hitIndex >= 0) {
            this.objects.splice(hitIndex, 1);
        }

        return {
            observation: this._getObs(),
            reward,
            terminated: terminated || this.objects.length === 0,
            truncated: this.steps > this.config.maxSteps,
            info: {}
        };
    }

    _checkOverlap() {
        const [x, y] = this.agentPos;
        const hitIndex = this.objects.findIndex(o => o.pos[0] === x && o.pos[1] === y);
        return [hitIndex, hitIndex >= 0 ? 1.0 : 0.0, false];
    }

    get observationSpace() {
        return {
            type: 'Box',
            shape: [2 + 2 * this.objects.length],
            low: [0],
            high: [this.config.size]
        };
    }

    get actionSpace() {
        return { type: 'Discrete', n: 4 };
    }
}
