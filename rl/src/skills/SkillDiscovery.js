import { Component } from '../composable/Component.js';
import { SymbolicTensor } from '@senars/tensor';
import { TensorLogicPolicy } from '../policies/TensorLogicPolicy.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    minSupport: 5,
    similarityThreshold: 0.8,
    noveltyThreshold: 0.3,
    maxLevels: 4,
    learningRate: 0.1,
    consolidationInterval: 100,
    useNarseseGrounding: true,
    useMettaRepresentation: true,
    defaultHiddenDim: 32,
    defaultNumLayers: 1,
    policyLearningRate: 0.01,
    predicateThreshold: 0.5,
    mergeSimilarityThreshold: 0.9,
    lowSuccessRateThreshold: 0.3,
    maxCompositionDepth: 5
};

const PRIMITIVE_SKILLS = [
    { id: 'move_forward', name: 'Move Forward' },
    { id: 'move_backward', name: 'Move Backward' },
    { id: 'turn_left', name: 'Turn Left' },
    { id: 'turn_right', name: 'Turn Right' },
    { id: 'grasp', name: 'Grasp Object' },
    { id: 'release', name: 'Release Object' }
];

const SkillUtils = {
    generateId() {
        return `skill_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    },

    extractMettaField(mettaStr, pattern) {
        return mettaStr.match(pattern)?.[1];
    },

    computeStringSimilarity(s1, s2) {
        const set1 = new Set(s1.split(' '));
        const set2 = new Set(s2.split(' '));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return union.size > 0 ? intersection.size / union.size : 0;
    },

    determineSkillLevel(precondition, postcondition) {
        const complexity = [precondition, postcondition]
            .filter(Boolean)
            .reduce((sum, cond) => sum + cond.split('&&').length, 0);

        return complexity <= 1 ? 0 : complexity <= 3 ? 1 : complexity <= 5 ? 2 : 3;
    },

    roundState(state, decimals = 1) {
        const factor = Math.pow(10, decimals);
        return state.map(v => Math.round(v * factor) / factor);
    }
};

export class Skill {
    constructor(config = {}) {
        this.id = config.id ?? SkillUtils.generateId();
        this.name = config.name ?? 'Unnamed Skill';
        this.precondition = config.precondition ?? null;
        this.postcondition = config.postcondition ?? null;
        this.effect = config.effect ?? null;
        this.policy = config.policy ?? null;
        this.policyType = config.policyType ?? 'neural';
        this.parent = config.parent ?? null;
        this.children = config.children ?? [];
        this.level = config.level ?? 0;
        this.successCount = config.successCount ?? 0;
        this.failureCount = config.failureCount ?? 0;
        this.totalReward = config.totalReward ?? 0;
        this.usageCount = config.usageCount ?? 0;
        this.discoveredAt = config.discoveredAt ?? Date.now();
        this.lastUsed = config.lastUsed ?? null;
        this.tags = config.tags ?? [];
        this.metadata = config.metadata ?? {};
        this.terminationCondition = config.terminationCondition ?? null;
    }

    isApplicable(state, bridge) {
        if (!this.precondition) return true;
        const stateNarsese = bridge?.observationToNarsese(state) ?? '';
        return stateNarsese.includes(this.precondition);
    }

    isTerminated(state, bridge) {
        return this.terminationCondition?.(state) ?? (this.postcondition ? (bridge?.observationToNarsese(state) ?? '').includes(this.postcondition) : false);
    }

    async act(state, options = {}) {
        if (!this.policy) {
            throw new Error(`Skill ${this.name} has no policy`);
        }

        this.lastUsed = Date.now();
        this.usageCount++;

        const { policy, policyType } = this;

        if (policyType === 'neural' && policy.selectAction) {
            return policy.selectAction(state, options);
        }

        if (policyType === 'metta' && policy.executeMettaPolicy) {
            return policy.executeMettaPolicy(state, options);
        }

        if (typeof policy === 'function') {
            return policy(state, options);
        }

        throw new Error(`Unknown policy type: ${policyType}`);
    }

    update(experience, success) {
        this.successCount += success ? 1 : 0;
        this.failureCount += success ? 0 : 1;
        this.totalReward += experience.reward ?? 0;
    }

    getSuccessRate() {
        const total = this.successCount + this.failureCount;
        return total > 0 ? this.successCount / total : 0.5;
    }

    getAverageReward() {
        return this.usageCount > 0 ? this.totalReward / this.usageCount : 0;
    }

    toMetta() {
        return `(skill ${this.id} (name ${this.name}) (precondition ${this.precondition ?? 'true'}) (postcondition ${this.postcondition ?? 'true'}) (policy ${this.policyType === 'metta' ? this.policy.toString() : `neural_policy_${this.id}`}) (level ${this.level}) (success-rate ${this.getSuccessRate()}) (avg-reward ${this.getAverageReward()}))`;
    }

    static fromMetta(mettaStr, policyMap = {}) {
        const idMatch = mettaStr.match(/skill (\S+)/);
        if (!idMatch) return null;

        const extract = (pattern) => SkillUtils.extractMettaField(mettaStr, pattern);

        return new Skill({
            id: idMatch[1],
            name: extract(/\(name (\S+)\)/) ?? idMatch[1],
            precondition: extract(/\(precondition ([^)]+)\)/),
            postcondition: extract(/\(postcondition ([^)]+)\)/),
            policy: policyMap[extract(/\(policy (\S+)\)/)] ?? null,
            policyType: extract(/\(policy (\S+)\)/)?.includes('neural') ? 'neural' : 'metta',
            level: parseInt(extract(/\(level (\d+)\)/) ?? '0')
        });
    }

    clone(overrides = {}) {
        return new Skill({ ...this, children: [...this.children], tags: [...this.tags], metadata: { ...this.metadata }, ...overrides });
    }

    toJSON() {
        return {
            id: this.id, name: this.name, precondition: this.precondition, postcondition: this.postcondition,
            effect: this.effect, policyType: this.policyType, level: this.level,
            successCount: this.successCount, failureCount: this.failureCount, totalReward: this.totalReward,
            usageCount: this.usageCount, discoveredAt: this.discoveredAt, tags: this.tags, metadata: this.metadata
        };
    }

    static fromJSON(json, policy = null) {
        return new Skill({ ...json, policy });
    }
}

const ClusteringUtils = {
    clusterExperiences(experiences) {
        const clusters = new Map();

        experiences.forEach(exp => {
            const { state, action, nextState, reward } = exp;
            const signature = `${SkillUtils.roundState(state).join(',')}_a${action}`;

            let cluster = clusters.get(signature);
            if (!cluster) {
                cluster = { signature, states: [], nextStates: [], actions: [], rewards: [], support: 0 };
                clusters.set(signature, cluster);
            }

            cluster.states.push(state);
            cluster.nextStates.push(nextState);
            cluster.actions.push(action);
            cluster.rewards.push(reward);
            cluster.support++;
        });

        return Array.from(clusters.values());
    },

    computeAverageReward(rewards) {
        return rewards.length > 0 ? rewards.reduce((a, b) => a + b, 0) / rewards.length : 0;
    }
};

const SimilarityComputer = {
    computeSkillSimilarity(skill1, skill2) {
        const similarities = [];

        if (skill1.precondition && skill2.precondition) {
            similarities.push(SkillUtils.computeStringSimilarity(skill1.precondition, skill2.precondition));
        }

        if (skill1.postcondition && skill2.postcondition) {
            similarities.push(SkillUtils.computeStringSimilarity(skill1.postcondition, skill2.postcondition));
        }

        return similarities.length > 0 ? similarities.reduce((a, b) => a + b, 0) / similarities.length : 0;
    },

    findSimilarSkills(skill, skills, threshold) {
        return skills.filter(existing => this.computeSkillSimilarity(skill, existing) >= threshold);
    }
};

export class SkillDiscovery extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));

        this.skills = new Map();
        this.primitiveSkills = new Set();
        this.compositeSkills = new Set();
        this.skillHierarchy = new Map();
        this.skillParents = new Map();
        this.experienceBuffer = [];
        this.stateActionClusters = new Map();
        this.discoveryCounter = 0;
        this.bridge = null;
        this.metrics = { skillsDiscovered: 0, skillsConsolidated: 0, compositionsCreated: 0 };
    }

    async onInitialize() {
        try {
            const { NeuroSymbolicBridge } = await import('../bridges/NeuroSymbolicBridge.js');
            this.bridge = new NeuroSymbolicBridge();
            await this.bridge.initialize();
        } catch {
            this.bridge = null;
        }

        this._registerDefaultPrimitives();
        this.emit('initialized', { skills: this.skills.size, bridge: !!this.bridge });
    }

    _registerDefaultPrimitives() {
        PRIMITIVE_SKILLS.forEach(prim => {
            const skill = new Skill({ ...prim, policyType: 'neural', policy: null, level: 0 });
            this.skills.set(skill.id, skill);
            this.primitiveSkills.add(skill.id);
            this.metrics.skillsDiscovered++;
        });
    }

    async discoverSkills(experiences, options = {}) {
        const { incremental = true, consolidate = false } = options;

        if (incremental) {
            this.experienceBuffer.push(...experiences);
        }

        const clusters = ClusteringUtils.clusterExperiences(incremental ? experiences : this.experienceBuffer);
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

        if (consolidate || this.discoveryCounter % this.config.consolidationInterval === 0) {
            await this._consolidateSkills();
        }

        this.discoveryCounter++;
        return newSkills;
    }

    async _discoverSkillFromCluster(cluster) {
        const precondition = this._inducePrecondition(cluster.states);
        const postcondition = this._inducePrecondition(cluster.nextStates);
        const policy = await this._trainPolicyFromCluster(cluster);
        const level = SkillUtils.determineSkillLevel(precondition, postcondition);

        return new Skill({
            name: `skill_${Date.now()}`,
            precondition,
            postcondition,
            policy,
            policyType: 'neural',
            level,
            metadata: {
                support: cluster.support,
                avgReward: ClusteringUtils.computeAverageReward(cluster.rewards)
            }
        });
    }

    _inducePrecondition(states) {
        if (!this.bridge || !this.config.useNarseseGrounding) return null;

        const predicateCounts = new Map();
        states.forEach(state => {
            const narsese = this.bridge.observationToNarsese(state, { threshold: this.config.predicateThreshold });
            const predicates = narsese.match(/<(\S+) --> observed>/g) ?? [];
            predicates.forEach(pred => {
                predicateCounts.set(pred, (predicateCounts.get(pred) ?? 0) + 1);
            });
        });

        const threshold = states.length * this.config.predicateThreshold;
        const commonPredicates = Array.from(predicateCounts.entries())
            .filter(([_, count]) => count >= threshold)
            .map(([pred, _]) => pred);

        return commonPredicates.join(' && ') || null;
    }

    async _trainPolicyFromCluster(cluster) {
        const inputDim = cluster.states[0]?.length ?? this.config.defaultHiddenDim;
        const outputDim = Math.max(...cluster.actions.map(a => typeof a === 'number' ? a : 0)) + 1;

        const policy = new TensorLogicPolicy({
            inputDim,
            hiddenDim: this.config.defaultHiddenDim,
            outputDim,
            numLayers: this.config.defaultNumLayers,
            learningRate: this.config.policyLearningRate
        });
        await policy.initialize();

        for (let i = 0; i < cluster.states.length; i++) {
            await policy.update({
                state: cluster.states[i],
                action: cluster.actions[i],
                reward: cluster.rewards[i],
                nextState: cluster.nextStates[i],
                done: false
            }, { advantages: [cluster.rewards[i]] });
        }

        return policy;
    }

    _isNovelSkill(skill) {
        return SimilarityComputer.findSimilarSkills(skill, this.skills.values(), this.config.similarityThreshold).length === 0;
    }

    async _consolidateSkills() {
        const skillArray = Array.from(this.skills.values());

        for (const [id, skill] of this.skills.entries()) {
            if (skill.usageCount > 0 && skill.getSuccessRate() < this.config.lowSuccessRateThreshold) {
                this.skills.delete(id);
                this.primitiveSkills.delete(id);
                this.compositeSkills.delete(id);
            }
        }

        const toMerge = [];
        for (let i = 0; i < skillArray.length; i++) {
            for (let j = i + 1; j < skillArray.length; j++) {
                if (SimilarityComputer.computeSkillSimilarity(skillArray[i], skillArray[j]) > this.config.mergeSimilarityThreshold) {
                    toMerge.push([skillArray[i], skillArray[j]]);
                }
            }
        }

        toMerge.forEach(([s1, s2]) => this._mergeSkills(s1, s2));
        this.metrics.skillsConsolidated++;
    }

    _mergeSkills(skill1, skill2) {
        const keep = skill1.getSuccessRate() >= skill2.getSuccessRate() ? skill1 : skill2;
        const remove = skill1 === keep ? skill2 : skill1;

        keep.successCount += remove.successCount;
        keep.failureCount += remove.failureCount;
        keep.totalReward += remove.totalReward;
        keep.usageCount += remove.usageCount;

        [this.skills, this.primitiveSkills, this.compositeSkills].forEach(collection => collection.delete(remove.id));
    }

    async composeSkills(goal, options = {}) {
        const { maxDepth = this.config.maxCompositionDepth, usePlanning = true } = options;

        if (usePlanning && this.bridge?.senarsBridge) {
            return this._planWithNARS(goal, maxDepth);
        }

        return this._greedyComposition(goal, maxDepth);
    }

    async _planWithNARS(goal, maxDepth) {
        if (!this.bridge) return null;

        const goalNarsese = `<${goal} --> goal>!`;
        const plan = await this.bridge.achieveGoal(goalNarsese, { cycles: 100 });

        if (!plan?.executedOperations) return null;

        const skillSequence = plan.executedOperations.map(op => this._findSkillForOperation(op)).filter(Boolean);
        return skillSequence.length > 0 ? this._createCompositeSkill(skillSequence, goal) : null;
    }

    async _greedyComposition(goal, maxDepth) {
        const goalSkills = Array.from(this.skills.values()).filter(s => s.postcondition?.includes(goal));
        if (goalSkills.length === 0) return null;

        goalSkills.sort((a, b) => b.getSuccessRate() - a.getSuccessRate());
        const bestSkill = goalSkills[0];

        if (bestSkill.precondition && maxDepth > 0) {
            const preSkills = await this._greedyComposition(bestSkill.precondition.split('&&')[0].trim(), maxDepth - 1);
            if (preSkills) {
                return this._createCompositeSkill(Array.isArray(preSkills) ? [...preSkills, bestSkill] : [preSkills, bestSkill], goal);
            }
        }

        return bestSkill;
    }

    _findSkillForOperation(operation) {
        const opStr = operation.toString();
        for (const skill of this.skills.values()) {
            if (skill.id.includes(opStr) || skill.name.toLowerCase().includes(opStr)) {
                return skill;
            }
        }
        return this.skills.get(opStr.replace(/[^a-z_]/g, '')) ?? null;
    }

    _createCompositeSkill(skillSequence, goal) {
        const composite = new Skill({
            name: `composite_${goal}`,
            precondition: skillSequence[0]?.precondition,
            postcondition: skillSequence[skillSequence.length - 1]?.postcondition,
            policy: async (state, options) => {
                let lastAction = null;
                for (const skill of skillSequence) {
                    const result = await skill.act(state, options);
                    lastAction = result.action;
                }
                return { action: lastAction };
            },
            policyType: 'hybrid',
            level: Math.max(...skillSequence.map(s => s.level)) + 1,
            children: skillSequence.map(s => s.id),
            metadata: { sequence: skillSequence.map(s => s.id), goal }
        });

        skillSequence.forEach(skill => {
            skill.parent = composite.id;
            this.skillParents.set(skill.id, composite.id);
        });

        this.skillHierarchy.set(composite.id, skillSequence.map(s => s.id));
        this.compositeSkills.add(composite.id);
        this.metrics.compositionsCreated++;

        return composite;
    }

    getSkill(id) {
        return this.skills.get(id);
    }

    getSkillsAtLevel(level) {
        return Array.from(this.skills.values()).filter(s => s.level === level);
    }

    getPrimitiveSkills() {
        return Array.from(this.primitiveSkills).map(id => this.skills.get(id));
    }

    getCompositeSkills() {
        return Array.from(this.compositeSkills).map(id => this.skills.get(id));
    }

    getHierarchy() {
        return Object.fromEntries(this.skillHierarchy);
    }

    getApplicableSkills(state) {
        return Array.from(this.skills.values())
            .filter(s => s.isApplicable(state, this.bridge))
            .sort((a, b) => b.getSuccessRate() - a.getSuccessRate());
    }

    exportToMetta() {
        return Array.from(this.skills.values()).map(s => s.toMetta()).join('\n');
    }

    importFromMetta(mettaStr, policyMap = {}) {
        const skills = [];
        const skillBlocks = mettaStr.split('(skill ').slice(1);

        for (const block of skillBlocks) {
            const skill = Skill.fromMetta('(skill ' + block, policyMap);
            if (skill) {
                this.skills.set(skill.id, skill);
                (skill.level === 0 ? this.primitiveSkills : this.compositeSkills).add(skill.id);
                skills.push(skill);
            }
        }

        return skills;
    }

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

    static create(config = {}) {
        return new SkillDiscovery(config);
    }

    static createNavigation(config = {}) {
        return new SkillDiscovery({ ...config, maxLevels: 3, useNarseseGrounding: true });
    }

    static createManipulation(config = {}) {
        return new SkillDiscovery({ ...config, maxLevels: 4, minSupport: 3, useNarseseGrounding: true, useMettaRepresentation: true });
    }

    static createMinimal(config = {}) {
        return new SkillDiscovery({ ...config, maxLevels: 2, minSupport: 10, useNarseseGrounding: false, useMettaRepresentation: false });
    }
}
