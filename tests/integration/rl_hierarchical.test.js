
import { NeuroSymbolicAgent } from '../../rl/src/agents/NeuroSymbolicAgent.js';
import { GridWorld } from '../../rl/src/environments/GridWorld.js';
import { Skill } from '../../rl/src/core/Skill.js';

describe('RL Hierarchical Integration Tests', () => {

    test('Agent selects and uses a registered skill', async () => {
        const env = new GridWorld();
        // Hierarchical enabled, reasoning with 'metta'
        const agent = new NeuroSymbolicAgent(env, { reasoning: 'metta', planning: true });

        await agent.initialize();

        // 1. Define a Skill
        // A "MoveRight" skill that always returns action 1
        const moveRightSkill = new Skill('move_right', {
            action: () => 1, // Action 1 is Right in GridWorld
            precondition: (obs) => true, // Always applicable
            termination: (obs) => false // Never terminates (for this test)
        });

        // 2. Register Skill
        agent.skills.register('skill_move_right', moveRightSkill);

        // 3. Inject Knowledge
        // "skill_move_right achieves goal_right"
        // <goal_right --> (achieved-by, skill_move_right)>.
        // Note: Use string concatenation to ensure term format is correct for the parser
        // <(goal_right, skill_move_right) --> achieved-by>. (relation syntax)
        // OR <goal_right --> (achieved-by, skill_move_right)>.
        // Let's use the latter.
        // Wait, "Input processing failed: NarseseParser parsing failed: Expected task or term but "<" found."
        // This usually means it couldn't parse the start.
        // Maybe spaces? Or term structure.

        // Let's use simpler terms to start with.
        await agent.bridge.input('<goal_right --> (achieved_by, skill_move_right)>.');

        // Ensure knowledge is processed
        await agent.bridge.runCycles(10);

        // 4. Act with Goal
        // Goal: "goal_right"
        const goal = "goal_right";
        const obs = env.reset().observation;

        // The agent should:
        // 1. Query <goal_right --> (achieved-by, ?skill)>?
        // 2. Receive ?skill = skill_move_right
        // 3. Select that skill
        // 4. Execute skill.act() -> 1

        const action = await agent.act(obs, goal);

        // Verify
        expect(action).toBe(1);

        // Check internal state (optional, but good for debugging)
        expect(agent.hierarchical.currentOption).toBeDefined();
        expect(agent.hierarchical.currentOption.name).toBe('move_right');
    });

    test('Agent falls back if no skill found', async () => {
        const env = new GridWorld();
        const agent = new NeuroSymbolicAgent(env, { reasoning: 'metta', planning: true });
        await agent.initialize();

        const goal = "impossible_goal";
        const obs = env.reset().observation;

        // No knowledge injected

        const action = await agent.act(obs, goal);

        // Should be random (0-3)
        expect(action).toBeGreaterThanOrEqual(0);
        expect(action).toBeLessThan(4);

        // Current option should be null or a random fallback skill if library had one (but library is empty)
        // Wait, act() calls selectOption. If it returns null, it falls back to planner.
        // If planner fails (no knowledge), it falls back to random.
        // So action is random.
    });

});
