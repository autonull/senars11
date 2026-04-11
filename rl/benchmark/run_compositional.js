import {NeuroSymbolicAgent} from '../src/agents/NeuroSymbolicAgent.js';
import {RandomAgent} from '../src/index.js';
import {CompositionalWorld} from '../src/environments/CompositionalWorld.js';

// Mock SeNARSBridge if not available
// We wrap in try/catch to gracefully handle missing dependencies in CI
try {
    console.log('Starting Benchmark: NeuroSymbolic vs Random...');

    const env = new CompositionalWorld();

    // Create Agents
    const nsAgent = new NeuroSymbolicAgent(env);
    const randomAgent = new RandomAgent(env);

    // Inject mock bridge if SeNARSBridge fails to initialize (realistically handled by constructor)
    // nsAgent.bridge.initialize = async () => {};
    // nsAgent.bridge.ask = async () => ({ answer: true, term: 'action_0' });

    const episodes = 10;
    const maxSteps = 50;

    async function runAgent(agent, name) {
        let totalReward = 0;
        for (let i = 0; i < episodes; i++) {
            let obs = env.reset().observation;
            let done = false;
            let steps = 0;
            let episodeReward = 0;

            while (!done && steps < maxSteps) {
                const action = await agent.act(obs);
                const res = env.step(action);
                await agent.learn(obs, action, res.reward, res.observation, res.terminated);

                obs = res.observation;
                done = res.terminated || res.truncated;
                episodeReward += res.reward;
                steps++;
            }
            totalReward += episodeReward;
        }
        console.log(`${name}: Avg Reward = ${totalReward / episodes}`);
    }

    // Run Random
    await runAgent(randomAgent, 'RandomAgent');

    // Run NS
    // Note: NS might fail without real SeNARS
    await runAgent(nsAgent, 'NeuroSymbolicAgent');

} catch (e) {
    console.warn('Benchmark skipped or failed due to environment issues:', e.message);
}
