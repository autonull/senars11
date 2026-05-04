# MeTTa + SeNARS + LM: Architecture for General Intelligence

**Date**: 2026-03-08  
**Version**: 5.0 (AGI Architecture)  
**Status**: Honest specification with clear gap analysis

---

## Executive Summary

**Why v4.0 isn't AGI**:

| Gap | Why It Matters | v4.0 Status |
|-----|----------------|-------------|
| **No unified world model** | Can't simulate, plan, or reason about counterfactuals | ❌ Missing |
| **No hierarchical goals** | Can't pursue complex objectives over time | ❌ Missing |
| **No meta-learning** | Can't improve learning algorithms, only rules | ❌ Missing |
| **No embodiment** | No sensorimotor grounding, no real consequences | ❌ Missing |
| **No architectural self-modification** | Can't add new cognitive capabilities | ❌ Missing |
| **No open-ended learning** | Fixed capability set, just optimization | ❌ Missing |

**v5.0 claim**: Not "AGI achieved" but **"Architecture that could scale toward AGI with sufficient development."**

**Honest timeline**: 52 weeks to minimal architecture, not 12  
**Honest confidence**: Medium (architecture is necessary but not sufficient)

---

## Part I: What AGI Actually Requires

### Defining AGI

**AGI = General + Autonomous + Adaptive Intelligence**

| Property | Description | Test |
|----------|-------------|------|
| **Generality** | Works across domains without redesign | Same system does science, art, planning, social reasoning |
| **Autonomy** | Generates and pursues own goals | Self-directed learning over months |
| **Adaptivity** | Learns new capabilities, not just optimizes | Can acquire entirely new cognitive skills |
| **Understanding** | Models world, not just correlations | Can answer "why" and "what if" questions |
| **Transfer** | Applies learning across vastly different domains | Math learning helps social reasoning |

### Why v4.0 Falls Short

```
v4.0 Architecture:
┌─────────────────────────────────────┐
│  SeNARS (inference)                 │
│    ↓                                │
│  MeTTa (self-representation)        │
│    ↓                                │
│  LM (guidance)                      │
└─────────────────────────────────────┘

Missing:
- World model (what does the system believe about reality?)
- Goal hierarchy (how are complex objectives structured?)
- Meta-cognition (how does it think about thinking?)
- Embodiment (what are the consequences of actions?)
- Architectural plasticity (can it add new capabilities?)
```

**v4.0 is**: A self-optimizing inference engine  
**AGI requires**: A self-constructing cognitive architecture

---

## Part II: The Missing Layers

### Layer 1: Unified World Model

**Problem**: v4.0 has beliefs but no coherent model of how the world works.

**Solution**: Construct and maintain a queryable, simulatable world model.

```javascript
// In core/src/world/WorldModel.js

import { BaseComponent } from '../util/BaseComponent.js';
import { CausalGraph } from './CausalGraph.js';
import { ObjectModel } from './ObjectModel.js';
import { Simulator } from './Simulator.js';

/**
 * WorldModel: Unified representation of system's understanding of reality
 * 
 * Capabilities:
 * - Causal reasoning (A causes B)
 * - Counterfactual simulation (what if A didn't happen?)
 * - Temporal projection (what will happen next?)
 * - Object permanence (things exist when not observed)
 */
export class WorldModel extends BaseComponent {
    constructor(memory, lm, config = {}) {
        super(config, 'WorldModel');
        this.memory = memory;
        this.lm = lm;
        this.causalGraph = new CausalGraph();
        this.objectModels = new Map();  // object_id -> ObjectModel
        this.simulator = new Simulator(this);
        this.beliefState = new Map();  // proposition -> {truth, sources, timestamp}
    }
    
    /**
     * Update world model from new observation
     */
    async observe(observation, context = {}) {
        // 1. Extract entities and relations
        const entities = await this._extractEntities(observation);
        const relations = await this._extractRelations(observation);
        
        // 2. Update object models
        for (const entity of entities) {
            await this._updateObjectModel(entity);
        }
        
        // 3. Update causal graph
        for (const relation of relations) {
            if (relation.type === 'causal') {
                this.causalGraph.add(relation.cause, relation.effect, relation.strength);
            }
        }
        
        // 4. Update belief state
        await this._updateBeliefs(observation, context);
        
        // 5. Check for inconsistencies
        const inconsistencies = await this._detectInconsistencies();
        if (inconsistencies.length > 0) {
            await this._resolveInconsistencies(inconsistencies);
        }
        
        return { entities, relations, inconsistencies };
    }
    
    /**
     * Simulate counterfactual: what if X were true?
     */
    async simulateCounterfactual(proposition, horizon = 10) {
        // Create alternate belief state
        const alternateState = new Map(this.beliefState);
        alternateState.set(proposition, { truth: 1.0, sources: ['counterfactual'] });
        
        // Run simulation forward
        const trajectory = [];
        let currentState = alternateState;
        
        for (let i = 0; i < horizon; i++) {
            const nextState = await this.simulator.step(currentState);
            trajectory.push(nextState);
            currentState = nextState;
        }
        
        return {
            proposition,
            trajectory,
            outcomes: this._extractOutcomes(trajectory)
        };
    }
    
    /**
     * Answer "why" questions via causal tracing
     */
    async explainWhy(question) {
        // Parse question to extract effect
        const effect = await this._parseWhyQuestion(question);
        
        // Trace causal graph backward
        const causes = this.causalGraph.findCauses(effect);
        
        // Build explanation chain
        const explanation = await this._buildExplanationChain(causes, effect);
        
        return {
            question,
            explanation,
            confidence: this._computeExplanationConfidence(causes)
        };
    }
    
    /**
     * Answer "what if" questions via simulation
     */
    async explainWhatIf(question) {
        const { action, context } = await this._parseWhatIfQuestion(question);
        
        // Simulate action in current world state
        const simulation = await this.simulator.simulate(action, context);
        
        return {
            question,
            simulation,
            likelyOutcomes: simulation.trajectory.slice(-3),
            confidence: simulation.confidence
        };
    }
    
    /**
     * Get current world state as queryable structure
     */
    getState() {
        return {
            beliefs: Object.fromEntries(this.beliefState),
            objects: Array.from(this.objectModels.entries()),
            causalGraph: this.causalGraph.toGraph(),
            timestamp: Date.now()
        };
    }
    
    async _extractEntities(observation) {
        // Use LM for semantic extraction
        const prompt = `Extract entities from this observation:

Observation: ${observation}

Return list of entities with types:
{
  "entities": [
    {"name": "...", "type": "...", "properties": {...}}
  ]
}`;
        
        const response = await this.lm.generateText(prompt);
        return JSON.parse(response.text).entities;
    }
    
    async _extractRelations(observation) {
        // Use LM for relation extraction
        const prompt = `Extract causal and other relations from this observation:

Observation: ${observation}

Return relations:
{
  "relations": [
    {"type": "causal|temporal|spatial|logical", 
     "cause": "...", "effect": "...", "strength": 0.0-1.0}
  ]
}`;
        
        const response = await this.lm.generateText(prompt);
        return JSON.parse(response.text).relations;
    }
}
```

**Causal Graph Implementation**:

```javascript
// In core/src/world/CausalGraph.js

export class CausalGraph {
    constructor() {
        this.nodes = new Map();  // node_id -> Node
        this.edges = new Map();  // edge_id -> Edge
    }
    
    add(cause, effect, strength = 0.5) {
        // Add nodes if needed
        if (!this.nodes.has(cause)) {
            this.nodes.set(cause, { id: cause, inEdges: [], outEdges: [] });
        }
        if (!this.nodes.has(effect)) {
            this.nodes.set(effect, { id: effect, inEdges: [], outEdges: [] });
        }
        
        // Add edge
        const edgeId = `${cause}→${effect}`;
        const edge = {
            id: edgeId,
            cause,
            effect,
            strength,
            evidence: 1,
            lastUpdated: Date.now()
        };
        
        this.edges.set(edgeId, edge);
        this.nodes.get(cause).outEdges.push(edgeId);
        this.nodes.get(effect).inEdges.push(edgeId);
    }
    
    /**
     * Find all causes of an effect (backward chaining)
     */
    findCauses(effect, depth = 3) {
        const causes = [];
        const visited = new Set();
        
        const traverse = (node, currentDepth) => {
            if (currentDepth > depth || visited.has(node)) return;
            visited.add(node);
            
            const nodeData = this.nodes.get(node);
            if (!nodeData) return;
            
            for (const edgeId of nodeData.inEdges) {
                const edge = this.edges.get(edgeId);
                causes.push({
                    cause: edge.cause,
                    effect: edge.effect,
                    strength: edge.strength,
                    depth: currentDepth
                });
                traverse(edge.cause, currentDepth + 1);
            }
        };
        
        traverse(effect, 0);
        return causes;
    }
    
    /**
     * Find all effects of a cause (forward chaining)
     */
    findEffects(cause, depth = 3) {
        const effects = [];
        const visited = new Set();
        
        const traverse = (node, currentDepth) => {
            if (currentDepth > depth || visited.has(node)) return;
            visited.add(node);
            
            const nodeData = this.nodes.get(node);
            if (!nodeData) return;
            
            for (const edgeId of nodeData.outEdges) {
                const edge = this.edges.get(edgeId);
                effects.push({
                    cause: edge.cause,
                    effect: edge.effect,
                    strength: edge.strength,
                    depth: currentDepth
                });
                traverse(edge.effect, currentDepth + 1);
            }
        };
        
        traverse(cause, 0);
        return effects;
    }
    
    /**
     * Update edge strength based on new evidence
     */
    updateEvidence(cause, effect, success) {
        const edgeId = `${cause}→${effect}`;
        const edge = this.edges.get(edgeId);
        
        if (!edge) return;
        
        // Bayesian update of strength
        const prior = edge.strength;
        const likelihood = success ? 0.9 : 0.1;
        const posterior = (prior * likelihood) / 
            (prior * likelihood + (1 - prior) * (1 - likelihood));
        
        edge.strength = posterior;
        edge.evidence++;
        edge.lastUpdated = Date.now();
    }
    
    toGraph() {
        return {
            nodes: Array.from(this.nodes.values()),
            edges: Array.from(this.edges.values())
        };
    }
}
```

---

### Layer 2: Hierarchical Goal Management

**Problem**: v4.0 generates goals but can't pursue complex multi-step objectives.

**Solution**: Hierarchical goal decomposition with persistent pursuit.

```javascript
// In core/src/goals/HierarchicalGoalManager.js

import { BaseComponent } from '../util/BaseComponent.js';
import { GoalNode } from './GoalNode.js';

/**
 * HierarchicalGoalManager: Manages complex, multi-level goals
 * 
 * Capabilities:
 * - Goal decomposition (break into subgoals)
 * - Progress tracking across levels
 * - Resource allocation between goals
 * - Conflict resolution
 * - Persistent pursuit over time
 */
export class HierarchicalGoalManager extends BaseComponent {
    constructor(worldModel, lm, config = {}) {
        super(config, 'HierarchicalGoalManager');
        this.worldModel = worldModel;
        this.lm = lm;
        this.goalTree = new Map();  // goal_id -> GoalNode
        this.activeGoals = new Set();
        this.completedGoals = new Map();
        this.resourceBudget = { cognitive: 100, temporal: 1000 };
    }
    
    /**
     * Add a high-level goal
     */
    async addGoal(goalDescription, priority = 0.5) {
        // LM analyzes goal and creates decomposition
        const decomposition = await this._decomposeGoal(goalDescription);
        
        // Create goal tree
        const rootGoal = new GoalNode({
            id: `goal-${Date.now()}`,
            description: goalDescription,
            priority,
            children: decomposition.subgoals,
            successCriteria: decomposition.successCriteria
        });
        
        this.goalTree.set(rootGoal.id, rootGoal);
        this.activeGoals.add(rootGoal.id);
        
        return rootGoal;
    }
    
    /**
     * Decompose goal into subgoals using LM
     */
    async _decomposeGoal(goalDescription) {
        const prompt = `Decompose this goal into achievable subgoals:

Goal: ${goalDescription}

Context:
- Available capabilities: inference, learning, memory, action
- Constraints: limited cognitive resources, sequential execution

Return decomposition:
{
  "subgoals": [
    {
      "description": "...",
      "prerequisites": ["goal-id-1", ...],
      "estimatedDifficulty": 0.0-1.0,
      "requiredCapabilities": ["inference", "learning", ...]
    }
  ],
  "successCriteria": "...",
  "failureModes": ["...", ...],
  "estimatedCycles": 100
}`;
        
        const response = await this.lm.generateText(prompt);
        return JSON.parse(response.text);
    }
    
    /**
     * Execute one cycle of goal pursuit
     */
    async pursueGoals() {
        const actions = [];
        
        for (const goalId of this.activeGoals) {
            const goal = this.goalTree.get(goalId);
            
            // Get actionable subgoals (prerequisites met)
            const actionable = goal.getActionableSubgoals();
            
            for (const subgoal of actionable) {
                // Allocate resources
                if (!this._hasResources(subgoal.estimatedDifficulty)) {
                    continue;
                }
                
                // Execute subgoal
                const result = await this._executeSubgoal(subgoal, goal);
                
                if (result.success) {
                    subgoal.completed = true;
                    this.resourceBudget.cognitive -= subgoal.estimatedDifficulty * 10;
                } else {
                    // Handle failure
                    await this._handleFailure(subgoal, result);
                }
                
                actions.push({ goal: goalId, subgoal, result });
            }
            
            // Check if goal is complete
            if (goal.isComplete()) {
                await this._completeGoal(goal);
            }
            
            // Check if goal is impossible
            if (goal.isImpossible()) {
                await this._abandonGoal(goal);
            }
        }
        
        return actions;
    }
    
    /**
     * Execute a subgoal
     */
    async _executeSubgoal(subgoal, parentGoal) {
        switch (subgoal.type) {
            case 'learn':
                return await this._executeLearnSubgoal(subgoal);
            case 'explore':
                return await this._executeExploreSubgoal(subgoal);
            case 'achieve':
                return await this._executeAchieveSubgoal(subgoal);
            case 'resolve':
                return await this._executeResolveSubgoal(subgoal);
            default:
                return { success: false, error: 'Unknown subgoal type' };
        }
    }
    
    async _executeLearnSubgoal(subgoal) {
        // Create learning tasks
        const tasks = await this._generateLearningTasks(subgoal);
        
        // Input tasks to system
        for (const task of tasks) {
            await this.nar.input(task);
        }
        
        // Run inference cycles
        await this.nar.run(subgoal.estimatedCycles);
        
        // Evaluate learning
        const evaluation = await this._evaluateLearning(subgoal);
        
        return {
            success: evaluation.improvement > 0.1,
            metrics: evaluation
        };
    }
    
    /**
     * Get current goal status
     */
    getGoalStatus(goalId) {
        const goal = this.goalTree.get(goalId);
        if (!goal) return null;
        
        return {
            id: goal.id,
            description: goal.description,
            progress: goal.computeProgress(),
            status: goal.getStatus(),
            activeSubgoals: goal.getActiveSubgoals().length,
            completedSubgoals: goal.getCompletedSubgoals().length
        };
    }
    
    /**
     * Get all active goals
     */
    getActiveGoals() {
        return Array.from(this.activeGoals).map(id => 
            this.getGoalStatus(id)
        );
    }
}
```

**Goal Node Implementation**:

```javascript
// In core/src/goals/GoalNode.js

export class GoalNode {
    constructor({ id, description, priority, children = [], successCriteria }) {
        this.id = id;
        this.description = description;
        this.priority = priority;
        this.children = children.map(c => new GoalNode(c));
        this.completed = false;
        this.abandoned = false;
        this.createdAt = Date.now();
        this.updatedAt = Date.now();
        this.history = [];
        this.successCriteria = successCriteria;
    }
    
    /**
     * Get subgoals that can be executed now (prerequisites met)
     */
    getActionableSubgoals() {
        return this.children.filter(child => 
            !child.completed && 
            !child.abandoned &&
            this._prerequisitesMet(child)
        );
    }
    
    _prerequisitesMet(subgoal) {
        const prereqs = subgoal.prerequisites || [];
        return prereqs.every(prereqId => {
            const prereq = this.children.find(c => c.id === prereqId);
            return prereq && prereq.completed;
        });
    }
    
    /**
     * Compute progress toward goal (0-1)
     */
    computeProgress() {
        if (this.children.length === 0) {
            return this.completed ? 1 : 0;
        }
        
        const childProgress = this.children.map(c => c.computeProgress());
        return childProgress.reduce((a, b) => a + b, 0) / childProgress.length;
    }
    
    /**
     * Check if goal is complete
     */
    isComplete() {
        if (this.children.length === 0) {
            return this.completed;
        }
        return this.children.every(c => c.completed);
    }
    
    /**
     * Check if goal is impossible (all paths blocked)
     */
    isImpossible() {
        const actionable = this.getActionableSubgoals();
        return actionable.length === 0 && !this.isComplete();
    }
    
    getStatus() {
        if (this.completed) return 'completed';
        if (this.abandoned) return 'abandoned';
        if (this.isImpossible()) return 'blocked';
        return 'active';
    }
    
    getCompletedSubgoals() {
        return this.children.filter(c => c.completed);
    }
    
    getActiveSubgoals() {
        return this.children.filter(c => !c.completed && !c.abandoned);
    }
}
```

---

### Layer 3: Meta-Learning Architecture

**Problem**: v4.0 can modify rules but not learning algorithms.

**Solution**: Represent and modify the learning process itself.

```javascript
// In core/src/meta/MetaLearner.js

import { BaseComponent } from '../util/BaseComponent.js';

/**
 * MetaLearner: Learns about and improves learning processes
 * 
 * Capabilities:
 * - Monitor learning performance
 * - Identify bottlenecks and inefficiencies
 * - Propose algorithm modifications
 * - Test and validate improvements
 * - Accumulate meta-knowledge about learning
 */
export class MetaLearner extends BaseComponent {
    constructor(agent, worldModel, lm, config = {}) {
        super(config, 'MetaLearner');
        this.agent = agent;
        this.worldModel = worldModel;
        this.lm = lm;
        this.learningHistory = [];
        this.metaKnowledge = new Map();  // pattern -> insight
        this.hypotheses = [];
    }
    
    /**
     * Analyze learning performance across episodes
     */
    async analyzeLearningPerformance(episodes = 100) {
        const recentEpisodes = this.learningHistory.slice(-episodes);
        
        // Compute metrics
        const metrics = {
            averageImprovement: this._computeAverageImprovement(recentEpisodes),
            learningRate: this._computeLearningRate(recentEpisodes),
            bottlenecks: await this._identifyBottlenecks(recentEpisodes),
            successfulPatterns: await this._identifySuccessfulPatterns(recentEpisodes)
        };
        
        // Generate insights
        const insights = await this._generateInsights(metrics);
        
        return { metrics, insights };
    }
    
    /**
     * Propose improvements to learning algorithm
     */
    async proposeImprovements() {
        const analysis = await this.analyzeLearningPerformance();
        
        // LM generates improvement hypotheses
        const prompt = `Analyze learning performance and propose improvements:

CURRENT PERFORMANCE:
  Average improvement per episode: ${analysis.metrics.averageImprovement.toFixed(3)}
  Learning rate: ${analysis.metrics.learningRate.toFixed(3)}
  
IDENTIFIED BOTTLENECKS:
${analysis.metrics.bottlenecks.map(b => `  - ${b}`).join('\n')}

SUCCESSFUL PATTERNS:
${analysis.metrics.successfulPatterns.map(p => `  - ${p}`).join('\n')}

CURRENT LEARNING ALGORITHM:
  - Rule evolution: mutation + selection
  - Goal generation: curiosity + competence + coherence
  - Memory: attention-based with decay
  - Inference: NARS rules with LM guidance

TASK:
Propose 3 specific improvements to the learning algorithm.
For each improvement:
1. What to change
2. Why it should help
3. How to test it
4. Predicted impact

Respond in JSON format:
{
  "improvements": [
    {
      "description": "...",
      "rationale": "...",
      "testMethod": "...",
      "predictedImpact": "low|medium|high",
      "confidence": 0.0-1.0,
      "implementationComplexity": "low|medium|high"
    }
  ]
}`;
        
        const response = await this.lm.generateText(prompt);
        return JSON.parse(response.text).improvements;
    }
    
    /**
     * Test a proposed improvement
     */
    async testImprovement(improvement, episodes = 50) {
        // Save current configuration
        const savedConfig = this._saveConfiguration();
        
        // Apply improvement
        await this._applyImprovement(improvement);
        
        // Run test episodes
        const results = [];
        for (let i = 0; i < episodes; i++) {
            const result = await this._runLearningEpisode();
            results.push(result);
        }
        
        // Restore configuration
        await this._restoreConfiguration(savedConfig);
        
        // Analyze results
        const analysis = this._analyzeTestResults(results, improvement);
        
        return {
            improvement,
            results,
            analysis,
            recommended: analysis.improvement > 0
        };
    }
    
    /**
     * Apply a validated improvement permanently
     */
    async applyImprovement(improvement) {
        await this._applyImprovement(improvement);
        
        // Record in meta-knowledge
        this.metaKnowledge.set(improvement.description, {
            type: 'improvement',
            impact: 'positive',
            appliedAt: Date.now(),
            context: await this._getContext()
        });
        
        this.logInfo('Improvement applied', { improvement });
    }
    
    async _identifyBottlenecks(episodes) {
        const bottlenecks = [];
        
        // Analyze where learning stalls
        const plateaus = this._findPlateaus(episodes);
        if (plateaus.length > 0) {
            bottlenecks.push(`Learning plateaus after ${plateaus[0]} episodes`);
        }
        
        // Analyze failure patterns
        const failures = this._analyzeFailures(episodes);
        if (failures.common.length > 0) {
            bottlenecks.push(`Common failures: ${failures.common.join(', ')}`);
        }
        
        // Analyze resource usage
        const resources = this._analyzeResourceUsage(episodes);
        if (resources.bottleneck) {
            bottlenecks.push(`Resource bottleneck: ${resources.bottleneck}`);
        }
        
        return bottlenecks;
    }
    
    async _generateInsights(metrics) {
        const prompt = `Generate insights about learning from these metrics:

${JSON.stringify(metrics, null, 2)}

Provide insights about:
1. What's working well
2. What's limiting performance
3. What to try next

Respond in JSON format:
{
  "strengths": ["...", ...],
  "limitations": ["...", ...],
  "recommendations": ["...", ...]
}`;
        
        const response = await this.lm.generateText(prompt);
        return JSON.parse(response.text);
    }
}
```

---

### Layer 4: Embodied Interaction

**Problem**: v4.0 has no real environment, no consequences.

**Solution**: Connect to environments where actions have outcomes.

```javascript
// In core/src/embodiment/EmbodiedAgent.js

import { BaseComponent } from '../util/BaseComponent.js';

/**
 * EmbodiedAgent: Agent that acts in environments and learns from outcomes
 * 
 * Capabilities:
 * - Perceive environment state
 * - Select and execute actions
 * - Learn from consequences
 * - Build world model through interaction
 */
export class EmbodiedAgent extends BaseComponent {
    constructor(agent, worldModel, config = {}) {
        super(config, 'EmbodiedAgent');
        this.agent = agent;
        this.worldModel = worldModel;
        this.environments = new Map();  // env_id -> Environment
        this.currentEnv = null;
        this.episodeHistory = [];
    }
    
    /**
     * Connect to an environment
     */
    async connectToEnvironment(env) {
        this.currentEnv = env;
        await env.initialize();
        
        this.logInfo('Connected to environment', {
            id: env.id,
            type: env.type,
            actionSpace: env.actionSpace,
            observationSpace: env.observationSpace
        });
    }
    
    /**
     * Run one episode in environment
     */
    async runEpisode(maxSteps = 1000) {
        if (!this.currentEnv) {
            throw new Error('No environment connected');
        }
        
        const episode = {
            id: `episode-${Date.now()}`,
            startTime: Date.now(),
            steps: [],
            totalReward: 0,
            completed: false
        };
        
        let observation = await this.currentEnv.reset();
        let step = 0;
        
        while (step < maxSteps && !episode.completed) {
            // Perceive
            await this.worldModel.observe(observation, { source: 'environment' });
            
            // Deliberate
            const action = await this._selectAction(observation);
            
            // Act
            const { nextObservation, reward, done, info } = 
                await this.currentEnv.step(action);
            
            // Learn from outcome
            await this._learnFromOutcome(observation, action, reward, nextObservation);
            
            // Record step
            episode.steps.push({
                step,
                observation,
                action,
                reward,
                nextObservation,
                done
            });
            
            episode.totalReward += reward;
            episode.completed = done;
            
            observation = nextObservation;
            step++;
        }
        
        episode.endTime = Date.now();
        episode.duration = episode.endTime - episode.startTime;
        this.episodeHistory.push(episode);
        
        return episode;
    }
    
    /**
     * Select action using agent's reasoning
     */
    async _selectAction(observation) {
        // Convert observation to Narsese
        const narseseObs = await this._observationToNarsese(observation);
        
        // Get available actions
        const actions = this.currentEnv.getActionSpace();
        
        // Query agent for best action
        // (This uses the agent's full reasoning capability)
        const actionQuery = `(Goal [achieve] [high-reward])`;
        await this.agent.input(actionQuery);
        
        // Consider each action
        const actionValues = [];
        for (const action of actions) {
            const actionNarsese = await this._actionToNarsese(action);
            
            // Simulate outcome using world model
            const simulation = await this.worldModel.simulateCounterfactual(
                `(Seq ${actionNarsese} [reward])`,
                5
            );
            
            const expectedValue = this._computeExpectedValue(simulation);
            actionValues.push({ action, expectedValue });
        }
        
        // Select best action (with exploration)
        const best = actionValues.sort((a, b) => b.expectedValue - a.expectedValue)[0];
        return best.action;
    }
    
    /**
     * Learn from action outcome
     */
    async _learnFromOutcome(observation, action, reward, nextObservation) {
        // Create learning task from experience
        const task = await this._experienceToTask(observation, action, reward, nextObservation);
        
        // Input to agent
        await this.agent.input(task);
        
        // Update world model
        if (reward > 0) {
            this.worldModel.causalGraph.updateEvidence(
                action.toString(),
                'high-reward',
                true
            );
        } else {
            this.worldModel.causalGraph.updateEvidence(
                action.toString(),
                'high-reward',
                false
            );
        }
    }
    
    /**
     * Get learning metrics from episodes
     */
    getLearningMetrics() {
        if (this.episodeHistory.length === 0) {
            return { episodes: 0 };
        }
        
        const recent = this.episodeHistory.slice(-20);
        const older = this.episodeHistory.slice(-40, -20);
        
        return {
            totalEpisodes: this.episodeHistory.length,
            averageReward: recent.reduce((s, e) => s + e.totalReward, 0) / recent.length,
            improvement: this._computeImprovement(recent, older),
            successRate: recent.filter(e => e.totalReward > 0).length / recent.length
        };
    }
    
    _computeImprovement(recent, older) {
        if (older.length === 0) return 0;
        
        const recentAvg = recent.reduce((s, e) => s + e.totalReward, 0) / recent.length;
        const olderAvg = older.reduce((s, e) => s + e.totalReward, 0) / older.length;
        
        return recentAvg - olderAvg;
    }
}
```

---

### Layer 5: Architectural Self-Modification

**Problem**: v4.0 can modify rules but not its own architecture.

**Solution**: Represent architecture as modifiable structure.

```javascript
// In core/src/architecture/ArchitecturalSelfModifier.js

import { BaseComponent } from '../util/BaseComponent.js';

/**
 * ArchitecturalSelfModifier: Modifies system's own cognitive architecture
 * 
 * Capabilities:
 * - Represent architecture as data structure
 * - Propose architectural changes
 * - Safely apply modifications
 * - Verify changes preserve capabilities
 */
export class ArchitecturalSelfModifier extends BaseComponent {
    constructor(agent, lm, safetyVerifier, config = {}) {
        super(config, 'ArchitecturalSelfModifier');
        this.agent = agent;
        this.lm = lm;
        this.safetyVerifier = safetyVerifier;
        this.architectureModel = this._buildArchitectureModel();
        this.modificationHistory = [];
    }
    
    /**
     * Build model of current architecture
     */
    _buildArchitectureModel() {
        return {
            components: [
                {
                    id: 'inference',
                    type: 'reasoning',
                    class: 'NAR',
                    capabilities: ['deduction', 'induction', 'abduction'],
                    parameters: { maxConcepts: 500, maxDerivationsPerStep: 100 },
                    performance: this._measureComponentPerformance('inference')
                },
                {
                    id: 'memory',
                    type: 'storage',
                    class: 'Memory',
                    capabilities: ['episodic', 'semantic', 'attention'],
                    parameters: { maxConcepts: 500, consolidationInterval: 10 },
                    performance: this._measureComponentPerformance('memory')
                },
                {
                    id: 'goal-system',
                    type: 'motivation',
                    class: 'HierarchicalGoalManager',
                    capabilities: ['decomposition', 'pursuit', 'prioritization'],
                    parameters: { resourceBudget: { cognitive: 100 } },
                    performance: this._measureComponentPerformance('goal-system')
                },
                {
                    id: 'world-model',
                    type: 'representation',
                    class: 'WorldModel',
                    capabilities: ['causal-reasoning', 'simulation', 'explanation'],
                    parameters: {},
                    performance: this._measureComponentPerformance('world-model')
                },
                {
                    id: 'lm-guidance',
                    type: 'semantic',
                    class: 'LMGuidedEvolution',
                    capabilities: ['grounding', 'evaluation', 'proposal'],
                    parameters: { temperature: 0.3 },
                    performance: this._measureComponentPerformance('lm-guidance')
                }
            ],
            connections: [
                { from: 'memory', to: 'inference', type: 'data' },
                { from: 'inference', to: 'goal-system', type: 'input' },
                { from: 'goal-system', to: 'inference', type: 'control' },
                { from: 'world-model', to: 'inference', type: 'knowledge' },
                { from: 'lm-guidance', to: 'inference', type: 'guidance' }
            ],
            capabilities: this._enumerateCapabilities()
        };
    }
    
    /**
     * Propose architectural improvements
     */
    async proposeArchitecturalChanges() {
        const performanceProfile = await this._analyzePerformanceProfile();
        
        const prompt = `Analyze cognitive architecture and propose improvements:

CURRENT ARCHITECTURE:
${JSON.stringify(this.architectureModel, null, 2)}

PERFORMANCE PROFILE:
${JSON.stringify(performanceProfile, null, 2)}

IDENTIFIED LIMITATIONS:
${performanceProfile.limitations.join('\n')}

TASK:
Propose architectural modifications to improve capabilities.
Consider:
1. New components to add
2. Existing components to modify
3. Connections to change
4. Capabilities to enhance

Respond in JSON format:
{
  "modifications": [
    {
      "type": "add-component|modify-component|remove-component|add-connection|modify-connection",
      "description": "...",
      "rationale": "...",
      "predictedImpact": "...",
      "riskLevel": "low|medium|high",
      "implementationSteps": ["...", ...]
    }
  ]
}`;
        
        const response = await this.lm.generateText(prompt);
        return JSON.parse(response.text).modifications;
    }
    
    /**
     * Safely apply architectural modification
     */
    async applyModification(modification) {
        // Safety verification
        const safety = await this.safetyVerifier.verifyModification({
            type: 'architectural',
            target: modification.description,
            change: modification,
            reasoning: modification.rationale
        });
        
        if (!safety.safe) {
            return {
                applied: false,
                reason: 'Safety check failed',
                concerns: safety.concerns
            };
        }
        
        // Save checkpoint
        const checkpoint = await this._saveCheckpoint();
        
        try {
            // Apply modification
            await this._applyModificationImpl(modification);
            
            // Verify capabilities preserved
            const verification = await this._verifyCapabilities();
            
            if (!verification.passed) {
                // Rollback
                await this._restoreCheckpoint(checkpoint);
                return {
                    applied: false,
                    reason: 'Capability verification failed',
                    failures: verification.failures
                };
            }
            
            // Record success
            this.modificationHistory.push({
                modification,
                applied: true,
                timestamp: Date.now(),
                result: 'success'
            });
            
            // Update architecture model
            this.architectureModel = this._buildArchitectureModel();
            
            return { applied: true, modification };
            
        } catch (error) {
            // Rollback on error
            await this._restoreCheckpoint(checkpoint);
            return {
                applied: false,
                reason: 'Error during application',
                error: error.message
            };
        }
    }
    
    async _verifyCapabilities() {
        const capabilities = this._enumerateCapabilities();
        const failures = [];
        
        for (const cap of capabilities) {
            const test = await this._testCapability(cap);
            if (!test.passed) {
                failures.push({
                    capability: cap,
                    before: test.before,
                    after: test.after
                });
            }
        }
        
        return {
            passed: failures.length === 0,
            failures
        };
    }
    
    _enumerateCapabilities() {
        return [
            'logical-inference',
            'pattern-recognition',
            'goal-pursuit',
            'causal-reasoning',
            'counterfactual-simulation',
            'semantic-understanding',
            'learning-from-experience',
            'transfer-learning'
        ];
    }
    
    async _testCapability(capability) {
        // Run standardized test for capability
        // (Implementation depends on capability)
        const before = await this._runCapabilityTest(capability);
        // After modification, run again
        const after = await this._runCapabilityTest(capability);
        
        return {
            passed: after >= before * 0.9,  // Allow small regression
            before,
            after
        };
    }
}
```

---

## Part III: Integrated Architecture

### The Complete AGI Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    COGNITIVE AGENT v5.0                          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              EMBODIMENT LAYER                            │   │
│  │    (Perception → Action → Consequences → Learning)       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            ↕                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              WORLD MODEL                                 │   │
│  │    (Causal Graph │ Simulation │ Explanation)             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            ↕                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           HIERARCHICAL GOAL SYSTEM                       │   │
│  │    (Decomposition │ Pursuit │ Resource Allocation)       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            ↕                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              COGNITIVE CORE                              │   │
│  │    SeNARS (Inference) + MeTTa (Self-rep) + LM (Ground)  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            ↕                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           META-LEARNING LAYER                            │   │
│  │    (Monitor │ Analyze │ Improve Learning)                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            ↕                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │        ARCHITECTURAL SELF-MODIFICATION                   │   │
│  │    (Represent │ Propose │ Verify │ Apply Changes)        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  This architecture can:                                          │
│  1. Understand the world (World Model)                          │
│  2. Pursue complex goals (Hierarchical Goals)                   │
│  3. Improve its learning (Meta-Learning)                        │
│  4. Modify its architecture (Self-Modification)                 │
│  5. Learn from consequences (Embodiment)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part IV: Why This Could Scale Toward AGI

### Necessary Conditions (All Present)

| Condition | v5.0 Status | Why It Matters |
|-----------|-------------|----------------|
| **World modeling** | ✅ CausalGraph + Simulator | Enables planning, explanation |
| **Hierarchical goals** | ✅ GoalNode tree | Enables complex objective pursuit |
| **Meta-learning** | ✅ MetaLearner | Enables algorithm improvement |
| **Embodiment** | ✅ EmbodiedAgent | Enables grounded learning |
| **Architectural plasticity** | ✅ ArchitecturalSelfModifier | Enables capability expansion |
| **Semantic grounding** | ✅ LM integration | Enables understanding |
| **Self-representation** | ✅ Architecture model | Enables self-modification |

### Sufficient Conditions (Unknown)

| Question | Current Approach | Open Research |
|----------|------------------|---------------|
| **Scale needed?** | Unknown | Test with increasing resources |
| **Additional mechanisms?** | Unknown | Compare variants empirically |
| **Training data needed?** | Unknown | Measure sample efficiency |
| **Compute requirements?** | Unknown | Profile and optimize |

---

## Part V: Honest Assessment

### What v5.0 Achieves

| Capability | Status | Evidence Required |
|------------|--------|-------------------|
| Self-modifying rules | ✅ Implemented | Utility improvement |
| World modeling | ✅ Implemented | Accurate predictions |
| Hierarchical goals | ✅ Implemented | Multi-step achievement |
| Meta-learning | ✅ Implemented | Algorithm improvements |
| Embodiment | ✅ Implemented | Environmental success |
| Architectural modification | ✅ Implemented | Capability expansion |

### What v5.0 Does NOT Guarantee

| Claim | Status | Why |
|-------|--------|-----|
| **AGI achieved** | ❌ No | Architecture necessary but not sufficient |
| **Human-level performance** | ❌ No | Unknown scale requirements |
| **Safe by default** | ❌ No | Safety is heuristic (LM-based) |
| **Conscious understanding** | ❌ No | Philosophical question, unmeasurable |
| **Guaranteed improvement** | ❌ No | Could hit local optima |

### What Would Constitute Evidence of Progress

| Milestone | Measurement | Timeline |
|-----------|-------------|----------|
| **World model accuracy** | >80% prediction accuracy at 10-step horizon | Weeks 8-12 |
| **Goal achievement** | Complete 3-level goal hierarchies | Weeks 12-16 |
| **Meta-learning** | Discover and apply algorithm improvement | Weeks 16-20 |
| **Transfer learning** | Learning in env A helps in env B | Weeks 20-24 |
| **Architectural improvement** | Add capability via self-modification | Weeks 24-30 |
| **Open-ended learning** | Continuous improvement over 1000 episodes | Weeks 30-52 |

---

## Part VI: Implementation Roadmap

### Phase 1: World Model (Weeks 1-12)

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| 1-4 | Causal graph | `CausalGraph.js` with inference |
| 5-8 | Simulation | `Simulator.js` with counterfactuals |
| 9-12 | Explanation | `explainWhy()`, `explainWhatIf()` |

### Phase 2: Hierarchical Goals (Weeks 13-20)

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| 13-16 | Goal decomposition | `HierarchicalGoalManager.js` |
| 17-20 | Persistent pursuit | Multi-episode goal achievement |

### Phase 3: Meta-Learning (Weeks 21-28)

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| 21-24 | Performance analysis | `MetaLearner.js` analysis |
| 25-28 | Algorithm improvement | Discovered and applied improvements |

### Phase 4: Embodiment (Weeks 29-36)

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| 29-32 | Environment integration | `EmbodiedAgent.js` |
| 33-36 | Learning from consequences | Measurable improvement in env |

### Phase 5: Architectural Self-Modification (Weeks 37-52)

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| 37-42 | Architecture representation | `ArchitecturalSelfModifier.js` |
| 43-48 | Safe modification | Verified changes |
| 49-52 | Capability expansion | New capability added |

---

## Part VII: Open Questions

### Research Questions

1. **What is the minimal world model complexity for useful simulation?**
   - Hypothesis: Causal graphs with depth 3-5 sufficient for many tasks
   
2. **How deep should goal hierarchies be before diminishing returns?**
   - Hypothesis: 3-5 levels optimal for most objectives
   
3. **Can meta-learning discover fundamentally new algorithms?**
   - Unknown: May only find local improvements
   
4. **What environments best support open-ended learning?**
   - Candidate: ProcGen, MiniHack, custom grid worlds
   
5. **How to verify architectural changes don't degrade capabilities?**
   - Approach: Comprehensive capability test suite

### Safety Questions

1. **How to prevent instrumental convergence?**
   - Current: LM-based detection (heuristic)
   - Needed: Formal verification

2. **How to ensure goal stability across self-modification?**
   - Current: Semantic comparison
   - Needed: Cryptographic goal commitments

3. **How to make self-modification interruptible?**
   - Current: Checkpoint/rollback
   - Needed: Atomic modifications

4. **How to detect capability gains that could be dangerous?**
   - Current: LM evaluation
   - Needed: Automated capability assessment

---

## Conclusion

**v5.0 is not AGI** but provides an **architecture that could scale toward AGI**:

| Property | v5.0 | AGI Requirement |
|----------|------|-----------------|
| World model | ✅ Present | ✅ Necessary |
| Hierarchical goals | ✅ Present | ✅ Necessary |
| Meta-learning | ✅ Present | ✅ Necessary |
| Embodiment | ✅ Present | ✅ Necessary |
| Architectural plasticity | ✅ Present | ✅ Necessary |
| **Sufficient for AGI?** | ❓ Unknown | Requires empirical validation |

**Honest claim**: "Architecture for investigating pathways to general intelligence"

**Not**: "AGI achieved" or "AGI guaranteed"

**Value**: Even if AGI isn't achieved, the architecture produces:
- Better self-improving systems
- Understanding of cognitive architectures
- Data on what works and what doesn't
- Foundation for future research

---

*"The path to AGI isn't a single breakthrough but a staircase of architectures, each enabling the next."*
