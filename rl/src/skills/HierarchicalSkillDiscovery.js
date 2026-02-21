/**
 * Hierarchical Skill Discovery System
 * 
 * Automatic discovery and composition of skills at multiple abstraction levels.
 * Skills are grounded in Narsese pre/post conditions with tensor-logic policies.
 */
import { Component } from '../composable/Component.js';
import { SymbolicTensor } from '../neurosymbolic/TensorLogicBridge.js';
import { TensorLogicPolicy } from '../policies/TensorLogicPolicy.js';
import { Experience } from '../experience/ExperienceSystem.js';

/**
 * Skill representation with neuro-symbolic grounding
 */
export class Skill {
    constructor(config = {}) {
        this.id = config.id || `skill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.name = config.name || 'Unnamed Skill';
        
        // Neuro-symbolic grounding
        this.precondition = config.precondition || null;  // Narsese statement
        this.postcondition = config.postcondition || null; // Narsese statement
        this.effect = config.effect || null;  // Expected effect (reward prediction)
        
        // Policy (tensor-logic or MeTTa program)
        this.policy = config.policy || null;
        this.policyType = config.policyType || 'neural'; // neural, metta, hybrid
        
        // Hierarchy
        this.parent = config.parent || null;
        this.children = config.children || [];
        this.level = config.level || 0; // 0 = primitive, higher = abstract
        
        // Learning
        this.successCount = config.successCount || 0;
        this.failureCount = config.failureCount || 0;
        this.totalReward = config.totalReward || 0;
        this.usageCount = config.usageCount || 0;
        
        // Metadata
        this.discoveredAt = config.discoveredAt || Date.now();
        this.lastUsed = config.lastUsed || null;
        this.tags = config.tags || [];
        this.metadata = config.metadata || {};
        
        // Termination condition
        this.terminationCondition = config.terminationCondition || null;
    }

    /**
     * Check if skill is applicable in current state
     */
    isApplicable(state, bridge) {
        if (!this.precondition) return true;
        
        // Convert state to Narsese
        const stateNarsese = bridge?.observationToNarsese(state) || '';
        
        // Check if precondition is satisfied
        return stateNarsese.includes(this.precondition);
    }

    /**
     * Check if skill has achieved its goal
     */
    isTerminated(state, bridge) {
        if (this.terminationCondition) {
            return this.terminationCondition(state);
        }
        
        if (!this.postcondition) return false;
        
        // Convert state to Narsese
        const stateNarsese = bridge?.observationToNarsese(state) || '';
        
        // Check if postcondition is achieved
        return stateNarsese.includes(this.postcondition);
    }

    /**
     * Execute skill policy
     */
    async act(state, options = {}) {
        if (!this.policy) {
            throw new Error(`Skill ${this.name} has no policy`);
        }

        this.lastUsed = Date.now();
        this.usageCount++;

        if (this.policyType === 'neural' && this.policy.selectAction) {
            return await this.policy.selectAction(state, options);
        } else if (this.policyType === 'metta' && this.policy.executeMettaPolicy) {
            return await this.policy.executeMettaPolicy(state, options);
        } else if (typeof this.policy === 'function') {
            return await this.policy(state, options);
        }

        throw new Error(`Unknown policy type: ${this.policyType}`);
    }

    /**
     * Update skill statistics from experience
     */
    update(experience, success) {
        const { reward } = experience;
        
        if (success) {
            this.successCount++;
        } else {
            this.failureCount++;
        }
        
        this.totalReward += reward;
    }

    /**
     * Get skill success rate
     */
    getSuccessRate() {
        const total = this.successCount + this.failureCount;
        return total > 0 ? this.successCount / total : 0.5;
    }

    /**
     * Get average reward
     */
    getAverageReward() {
        return this.usageCount > 0 ? this.totalReward / this.usageCount : 0;
    }

    /**
     * Convert skill to MeTTa representation
     */
    toMetta() {
        const policyRepr = this.policyType === 'metta' 
            ? this.policy.toString()
            : `neural_policy_${this.id}`;

        return `
            (skill ${this.id}
                (name ${this.name})
                (precondition ${this.precondition || 'true'})
                (postcondition ${this.postcondition || 'true'})
                (policy ${policyRepr})
                (level ${this.level})
                (success-rate ${this.getSuccessRate()})
                (avg-reward ${this.getAverageReward()})
            )
        `;
    }

    /**
     * Create skill from MeTTa representation
     */
    static fromMetta(mettaStr, policyMap = {}) {
        // Parse MeTTa skill representation
        const idMatch = mettaStr.match(/skill (\S+)/);
        const nameMatch = mettaStr.match(/\(name (\S+)\)/);
        const preMatch = mettaStr.match(/\(precondition ([^)]+)\)/);
        const postMatch = mettaStr.match(/\(postcondition ([^)]+)\)/);
        const policyMatch = mettaStr.match(/\(policy (\S+)\)/);
        const levelMatch = mettaStr.match(/\(level (\d+)\)/);

        if (!idMatch) return null;

        const policyId = policyMatch?.[1];
        const policy = policyMap[policyId] || null;

        return new Skill({
            id: idMatch[1],
            name: nameMatch?.[1] || idMatch[1],
            precondition: preMatch?.[1] || null,
            postcondition: postMatch?.[1] || null,
            policy,
            policyType: policyId?.includes('neural') ? 'neural' : 'metta',
            level: parseInt(levelMatch?.[1] || '0')
        });
    }

    /**
     * Clone skill
     */
    clone(overrides = {}) {
        return new Skill({
            ...this,
            children: [...this.children],
            tags: [...this.tags],
            metadata: { ...this.metadata },
            ...overrides
        });
    }

    /**
     * Serialize skill
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            precondition: this.precondition,
            postcondition: this.postcondition,
            effect: this.effect,
            policyType: this.policyType,
            level: this.level,
            successCount: this.successCount,
            failureCount: this.failureCount,
            totalReward: this.totalReward,
            usageCount: this.usageCount,
            discoveredAt: this.discoveredAt,
            tags: this.tags,
            metadata: this.metadata
        };
    }

    /**
     * Deserialize skill
     */
    static fromJSON(json, policy = null) {
        return new Skill({
            ...json,
            policy
        });
    }
}

/**
 * Hierarchical Skill System
 * Manages discovery, organization, and composition of skills
 */
export class HierarchicalSkillSystem extends Component {
    constructor(config = {}) {
        super({
            // Discovery settings
            minSupport: config.minSupport ?? 5, // Min occurrences to discover
            similarityThreshold: config.similarityThreshold ?? 0.8,
            noveltyThreshold: config.noveltyThreshold ?? 0.3,
            
            // Hierarchy settings
            maxLevels: config.maxLevels ?? 4,
            primitiveLevel: config.primitiveLevel ?? 0,
            
            // Learning settings
            learningRate: config.learningRate ?? 0.1,
            consolidationInterval: config.consolidationInterval ?? 100,
            
            // Neuro-symbolic integration
            useNarseseGrounding: config.useNarseseGrounding ?? true,
            useMettaRepresentation: config.useMettaRepresentation ?? true,
            
            ...config
        });

        // Skill storage
        this.skills = new Map();
        this.primitiveSkills = new Set();
        this.compositeSkills = new Set();
        
        // Hierarchy
        this.skillHierarchy = new Map(); // parent -> children
        this.skillParents = new Map(); // child -> parent
        
        // Discovery state
        this.experienceBuffer = [];
        this.stateActionClusters = new Map();
        this.discoveryCounter = 0;
        
        // Neuro-symbolic bridge
        this.bridge = null;
        
        // Metrics
        this.metrics = {
            skillsDiscovered: 0,
            skillsConsolidated: 0,
            compositionsCreated: 0
        };
    }

    async onInitialize() {
        // Initialize neuro-symbolic bridge if available
        try {
            const { NeuroSymbolicBridge } = await import('../bridges/NeuroSymbolicBridge.js');
            this.bridge = new NeuroSymbolicBridge();
            await this.bridge.initialize();
        } catch (e) {
            console.warn('Neuro-symbolic bridge not available:', e.message);
            this.bridge = null;
        }

        // Register default primitive skills
        this._registerDefaultPrimitives();

        this.emit('initialized', {
            skills: this.skills.size,
            bridge: !!this.bridge
        });
    }

    _registerDefaultPrimitives() {
        // Register basic movement primitives
        const primitives = [
            { id: 'move_forward', name: 'Move Forward', level: 0 },
            { id: 'move_backward', name: 'Move Backward', level: 0 },
            { id: 'turn_left', name: 'Turn Left', level: 0 },
            { id: 'turn_right', name: 'Turn Right', level: 0 },
            { id: 'grasp', name: 'Grasp Object', level: 0 },
            { id: 'release', name: 'Release Object', level: 0 }
        ];

        for (const prim of primitives) {
            const skill = new Skill({
                ...prim,
                policyType: 'neural',
                policy: null // Will be learned
            });
            
            this.skills.set(skill.id, skill);
            this.primitiveSkills.add(skill.id);
            this.metrics.skillsDiscovered++;
        }
    }

    // =========================================================================
    // Skill Discovery
    // =========================================================================

    /**
     * Discover skills from experience
     */
    async discoverSkills(experiences, options = {}) {
        const { 
            incremental = true,
            consolidate = false 
        } = options;

        // Add experiences to buffer
        if (incremental) {
            this.experienceBuffer.push(...experiences);
        }

        // Cluster state-action pairs
        const clusters = this._clusterExperiences(
            incremental ? experiences : this.experienceBuffer
        );

        // Discover new skills from clusters
        const newSkills = [];
        for (const cluster of clusters) {
            if (cluster.support >= this.config.minSupport) {
                const skill = await this._discoverSkillFromCluster(cluster);
                if (skill && this._isNovelSkill(skill)) {
                    newSkills.push(skill);
                    this.skills.set(skill.id, skill);
                    this.metrics.skillsDiscovered++;
                }
            }
        }

        // Consolidate if needed
        if (consolidate || this.discoveryCounter % this.config.consolidationInterval === 0) {
            await this._consolidateSkills();
        }

        this.discoveryCounter++;

        return newSkills;
    }

    _clusterExperiences(experiences) {
        // Simple clustering based on state similarity
        const clusters = new Map();

        for (const exp of experiences) {
            const { state, action, nextState, reward } = exp;
            
            // Create state-action signature
            const signature = this._createStateActionSignature(state, action);
            
            // Find or create cluster
            let cluster = clusters.get(signature);
            if (!cluster) {
                cluster = {
                    signature,
                    states: [],
                    nextStates: [],
                    actions: [],
                    rewards: [],
                    support: 0
                };
                clusters.set(signature, cluster);
            }

            cluster.states.push(state);
            cluster.nextStates.push(nextState);
            cluster.actions.push(action);
            cluster.rewards.push(reward);
            cluster.support++;
        }

        return Array.from(clusters.values());
    }

    _createStateActionSignature(state, action) {
        // Discretize state for clustering
        const discretized = state.map(v => Math.round(v * 10) / 10);
        return `${discretized.join(',')}_a${action}`;
    }

    async _discoverSkillFromCluster(cluster) {
        // Induce precondition from states
        const precondition = this._inducePrecondition(cluster.states);
        
        // Induce postcondition from next states
        const postcondition = this._inducePostcondition(cluster.nextStates);
        
        // Train policy from actions and rewards
        const policy = await this._trainPolicyFromCluster(cluster);
        
        // Determine hierarchy level
        const level = this._determineSkillLevel(precondition, postcondition);

        return new Skill({
            name: `skill_${Date.now()}`,
            precondition,
            postcondition,
            policy,
            policyType: 'neural',
            level,
            metadata: {
                support: cluster.support,
                avgReward: cluster.rewards.reduce((a, b) => a + b, 0) / cluster.rewards.length
            }
        });
    }

    _inducePrecondition(states) {
        if (!this.bridge || !this.config.useNarseseGrounding) {
            return null;
        }

        // Convert states to Narsese and find commonalities
        const narseseStatements = states.map(s => 
            this.bridge.observationToNarsese(s, { threshold: 0.5 })
        );

        // Find common predicates (simple intersection)
        const predicateCounts = new Map();
        for (const narsese of narseseStatements) {
            const predicates = narsese.match(/<(\S+) --> observed>/g) || [];
            for (const pred of predicates) {
                predicateCounts.set(pred, (predicateCounts.get(pred) || 0) + 1);
            }
        }

        // Keep predicates that appear in >50% of states
        const threshold = states.length * 0.5;
        const commonPredicates = Array.from(predicateCounts.entries())
            .filter(([_, count]) => count >= threshold)
            .map(([pred, _]) => pred);

        return commonPredicates.join(' && ') || null;
    }

    _inducePostcondition(nextStates) {
        // Similar to precondition induction
        return this._inducePrecondition(nextStates);
    }

    async _trainPolicyFromCluster(cluster) {
        // Create and train a small policy network
        const inputDim = cluster.states[0]?.length || 64;
        const outputDim = Math.max(...cluster.actions.map(a => typeof a === 'number' ? a : 0)) + 1;

        const policy = new TensorLogicPolicy({
            inputDim,
            hiddenDim: 32,
            outputDim,
            numLayers: 1,
            learningRate: 0.01
        });

        await policy.initialize();

        // Train on cluster data
        for (let i = 0; i < cluster.states.length; i++) {
            const exp = {
                state: cluster.states[i],
                action: cluster.actions[i],
                reward: cluster.rewards[i],
                nextState: cluster.nextStates[i],
                done: false
            };

            await policy.update(exp, {
                advantages: [cluster.rewards[i]]
            });
        }

        return policy;
    }

    _determineSkillLevel(precondition, postcondition) {
        // Simple heuristic: more complex conditions = higher level
        let complexity = 0;
        
        if (precondition) {
            complexity += precondition.split('&&').length;
        }
        if (postcondition) {
            complexity += postcondition.split('&&').length;
        }

        if (complexity <= 1) return 0; // Primitive
        if (complexity <= 3) return 1; // Simple composite
        if (complexity <= 5) return 2; // Complex composite
        return 3; // Abstract
    }

    _isNovelSkill(skill) {
        // Check similarity to existing skills
        for (const existing of this.skills.values()) {
            const similarity = this._computeSkillSimilarity(skill, existing);
            if (similarity >= this.config.similarityThreshold) {
                return false;
            }
        }
        return true;
    }

    _computeSkillSimilarity(skill1, skill2) {
        // Compare preconditions and postconditions
        let similarity = 0;
        let comparisons = 0;

        if (skill1.precondition && skill2.precondition) {
            similarity += this._stringSimilarity(skill1.precondition, skill2.precondition);
            comparisons++;
        }

        if (skill1.postcondition && skill2.postcondition) {
            similarity += this._stringSimilarity(skill1.postcondition, skill2.postcondition);
            comparisons++;
        }

        return comparisons > 0 ? similarity / comparisons : 0;
    }

    _stringSimilarity(s1, s2) {
        // Simple Jaccard similarity
        const set1 = new Set(s1.split(' '));
        const set2 = new Set(s2.split(' '));
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
    }

    // =========================================================================
    // Skill Composition
    // =========================================================================

    /**
     * Compose skills to achieve a goal
     */
    async composeSkills(goal, options = {}) {
        const { 
            maxDepth = 5,
            usePlanning = true 
        } = options;

        if (usePlanning && this.bridge?.senarsBridge) {
            // Use NARS planning to compose skills
            return await this._planWithNARS(goal, maxDepth);
        }

        // Fallback: greedy composition
        return await this._greedyComposition(goal, maxDepth);
    }

    async _planWithNARS(goal, maxDepth) {
        if (!this.bridge) return null;

        // Convert goal to Narsese
        const goalNarsese = `<${goal} --> goal>!`;
        
        // Ask NARS to plan
        const plan = await this.bridge.achieveGoal(goalNarsese, {
            cycles: 100
        });

        if (!plan || !plan.executedOperations) return null;

        // Map operations to skills
        const skillSequence = [];
        for (const op of plan.executedOperations) {
            const skill = this._findSkillForOperation(op);
            if (skill) {
                skillSequence.push(skill);
            }
        }

        if (skillSequence.length > 0) {
            return this._createCompositeSkill(skillSequence, goal);
        }

        return null;
    }

    async _greedyComposition(goal, maxDepth) {
        // Find skills that achieve goal
        const goalSkills = Array.from(this.skills.values()).filter(s => 
            s.postcondition?.includes(goal)
        );

        if (goalSkills.length === 0) return null;

        // Sort by success rate
        goalSkills.sort((a, b) => b.getSuccessRate() - a.getSuccessRate());

        // Take best skill
        const bestSkill = goalSkills[0];

        // Recursively find skills to achieve precondition
        if (bestSkill.precondition && maxDepth > 0) {
            const preSkills = await this._greedyComposition(
                bestSkill.precondition.split('&&')[0].trim(),
                maxDepth - 1
            );

            if (preSkills) {
                return this._createCompositeSkill(
                    Array.isArray(preSkills) ? [...preSkills, bestSkill] : [preSkills, bestSkill],
                    goal
                );
            }
        }

        return bestSkill;
    }

    _findSkillForOperation(operation) {
        // Map NARS operations to skills
        const opStr = operation.toString();
        
        for (const skill of this.skills.values()) {
            if (skill.id.includes(opStr) || skill.name.toLowerCase().includes(opStr)) {
                return skill;
            }
        }

        // Fallback: find primitive skill
        const primitiveId = opStr.replace(/[^a-z_]/g, '');
        return this.skills.get(primitiveId) || null;
    }

    _createCompositeSkill(skillSequence, goal) {
        const composite = new Skill({
            name: `composite_${goal}`,
            precondition: skillSequence[0]?.precondition,
            postcondition: skillSequence[skillSequence.length - 1]?.postcondition,
            policy: async (state, options) => {
                // Execute skill sequence
                let currentState = state;
                let lastAction = null;

                for (const skill of skillSequence) {
                    const result = await skill.act(currentState, options);
                    lastAction = result.action;
                    // In real execution, currentState would be updated from environment
                }

                return { action: lastAction };
            },
            policyType: 'hybrid',
            level: Math.max(...skillSequence.map(s => s.level)) + 1,
            children: skillSequence.map(s => s.id),
            metadata: {
                sequence: skillSequence.map(s => s.id),
                goal
            }
        });

        // Update hierarchy
        for (const skill of skillSequence) {
            skill.parent = composite.id;
            this.skillParents.set(skill.id, composite.id);
        }

        this.skillHierarchy.set(composite.id, skillSequence.map(s => s.id));
        this.compositeSkills.add(composite.id);
        this.metrics.compositionsCreated++;

        return composite;
    }

    // =========================================================================
    // Skill Consolidation
    // =========================================================================

    async _consolidateSkills() {
        // Remove low-performing skills
        for (const [id, skill] of this.skills.entries()) {
            if (skill.usageCount > 0 && skill.getSuccessRate() < 0.3) {
                this.skills.delete(id);
                this.primitiveSkills.delete(id);
                this.compositeSkills.delete(id);
            }
        }

        // Merge similar skills
        const toMerge = [];
        const skillArray = Array.from(this.skills.values());
        
        for (let i = 0; i < skillArray.length; i++) {
            for (let j = i + 1; j < skillArray.length; j++) {
                const sim = this._computeSkillSimilarity(skillArray[i], skillArray[j]);
                if (sim > 0.9) {
                    toMerge.push([skillArray[i], skillArray[j]]);
                }
            }
        }

        for (const [s1, s2] of toMerge) {
            this._mergeSkills(s1, s2);
        }

        this.metrics.skillsConsolidated++;
    }

    _mergeSkills(skill1, skill2) {
        // Keep the one with higher success rate
        const keep = skill1.getSuccessRate() >= skill2.getSuccessRate() ? skill1 : skill2;
        const remove = skill1 === keep ? skill2 : skill1;

        // Merge statistics
        keep.successCount += remove.successCount;
        keep.failureCount += remove.failureCount;
        keep.totalReward += remove.totalReward;
        keep.usageCount += remove.usageCount;

        // Remove merged skill
        this.skills.delete(remove.id);
        this.primitiveSkills.delete(remove.id);
        this.compositeSkills.delete(remove.id);
    }

    // =========================================================================
    // Query Interface
    // =========================================================================

    /**
     * Get skill by ID
     */
    getSkill(id) {
        return this.skills.get(id);
    }

    /**
     * Get all skills at a level
     */
    getSkillsAtLevel(level) {
        return Array.from(this.skills.values()).filter(s => s.level === level);
    }

    /**
     * Get primitive skills
     */
    getPrimitiveSkills() {
        return Array.from(this.primitiveSkills).map(id => this.skills.get(id));
    }

    /**
     * Get composite skills
     */
    getCompositeSkills() {
        return Array.from(this.compositeSkills).map(id => this.skills.get(id));
    }

    /**
     * Get skill hierarchy
     */
    getHierarchy() {
        const hierarchy = {};
        for (const [parent, children] of this.skillHierarchy) {
            hierarchy[parent] = children;
        }
        return hierarchy;
    }

    /**
     * Get skills applicable to state
     */
    getApplicableSkills(state) {
        const applicable = [];
        for (const skill of this.skills.values()) {
            if (skill.isApplicable(state, this.bridge)) {
                applicable.push(skill);
            }
        }
        return applicable.sort((a, b) => b.getSuccessRate() - a.getSuccessRate());
    }

    /**
     * Export skills to MeTTa format
     */
    exportToMetta() {
        let metta = '';
        for (const skill of this.skills.values()) {
            metta += skill.toMetta() + '\n';
        }
        return metta;
    }

    /**
     * Import skills from MeTTa format
     */
    importFromMetta(mettaStr, policyMap = {}) {
        const skills = [];
        const skillBlocks = mettaStr.split('(skill ').slice(1);

        for (const block of skillBlocks) {
            const skill = Skill.fromMetta('(skill ' + block, policyMap);
            if (skill) {
                this.skills.set(skill.id, skill);
                if (skill.level === 0) {
                    this.primitiveSkills.add(skill.id);
                } else {
                    this.compositeSkills.add(skill.id);
                }
                skills.push(skill);
            }
        }

        return skills;
    }

    /**
     * Get system state
     */
    getState() {
        return {
            skills: Array.from(this.skills.values()).map(s => s.toJSON()),
            hierarchy: this.getHierarchy(),
            metrics: { ...this.metrics },
            experienceBufferSize: this.experienceBuffer.length
        };
    }

    async onShutdown() {
        await this.bridge?.shutdown();
        this.skills.clear();
        this.experienceBuffer = [];
    }
}

/**
 * Factory for creating specialized skill systems
 */
export class SkillSystemFactory {
    /**
     * Create skill system for navigation tasks
     */
    static createNavigation(config = {}) {
        return new HierarchicalSkillSystem({
            ...config,
            maxLevels: 3,
            useNarseseGrounding: true
        });
    }

    /**
     * Create skill system for manipulation tasks
     */
    static createManipulation(config = {}) {
        return new HierarchicalSkillSystem({
            ...config,
            maxLevels: 4,
            minSupport: 3,
            useNarseseGrounding: true,
            useMettaRepresentation: true
        });
    }

    /**
     * Create minimal skill system
     */
    static createMinimal(config = {}) {
        return new HierarchicalSkillSystem({
            ...config,
            maxLevels: 2,
            minSupport: 10,
            useNarseseGrounding: false,
            useMettaRepresentation: false
        });
    }
}
