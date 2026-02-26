/**
 * Gymnasium Compatibility Layer
 * Wrapper for using Gymnasium (Python) environments with SeNARS RL
 */
import { Component } from '../composable/Component.js';
import { Environment, DiscreteEnvironment, ContinuousEnvironment } from '../core/RLCore.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const GYM_DEFAULTS = {
    pythonPath: 'python3',
    sync: true,
    timeout: 30000
};

/**
 * Gymnasium environment wrapper
 * Allows using any Gymnasium environment with SeNARS RL agents
 * 
 * Note: Requires gymnasium Python package installed
 * Install: pip install gymnasium[classic-control]
 */
export class GymWrapper extends Component {
    constructor(envName, config = {}) {
        const merged = { ...GYM_DEFAULTS, ...config, envName };
        super(merged);
        this.envName = envName;
        this.env = null;
        this._observationSpace = null;
        this._actionSpace = null;
        this._pythonModule = null;
    }

    async onInitialize() {
        try {
            // Dynamic import for Python bridge
            const { PythonShell } = await import('python-shell');
            this._pythonModule = PythonShell;
        } catch {
            // Fallback: use child_process for Python communication
            this._pythonModule = null;
        }

        this.env = await this._createEnv();
        await this._setupSpaces();
        this.emit('initialized', { env: this.envName });
    }

    async _createEnv() {
        if (this._pythonModule) {
            return this._createWithPythonShell();
        }
        return this._createWithChildProcess();
    }

    async _createWithPythonShell() {
        const options = {
            pythonPath: this.config.pythonPath,
            args: ['-c', `
import gymnasium as gym
import json
env = gym.make("${this.envName}")
print(json.dumps({
    "observation_space": str(env.observation_space),
    "action_space": str(env.action_space),
    "created": True
}))
`]
        };

        const output = await new Promise((resolve, reject) => {
            this._pythonModule.run('', options, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        return { created: true };
    }

    async _createWithChildProcess() {
        const { exec } = await import('child_process');
        const util = await import('util');
        const execPromise = util.promisify(exec);

        const script = `
import gymnasium as gym
import json
env = gym.make("${this.envName}")
print(json.dumps({
    "observation_space": str(env.observation_space),
    "action_space": str(env.action_space),
    "created": True
}))
`;

        const { stdout } = await execPromise(`${this.config.pythonPath} -c '${script}'`);
        return JSON.parse(stdout);
    }

    async _setupSpaces() {
        // Parse Gymnasium space strings to RL space objects
        const obsMatch = this.config.envName.match(/(\w+)-v(\d+)/);
        
        // Default spaces based on common envs
        this._observationSpace = this._inferObservationSpace();
        this._actionSpace = this._inferActionSpace();
    }

    _inferObservationSpace() {
        const name = this.envName.toLowerCase();
        
        if (name.includes('cartpole')) {
            return { shape: [4], low: -Infinity, high: Infinity, dtype: 'float32' };
        } else if (name.includes('mountaincar')) {
            return { shape: [2], low: [-1.2, -0.07], high: [0.6, 0.07], dtype: 'float32' };
        } else if (name.includes('pendulum')) {
            return { shape: [3], low: [-1, -8, -8], high: [1, 8, 8], dtype: 'float32' };
        } else if (name.includes('lunarlander')) {
            return { shape: [8], low: -Infinity, high: Infinity, dtype: 'float32' };
        }
        
        // Default
        return { shape: [4], low: -Infinity, high: Infinity, dtype: 'float32' };
    }

    _inferActionSpace() {
        const name = this.envName.toLowerCase();
        
        if (name.includes('cartpole')) {
            return { type: 'discrete', n: 2 };
        } else if (name.includes('mountaincar')) {
            return { type: 'discrete', n: 3 };
        } else if (name.includes('pendulum')) {
            return { type: 'continuous', shape: [1], low: -2, high: 2 };
        } else if (name.includes('lunarlander')) {
            return { type: 'discrete', n: 4 };
        }
        
        // Default
        return { type: 'discrete', n: 2 };
    }

    /**
     * Reset environment
     * @param {object} options - Reset options
     * @returns {Promise<{observation: any, info: object}>} Initial observation
     */
    async reset(options = {}) {
        const { seed = null } = options;
        
        const script = `
import gymnasium as gym
import json
import numpy as np

env = gym.make("${this.envName}")
obs, info = env.reset(seed=${seed})
print(json.dumps({
    "observation": obs.tolist() if hasattr(obs, 'tolist') else list(obs),
    "info": {}
}))
env.close()
`;

        const obs = await this._runPython(script);
        return { observation: obs.observation, info: obs.info };
    }

    /**
     * Step environment
     * @param {number|number[]} action - Action to take
     * @returns {Promise<{observation: any, reward: number, terminated: boolean, truncated: boolean, info: object}>}
     */
    async step(action) {
        const script = `
import gymnasium as gym
import json
import numpy as np

env = gym.make("${this.envName}")
obs, reward, terminated, truncated, info = env.step(${JSON.stringify(action)})
print(json.dumps({
    "observation": obs.tolist() if hasattr(obs, 'tolist') else list(obs),
    "reward": float(reward),
    "terminated": bool(terminated),
    "truncated": bool(truncated),
    "info": {}
}))
env.close()
`;

        return await this._runPython(script);
    }

    async _runPython(script) {
        const { exec } = await import('child_process');
        const util = await import('util');
        const execPromise = util.promisify(exec);

        try {
            const { stdout } = await execPromise(
                `${this.config.pythonPath} -c '${script.replace(/\n/g, ';')}'`,
                { timeout: this.config.timeout }
            );
            return JSON.parse(stdout);
        } catch (error) {
            throw new Error(`Gymnasium error: ${error.message}`);
        }
    }

    /**
     * Render environment
     * @param {string} mode - Render mode ('human', 'rgb_array', etc.)
     * @returns {Promise<any>} Rendered output
     */
    async render(mode = 'human') {
        const script = `
import gymnasium as gym
import numpy as np

env = gym.make("${this.envName}", render_mode="${mode}")
env.reset()
frame = env.render()
print("RENDERED" if frame is None else "FRAME")
env.close()
`;

        await this._runPython(script);
        return mode === 'human' ? null : null; // Simplified
    }

    /**
     * Sample random action
     * @returns {number|number[]} Random action
     */
    sampleAction() {
        const space = this._actionSpace;
        
        if (space.type === 'discrete') {
            return Math.floor(Math.random() * space.n);
        } else if (space.type === 'continuous') {
            return Array.from({ length: space.shape[0] }, () => 
                space.low + Math.random() * (space.high - space.low)
            );
        }
        
        return 0;
    }

    /**
     * Get observation space
     * @returns {object} Observation space
     */
    get observationSpace() {
        return this._observationSpace;
    }

    /**
     * Get action space
     * @returns {object} Action space
     */
    get actionSpace() {
        return this._actionSpace;
    }

    /**
     * Get environment metadata
     * @returns {object} Environment info
     */
    getMetadata() {
        return {
            name: this.envName,
            observationSpace: this._observationSpace,
            actionSpace: this._actionSpace
        };
    }

    async onShutdown() {
        // Cleanup handled by Python process exit
    }
}

/**
 * Create Gymnasium environment
 * @param {string} envName - Gymnasium environment name
 * @param {object} config - Configuration
 * @returns {Promise<GymWrapper>} Gymnasium wrapper
 */
export async function gym(envName, config = {}) {
    const wrapper = new GymWrapper(envName, config);
    await wrapper.initialize();
    return wrapper;
}

/**
 * Check if Gymnasium is available
 * @returns {Promise<boolean>} Availability
 */
export async function isGymnasiumAvailable() {
    try {
        const { exec } = await import('child_process');
        const util = await import('util');
        const execPromise = util.promisify(exec);

        await execPromise('python3 -c "import gymnasium"');
        return true;
    } catch {
        return false;
    }
}
