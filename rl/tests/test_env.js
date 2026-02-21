
import { GridWorld } from '../src/environments/GridWorld.js';
import { strict as assert } from 'assert';

console.log("Testing GridWorld...");

const env = new GridWorld(5, [0, 0], [4, 4]);

// Test reset
const { observation } = env.reset();
assert.deepEqual(observation, [0, 0]);
assert.equal(env.currentSteps, 0);

// Test step
const result = env.step(1); // Down (y+1)
assert.deepEqual(result.observation, [0, 1]);
assert.equal(result.reward, -0.1);
assert.equal(result.terminated, false);
assert.equal(result.truncated, false);

// Test goal
env.state = [4, 4];
const result2 = env.step(0); // Any action at goal?
// Step moves first, then checks goal.
// Wait, step logic:
// 1. Move
// 2. Check if moved to goal
// If state was already goal, step moves FROM goal.
// If goal is terminal, step shouldn't be called after done.
// But technically env allows it.

// Reset to near goal
env.reset();
env.state = [4, 3];
const result3 = env.step(1); // Down to [4, 4]
assert.deepEqual(result3.observation, [4, 4]);
assert.equal(result3.terminated, true);
assert.equal(result3.reward, 10);

console.log("GridWorld Tests Passed!");
