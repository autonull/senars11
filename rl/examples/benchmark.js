
import { GridWorld } from '../src/environments/GridWorld.js';
import { Continuous1D } from '../src/environments/Continuous1D.js';
import { RandomAgent } from '../src/agents/RandomAgent.js';
import { PolicyGradientAgent } from '../src/agents/PolicyGradientAgent.js';
import { MeTTaAgent } from '../src/agents/MeTTaAgent.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runEpisode(env, agent) {
    const { observation } = env.reset();
    let totalReward = 0;
    let done = false;
    let steps = 0;

    let obs = observation;

    while (!done) {
        const action = await agent.act(obs);
        const result = env.step(action);
        const { observation: nextObs, reward, terminated, truncated } = result;
        done = terminated || truncated;

        await agent.learn(obs, action, reward, nextObs, done);

        totalReward += reward;
        obs = nextObs;
        steps++;
    }

    return { totalReward, steps };
}

async function benchmark(envName, agentName, AgentClass, episodes = 50, strategyPath = null) {
    console.log(`\n--- Benchmarking ${agentName} on ${envName} ---`);

    let env;
    if (envName === 'GridWorld') env = new GridWorld();
    else if (envName === 'Continuous1D') env = new Continuous1D();

    let agent;
    if (strategyPath) {
        agent = new AgentClass(env, strategyPath);
    } else {
        agent = new AgentClass(env);
    }

    const rewards = [];

    const startTime = Date.now();

    for (let i = 0; i < episodes; i++) {
        console.time(`Episode ${i}`);
        const { totalReward, steps } = await runEpisode(env, agent);
        console.timeEnd(`Episode ${i}`);
        rewards.push(totalReward);

        if ((i + 1) % 1 === 0) {
             console.log(`Episode ${i + 1}: Reward = ${totalReward.toFixed(2)}, Steps = ${steps}`);
        }
    }

    const avgReward = rewards.reduce((a, b) => a + b, 0) / episodes;
    console.log(`Final Average Reward: ${avgReward.toFixed(2)}`);
    console.log(`Time taken: ${(Date.now() - startTime) / 1000}s`);
}

async function main() {
    // 1. GridWorld Benchmark (Discrete)
    console.log("=== GRID WORLD BENCHMARK ===");

    // Random
    await benchmark('GridWorld', 'Random', RandomAgent, 5);

    // Policy Gradient
    // Note: PG might need more episodes to learn, but we keep it short for demo
    await benchmark('GridWorld', 'PolicyGradient', PolicyGradientAgent, 5);

    // MeTTa Q-Learning
    const qStrategy = path.join(__dirname, '../strategies/q-learning.metta');
    await benchmark('GridWorld', 'MeTTa-Q', MeTTaAgent, 5, qStrategy);

    // MeTTa Neuro-Symbolic
    const nsStrategy = path.join(__dirname, '../strategies/neuro-symbolic.metta');
    await benchmark('GridWorld', 'MeTTa-NeuroSymbolic', MeTTaAgent, 5, nsStrategy);


    // 2. Continuous Benchmark (Continuous)
    console.log("\n=== CONTINUOUS 1D BENCHMARK ===");

    // Random
    await benchmark('Continuous1D', 'Random', RandomAgent, 5);

    // Policy Gradient
    await benchmark('Continuous1D', 'PolicyGradient', PolicyGradientAgent, 5);
}

main().catch(console.error);
