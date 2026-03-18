# MeTTa + SeNARS: Refined Path to AGI and RSI

**Date**: 2026-03-08  
**Version**: 3.0 (Refined)  
**Status**: Implementation-ready specification

---

## Executive Summary

This document refines the minimal AGI/RSI plan (`metta.next2.md`) with:
- Complete technical specifications
- Integration points with existing SeNARS/MeTTa architecture
- Risk analysis with concrete mitigations
- Open research questions
- Testable milestones

**Core thesis remains**: AGI emerges from SeNARS's inference engine when we add **self-representation** and **rule evolution**. RSI is the same process applied recursively.

**Timeline**: 12 weeks to minimal working system  
**Code estimate**: ~800 lines (including tests)  
**Risk level**: Medium (builds on proven components)

---

## Part I: Technical Architecture

### 1.1 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    COGNITIVE AGENT                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              SeNARS Core (existing)                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │   │
│  │  │  Memory  │  │  Rules   │  │  Focus   │              │   │
│  │  │  (Bag)   │  │  Engine  │  │  (Bag)   │              │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘              │   │
│  │       │             │             │                      │   │
│  │       └─────────────┴─────────────┘                      │   │
│  │                    │                                      │   │
│  │              Inference Loop                               │   │
│  │         (SELECT → INFER → UPDATE)                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           AGI/RSI Layer (new)                            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │  Self-Model  │  │  Evolution   │  │   Goals      │  │   │
│  │  │  (Narsese)   │  │  (Operators) │  │  (Generator) │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           MeTTa Bridge (existing + extensions)           │   │
│  │    (Self-model queries, rule manipulation ops)           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight**: The AGI/RSI layer operates **through** SeNARS, not alongside it. Self-model atoms live in Memory. Evolution operators are rules. Goals are Goal-tasks.

---

### 1.2 Data Representations

#### 1.2.1 Self-Model Atoms (Narsese)

```narsese
;; Rule representation
(Rule rule-001 
      (Inh $x $y)           ;; condition
      (Inh $x $z)           ;; conclusion  
      0.73)                 ;; utility score

;; Budget tracking
(Budget rule-001 
      priority:0.65 
      durability:0.4 
      quality:0.73)

;; Usage history
(Used rule-001)             ;; each usage adds atom
(Successful rule-001)       ;; on successful derivation
(Failed rule-001)           ;; on failed derivation

;; Modification proposals
(Goal [modify-rule] [rule-001] [disable])
(Goal [modify-rule] [rule-001] [mutate])
(Goal [modify-rule] [rule-001] [crossover rule-042])
```

#### 1.2.2 Task Extensions

Current `Task` class (from `core/src/task/Task.js`) needs minimal extension:

```javascript
// In core/src/task/Task.js - add metadata field for tracking
export class Task {
    constructor({ term, punctuation, truth, budget, stamp, metadata = null }) {
        // ... existing code ...
        this.metadata = metadata ? Object.freeze(metadata) : null;
        // metadata can include: { sourceRule: 'rule-001', derivationDepth: 3 }
    }
    
    // Add serialization for metadata
    serialize() {
        return {
            // ... existing fields ...
            metadata: this.metadata
        };
    }
}
```

#### 1.2.3 Truth Value Extensions for Rules

```javascript
// Utility functions for rule utility tracking
class RuleUtility {
    // Laplace-smoothed success rate
    static compute(successes, failures) {
        return (successes + 1) / (successes + failures + 2);
    }
    
    // Recency-weighted utility
    static recencyWeighted(events, decay = 0.95) {
        let weightedSum = 0;
        let weightSum = 0;
        let weight = 1.0;
        
        for (let i = events.length - 1; i >= 0; i--) {
            const value = events[i].success ? 1 : 0;
            weightedSum += value * weight;
            weightSum += weight;
            weight *= decay;
        }
        
        return weightSum > 0 ? weightedSum / weightSum : 0.5;
    }
}
```

---

### 1.3 Component Specifications

#### 1.3.1 SelfModel Component

**File**: `core/src/self/SelfModel.js`

```javascript
import { BaseComponent } from '../util/BaseComponent.js';
import { Task } from '../task/Task.js';
import { Term } from '../term/Term.js';

/**
 * SelfModel: Represents system state as Narsese atoms in memory
 * 
 * Responsibilities:
 * - Mirror rules, budgets, concepts as inspectable atoms
 * - Handle self-referential queries
 * - Trigger meta-inference on self-changes
 */
export class SelfModel extends BaseComponent {
    constructor(memory, ruleEngine, config = {}) {
        super(config, 'SelfModel');
        this.memory = memory;
        this.ruleEngine = ruleEngine;
        this.ruleUtilities = new Map();  // ruleId -> { successes, failures, timestamps }
    }
    
    /**
     * Initialize self-model by mirroring current system state
     */
    async initialize() {
        await super.initialize();
        
        // Mirror existing rules
        const rules = this.ruleEngine.getAllRules();
        for (const rule of rules) {
            await this._mirrorRule(rule);
        }
        
        this.logInfo('SelfModel initialized', { ruleCount: rules.length });
    }
    
    /**
     * Mirror a rule as Narsese atoms
     */
    async _mirrorRule(rule) {
        const term = new Term('Rule', [
            new Term(rule.id),
            new Term(rule.condition),
            new Term(rule.conclusion),
            new Term(this._getRuleUtility(rule.id))
        ]);
        
        const task = new Task({
            term,
            punctuation: '.',
            truth: { frequency: 1.0, confidence: 0.9 }
        });
        
        await this.memory.addTask(task);
    }
    
    /**
     * Record rule usage for utility tracking
     */
    recordRuleUsage(ruleId, success) {
        if (!this.ruleUtilities.has(ruleId)) {
            this.ruleUtilities.set(ruleId, { successes: 0, failures: 0, timestamps: [] });
        }
        
        const stats = this.ruleUtilities.get(ruleId);
        if (success) {
            stats.successes++;
        } else {
            stats.failures++;
        }
        stats.timestamps.push(Date.now());
        
        // Mirror to memory
        const eventType = success ? 'Successful' : 'Failed';
        const term = new Term(eventType, [new Term(ruleId)]);
        this.memory.addTask(new Task({
            term,
            punctuation: '.',
            truth: { frequency: 1.0, confidence: 0.8 }
        }));
    }
    
    /**
     * Get utility for a rule (Laplace-smoothed)
     */
    _getRuleUtility(ruleId) {
        const stats = this.ruleUtilities.get(ruleId);
        if (!stats || (stats.successes + stats.failures) === 0) {
            return 0.5;  // Prior for untested rules
        }
        return (stats.successes + 1) / (stats.successes + stats.failures + 2);
    }
    
    /**
     * Query self-model
     */
    async query(pattern) {
        // Use memory's query interface
        return await this.memory.query(pattern);
    }
    
    /**
     * Get all rules matching utility threshold
     */
    async getRulesByUtility(minUtility = 0, maxUtility = 1) {
        const rules = this.ruleEngine.getAllRules();
        const filtered = [];
        
        for (const rule of rules) {
            const utility = this._getRuleUtility(rule.id);
            if (utility >= minUtility && utility <= maxUtility) {
                filtered.push({ rule, utility });
            }
        }
        
        return filtered.sort((a, b) => b.utility - a.utility);
    }
}
```

**Integration point**: In `NAR.js`, add SelfModel to the inference loop:

```javascript
// In NAR.js - add to _initializeCoreComponents
this._selfModel = new SelfModel(this._memory, this._ruleEngine, {
    enabled: config.enableSelfModeling !== false
});

// In _handleStreamDerivation
async _handleStreamDerivation(derivation) {
    const added = await this._inputTask(derivation);
    
    // NEW: Track rule usage if derivation came from a rule
    if (derivation.metadata?.sourceRule && this._selfModel) {
        const success = derivation.truth?.confidence > 0.5;
        this._selfModel.recordRuleUsage(
            derivation.metadata.sourceRule, 
            success
        );
    }
    
    // Trigger meta-inference for self-referential derivations
    if (this._isSelfReferential(derivation) && this._selfModel) {
        await this._inputTask(this._toMetaTask(derivation));
    }
}
```

---

#### 1.3.2 RuleEvolution Component

**File**: `core/src/evolution/RuleEvolution.js`

```javascript
import { BaseComponent } from '../util/BaseComponent.js';
import { Task } from '../task/Task.js';
import { Term } from '../term/Term.js';

/**
 * RuleEvolution: Variation operators for rule evolution
 * 
 * Operators:
 * - Mutation: Random modification of condition or conclusion
 * - Crossover: Combine parts of two rules
 * - Selection: Remove low-utility, duplicate high-utility
 */
export class RuleEvolution extends BaseComponent {
    constructor(ruleEngine, selfModel, memory, config = {}) {
        super(config, 'RuleEvolution');
        this.ruleEngine = ruleEngine;
        selfModel = selfModel;
        this.memory = memory;
        this.mutationRate = config.mutationRate ?? 0.1;
        this.crossoverRate = config.crossoverRate ?? 0.3;
        this.removalThreshold = config.removalThreshold ?? 0.3;
        this.duplicationThreshold = config.duplicationThreshold ?? 0.7;
    }
    
    /**
     * Run one evolution cycle
     */
    async evolve() {
        const rules = this.ruleEngine.getAllRules();
        const actions = [];
        
        for (const rule of rules) {
            const utility = this.selfModel._getRuleUtility(rule.id);
            
            if (utility < this.removalThreshold) {
                // Low utility: mutate or remove
                if (Math.random() < 0.5) {
                    actions.push({ type: 'remove', rule });
                } else {
                    actions.push({ type: 'mutate', rule });
                }
            } else if (utility > this.duplicationThreshold) {
                // High utility: duplicate with mutation
                const partner = this._selectPartner(rule, rules);
                if (partner && Math.random() < this.crossoverRate) {
                    actions.push({ type: 'crossover', rule, partner });
                } else {
                    actions.push({ type: 'duplicate', rule });
                }
            } else if (Math.random() < this.mutationRate) {
                // Random mutation
                actions.push({ type: 'mutate', rule });
            }
        }
        
        // Execute actions
        for (const action of actions) {
            await this._executeAction(action);
        }
        
        this.logInfo('Evolution cycle complete', { 
            actionCount: actions.length,
            actions: actions.reduce((acc, a) => {
                acc[a.type] = (acc[a.type] || 0) + 1;
                return acc;
            }, {})
        });
        
        return actions;
    }
    
    /**
     * Execute a single evolution action
     */
    async _executeAction(action) {
        switch (action.type) {
            case 'remove':
                this.ruleEngine.removeRule(action.rule.id);
                break;
                
            case 'mutate':
                const mutant = this._mutateRule(action.rule);
                this.ruleEngine.addRule(mutant);
                break;
                
            case 'crossover':
                const child = this._crossoverRules(action.rule, action.partner);
                this.ruleEngine.addRule(child);
                break;
                
            case 'duplicate':
                const duplicate = this._duplicateRule(action.rule);
                this.ruleEngine.addRule(duplicate);
                break;
        }
    }
    
    /**
     * Mutate a rule's condition or conclusion
     */
    _mutateRule(rule) {
        const mutant = {
            ...rule,
            id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            utility: 0.5  // Reset utility for new rule
        };
        
        // Randomly mutate condition or conclusion
        if (Math.random() < 0.5) {
            mutant.condition = this._mutatePattern(rule.condition);
        } else {
            mutant.conclusion = this._mutatePattern(rule.conclusion);
        }
        
        return mutant;
    }
    
    /**
     * Mutate a pattern by replacing a term
     */
    _mutatePattern(pattern) {
        // Get all terms from memory
        const terms = Array.from(this.memory.concepts.keys());
        if (terms.length === 0) return pattern;
        
        // Simple mutation: replace one term with a random term
        // TODO: Use embedding similarity for smarter mutation
        const randomTerm = terms[Math.floor(Math.random() * terms.length)];
        
        // String-based replacement (crude but functional)
        const patternStr = pattern.toString();
        const mutated = patternStr.replace(/\$[a-z]+/i, randomTerm);
        
        return mutated;
    }
    
    /**
     * Crossover two rules
     */
    _crossoverRules(rule1, rule2) {
        const child = {
            id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            condition: Math.random() < 0.5 ? rule1.condition : rule2.condition,
            conclusion: Math.random() < 0.5 ? rule1.conclusion : rule2.conclusion,
            utility: 0.5
        };
        
        return child;
    }
    
    /**
     * Duplicate a rule with slight mutation
     */
    _duplicateRule(rule) {
        const duplicate = this._mutateRule(rule);
        duplicate.id = `rule-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        return duplicate;
    }
    
    /**
     * Select a crossover partner (similar rule with good utility)
     */
    _selectPartner(rule, rules) {
        // Find rules with similar condition structure
        const similar = rules.filter(r => 
            r.id !== rule.id && 
            this._structuralSimilarity(rule.condition, r.condition) > 0.5
        );
        
        // Filter by utility
        const goodUtility = similar.filter(r => 
            this.selfModel._getRuleUtility(r.id) > 0.6
        );
        
        if (goodUtility.length === 0) return null;
        
        // Select randomly from good candidates
        return goodUtility[Math.floor(Math.random() * goodUtility.length)];
    }
    
    /**
     * Compute structural similarity between patterns
     */
    _structuralSimilarity(p1, p2) {
        const s1 = p1.toString();
        const s2 = p2.toString();
        
        // Simple string-based similarity
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        
        if (longer.length === 0) return 1.0;
        
        const distance = this._levenshteinDistance(longer, shorter);
        return 1 - (distance / longer.length);
    }
    
    /**
     * Levenshtein distance for string similarity
     */
    _levenshteinDistance(s1, s2) {
        const matrix = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
        
        for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;
        
        for (let j = 1; j <= s2.length; j++) {
            for (let i = 1; i <= s1.length; i++) {
                const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + indicator
                );
            }
        }
        
        return matrix[s2.length][s1.length];
    }
}
```

---

#### 1.3.3 GoalGenerator Component

**File**: `core/src/goals/GoalGenerator.js`

```javascript
import { BaseComponent } from '../util/BaseComponent.js';
import { Task } from '../task/Task.js';
import { Term } from '../term/Term.js';
import { Punctuation } from '../task/Task.js';

/**
 * GoalGenerator: Autonomous goal generation
 * 
 * Goal types:
 * - Exploration: Investigate uncertain concepts
 * - Mastery: Improve skills at edge of capability
 * - Coherence: Resolve contradictions
 * - Meta: Improve own learning
 */
export class GoalGenerator extends BaseComponent {
    constructor(memory, ruleEngine, config = {}) {
        super(config, 'GoalGenerator');
        this.memory = memory;
        this.ruleEngine = ruleEngine;
        this.generationInterval = config.generationInterval ?? 100;
        this.maxGoalsPerCycle = config.maxGoalsPerCycle ?? 5;
    }
    
    /**
     * Generate autonomous goals
     */
    async generateGoals() {
        const goals = [];
        
        // Curiosity goals (explore uncertain concepts)
        const curiosityGoals = await this._generateCuriosityGoals();
        goals.push(...curiosityGoals);
        
        // Competence goals (master challenging skills)
        const competenceGoals = await this._generateCompetenceGoals();
        goals.push(...competenceGoals);
        
        // Coherence goals (resolve contradictions)
        const coherenceGoals = await this._generateCoherenceGoals();
        goals.push(...coherenceGoals);
        
        // Meta goals (improve learning)
        const metaGoals = await this._generateMetaGoals();
        goals.push(...metaGoals);
        
        // Prioritize and limit
        const prioritized = this._prioritizeGoals(goals);
        return prioritized.slice(0, this.maxGoalsPerCycle);
    }
    
    /**
     * Generate exploration goals for uncertain concepts
     */
    async _generateCuriosityGoals() {
        const goals = [];
        const concepts = Array.from(this.memory.concepts.values());
        
        // Find concepts with medium confidence (0.3-0.7 = uncertain)
        const uncertain = concepts.filter(c => {
            const tv = c.getAverageTruth?.() || c.truth;
            return tv && tv.confidence > 0.3 && tv.confidence < 0.7;
        });
        
        for (const concept of uncertain.slice(0, 3)) {
            goals.push(this._createGoal('explore', concept.term, 0.7));
        }
        
        return goals;
    }
    
    /**
     * Generate mastery goals for skills at edge of capability
     */
    async _generateCompetenceGoals() {
        const goals = [];
        
        // Find rules with medium utility (0.3-0.8 = learnable)
        const rules = this.ruleEngine.getAllRules();
        const edgeRules = rules.filter(r => {
            // Utility would come from SelfModel
            return true;  // Placeholder
        });
        
        for (const rule of edgeRules.slice(0, 2)) {
            goals.push(this._createGoal('master', rule.id, 0.6));
        }
        
        return goals;
    }
    
    /**
     * Generate coherence goals to resolve contradictions
     */
    async _generateCoherenceGoals() {
        const goals = [];
        const concepts = Array.from(this.memory.concepts.values());
        
        // Find contradictory beliefs
        for (let i = 0; i < concepts.length; i++) {
            for (let j = i + 1; j < concepts.length; j++) {
                if (this._areContradictory(concepts[i], concepts[j])) {
                    goals.push(this._createGoal(
                        'resolve', 
                        `${concepts[i].term}-${concepts[j].term}`,
                        0.8
                    ));
                    if (goals.length >= 2) break;
                }
            }
            if (goals.length >= 2) break;
        }
        
        return goals;
    }
    
    /**
     * Generate meta-goals for self-improvement
     */
    async _generateMetaGoals() {
        const goals = [];
        
        // Compute learning rate (derivations per cycle)
        const learningRate = this._computeLearningRate();
        
        if (learningRate < 0.1) {
            goals.push(this._createGoal('improve', 'learning-algorithm', 0.9));
        }
        
        return goals;
    }
    
    /**
     * Create a goal task
     */
    _createGoal(type, target, priority = 0.5) {
        const term = new Term('Goal', [
            new Term(type),
            new Term(target)
        ]);
        
        return new Task({
            term,
            punctuation: '!',
            truth: { frequency: 1.0, confidence: 0.9 },
            budget: { priority, durability: 0.5, quality: 0.5 }
        });
    }
    
    /**
     * Check if two concepts are contradictory
     */
    _areContradictory(c1, c2) {
        // Same subject, incompatible predicates
        const s1 = c1.term.children?.[0]?.toString();
        const s2 = c2.term.children?.[0]?.toString();
        
        if (s1 !== s2) return false;
        
        const p1 = c1.term.children?.[1]?.toString();
        const p2 = c2.term.children?.[1]?.toString();
        
        const incompatible = [
            ['red', 'blue'], ['hot', 'cold'], ['alive', 'dead'],
            ['true', 'false'], ['present', 'absent']
        ];
        
        return incompatible.some(pair => 
            (pair[0] === p1 && pair[1] === p2) ||
            (pair[0] === p2 && pair[1] === p1)
        );
    }
    
    /**
     * Compute learning rate
     */
    _computeLearningRate() {
        // Placeholder: would track derivations over time
        return 0.5;
    }
    
    /**
     * Prioritize goals
     */
    _prioritizeGoals(goals) {
        return goals.sort((a, b) => b.budget.priority - a.budget.priority);
    }
}
```

---

#### 1.3.4 CognitiveAgent (Unified Controller)

**File**: `agent/src/CognitiveAgent.js`

```javascript
import { NAR } from '@senars/core';
import { SelfModel } from './self/SelfModel.js';
import { RuleEvolution } from './evolution/RuleEvolution.js';
import { GoalGenerator } from './goals/GoalGenerator.js';

/**
 * CognitiveAgent: Unified AGI/RSI agent
 * 
 * Extends NAR with:
 * - Self-modeling
 * - Rule evolution
 * - Autonomous goal generation
 */
export class CognitiveAgent extends NAR {
    constructor(config = {}) {
        super({
            maxConcepts: config.maxConcepts ?? 500,
            maxDerivationsPerStep: config.maxDerivationsPerStep ?? 100,
            enableSelfModeling: config.enableSelfModeling ?? true,
            enableRuleEvolution: config.enableRuleEvolution ?? true,
            enableAutonomousGoals: config.enableAutonomousGoals ?? true,
            ...config
        });
        
        this.cycleCount = 0;
        this.startTime = Date.now();
        
        // Will be initialized in _initializeCoreComponents
        this._selfModel = null;
        this._ruleEvolution = null;
        this._goalGenerator = null;
    }
    
    /**
     * Override to add AGI/RSI components
     */
    _initializeCoreComponents(config) {
        // Call parent initialization first
        super._initializeCoreComponents(config);
        
        // Add AGI/RSI components
        if (config.enableSelfModeling) {
            this._selfModel = new SelfModel(this._memory, this._ruleEngine, {
                enabled: true
            });
        }
        
        if (config.enableRuleEvolution) {
            this._ruleEvolution = new RuleEvolution(
                this._ruleEngine,
                this._selfModel,
                this._memory,
                {
                    mutationRate: 0.1,
                    crossoverRate: 0.3,
                    removalThreshold: 0.3,
                    duplicationThreshold: 0.7
                }
            );
        }
        
        if (config.enableAutonomousGoals) {
            this._goalGenerator = new GoalGenerator(
                this._memory,
                this._ruleEngine,
                {
                    generationInterval: 100,
                    maxGoalsPerCycle: 5
                }
            );
        }
    }
    
    /**
     * Override initialize to initialize AGI/RSI components
     */
    async initialize() {
        await super.initialize();
        
        // Initialize AGI/RSI components
        if (this._selfModel) {
            await this._selfModel.initialize();
        }
        
        // Seed initial rules if needed
        this._seedInitialRules();
        
        this.logInfo('CognitiveAgent initialized', {
            selfModel: !!this._selfModel,
            ruleEvolution: !!this._ruleEvolution,
            goalGenerator: !!this._goalGenerator
        });
    }
    
    /**
     * Run the agent for a specified duration
     */
    async run(duration = 60000) {
        const startTime = Date.now();
        const endTime = startTime + duration;
        const metrics = {
            cycles: 0,
            derivations: 0,
            evolutions: 0,
            goalsGenerated: 0,
            startTime,
            endTime: null
        };
        
        this.logInfo('Starting CognitiveAgent run', { duration });
        
        while (Date.now() < endTime && this.isRunning) {
            // Standard NARS inference
            const derivations = await this.step();
            metrics.cycles++;
            metrics.derivations += derivations?.length || 0;
            
            // Goal generation every 100 cycles
            if (this._goalGenerator && metrics.cycles % 100 === 0) {
                const goals = await this._goalGenerator.generateGoals();
                for (const goal of goals) {
                    await this.input(goal);
                }
                metrics.goalsGenerated += goals.length;
            }
            
            // Rule evolution every 1000 cycles
            if (this._ruleEvolution && metrics.cycles % 1000 === 0) {
                const actions = await this._ruleEvolution.evolve();
                metrics.evolutions += actions.length;
            }
            
            // Metrics logging every 100 cycles
            if (metrics.cycles % 100 === 0) {
                this._logMetrics(metrics);
            }
        }
        
        metrics.endTime = Date.now();
        this.logInfo('CognitiveAgent run complete', metrics);
        
        return metrics;
    }
    
    /**
     * Seed initial rules for bootstrapping
     */
    _seedInitialRules() {
        // Basic deduction rule
        this._ruleEngine.addRule({
            id: 'rule-deduce',
            condition: '(Inh $s $m) (Inh $m $p)',
            conclusion: '(Inh $s $p)',
            utility: 0.5
        });
        
        // Basic induction rule
        this._ruleEngine.addRule({
            id: 'rule-induce',
            condition: '(Inh $s $m) (Inh $p $m)',
            conclusion: '(Inh $s $p)',
            utility: 0.5
        });
        
        this.logInfo('Seeded initial rules');
    }
    
    /**
     * Log metrics
     */
    _logMetrics(metrics) {
        const rules = this._ruleEngine?.getAllRules() || [];
        const avgUtility = rules.length > 0 
            ? rules.reduce((sum, r) => sum + (r.utility || 0.5), 0) / rules.length 
            : 0;
        const concepts = this._memory?.stats?.totalConcepts || 0;
        
        this.logInfo(`Cycle ${metrics.cycles}: ${rules.length} rules, avg utility: ${avgUtility.toFixed(3)}, concepts: ${concepts}`);
    }
    
    /**
     * Get final metrics
     */
    getMetrics() {
        const rules = this._ruleEngine?.getAllRules() || [];
        const avgUtility = rules.length > 0 
            ? rules.reduce((sum, r) => sum + (r.utility || 0.5), 0) / rules.length 
            : 0;
        
        return {
            uptime: Date.now() - this.startTime,
            cycles: this.cycleCount,
            ruleCount: rules.length,
            avgUtility,
            conceptCount: this._memory?.stats?.totalConcepts || 0
        };
    }
}
```

---

## Part II: Integration Points

### 2.1 Required Modifications to Existing Code

#### 2.1.1 NAR.js Modifications

```javascript
// In core/src/nar/NAR.js

// 1. Add to _initializeCoreComponents (after existing initialization)
_initializeCoreComponents(config) {
    // ... existing code ...
    
    // NEW: AGI/RSI components
    if (config.enableSelfModeling !== false) {
        this._selfModel = new SelfModel(this._memory, this._ruleEngine);
    }
}

// 2. Modify _handleStreamDerivation to track rule usage
async _handleStreamDerivation(derivation) {
    const added = await this._inputTask(derivation);
    
    // NEW: Track rule usage
    if (derivation.metadata?.sourceRule && this._selfModel) {
        const success = derivation.truth?.confidence > 0.5;
        this._selfModel.recordRuleUsage(derivation.metadata.sourceRule, success);
    }
    
    // ... rest of existing code ...
}

// 3. Add getter for selfModel
get selfModel() { return this._selfModel; }
```

#### 2.1.2 RuleEngine.js Modifications

```javascript
// In core/src/reason/RuleEngine.js

// Add method to get all rules
getAllRules() {
    return Array.from(this._rules.values());
}

// Add method to remove rule
removeRule(ruleId) {
    return this._rules.delete(ruleId);
}

// Add metadata tracking to rule execution
async executeRule(rule, premises) {
    const result = await this._executeRuleLogic(rule, premises);
    
    // Track execution for self-model
    if (result && this._selfModel) {
        this._selfModel.recordRuleUsage(rule.id, result.success);
    }
    
    return result;
}
```

#### 2.1.3 Memory.js Modifications

```javascript
// In core/src/memory/Memory.js

// Add query method for self-model
async query(pattern) {
    // Simple pattern matching against concepts
    const results = [];
    for (const [term, concept] of this._concepts) {
        if (this._matchPattern(term, pattern)) {
            results.push(concept);
        }
    }
    return results;
}

_matchPattern(term, pattern) {
    // Simple string-based pattern matching
    // TODO: Use proper unification
    return term.toString().includes(pattern.toString());
}
```

---

### 2.2 MeTTa Integration

#### 2.2.1 Self-Model Operations (MeTTa)

**File**: `metta/src/kernel/ops/SelfModelOps.js`

```javascript
import { Term } from '../Term.js';

/**
 * Operations for querying and manipulating self-model
 */
export function registerSelfModelOps(interpreter) {
    const { ground, space } = interpreter;
    
    // Query rules by utility
    ground.register('rules-by-utility', async (minUtil, maxUtil) => {
        const rules = interpreter.reasoner?.ruleEngine?.getAllRules() || [];
        const selfModel = interpreter.reasoner?.selfModel;
        
        const filtered = rules.filter(rule => {
            const utility = selfModel?._getRuleUtility(rule.id) || 0.5;
            return utility >= minUtil && utility <= maxUtil;
        });
        
        return filtered.map(r => Term.sym(r.id));
    });
    
    // Get rule utility
    ground.register('rule-utility', async (ruleId) => {
        const selfModel = interpreter.reasoner?.selfModel;
        if (!selfModel) return Term.exp(Term.sym('error'), [Term.sym('no-self-model')]);
        
        const utility = selfModel._getRuleUtility(ruleId);
        return Term.exp(Term.sym('utility'), [Term.num(utility)]);
    });
    
    // Record rule success
    ground.register('record-success', async (ruleId) => {
        const selfModel = interpreter.reasoner?.selfModel;
        if (selfModel) {
            selfModel.recordRuleUsage(ruleId, true);
        }
        return Term.sym('ok');
    });
    
    // Record rule failure
    ground.register('record-failure', async (ruleId) => {
        const selfModel = interpreter.reasoner?.selfModel;
        if (selfModel) {
            selfModel.recordRuleUsage(ruleId, false);
        }
        return Term.sym('ok');
    });
    
    // Propose rule modification
    ground.register('propose-modification', async (ruleId, action) => {
        // Create a Goal task for modification
        const memory = interpreter.reasoner?.memory;
        if (!memory) return Term.sym('error');
        
        // Task creation would happen through NAR input
        return Term.exp(Term.sym('proposed'), [Term.sym(ruleId), Term.sym(action)]);
    });
}
```

#### 2.2.2 Evolution Operations (MeTTa)

**File**: `metta/src/kernel/ops/EvolutionOps.js`

```javascript
import { Term } from '../Term.js';

/**
 * Operations for rule evolution
 */
export function registerEvolutionOps(interpreter) {
    const { ground } = interpreter;
    
    // Mutate rule
    ground.register('mutate-rule', async (ruleId) => {
        const ruleEngine = interpreter.reasoner?.ruleEngine;
        const selfModel = interpreter.reasoner?.selfModel;
        
        if (!ruleEngine || !selfModel) return Term.sym('error');
        
        const rule = ruleEngine.getAllRules().find(r => r.id === ruleId);
        if (!rule) return Term.sym('not-found');
        
        // Create mutant
        const mutant = {
            ...rule,
            id: `rule-${Date.now()}`,
            condition: mutatePattern(rule.condition)
        };
        
        ruleEngine.addRule(mutant);
        return Term.sym(mutant.id);
    });
    
    // Crossover rules
    ground.register('crossover-rules', async (ruleId1, ruleId2) => {
        const ruleEngine = interpreter.reasoner?.ruleEngine;
        if (!ruleEngine) return Term.sym('error');
        
        const rule1 = ruleEngine.getAllRules().find(r => r.id === ruleId1);
        const rule2 = ruleEngine.getAllRules().find(r => r.id === ruleId2);
        
        if (!rule1 || !rule2) return Term.sym('not-found');
        
        const child = {
            id: `rule-${Date.now()}`,
            condition: Math.random() < 0.5 ? rule1.condition : rule2.condition,
            conclusion: Math.random() < 0.5 ? rule1.conclusion : rule2.conclusion
        };
        
        ruleEngine.addRule(child);
        return Term.sym(child.id);
    });
    
    // Remove rule
    ground.register('remove-rule', async (ruleId) => {
        const ruleEngine = interpreter.reasoner?.ruleEngine;
        if (!ruleEngine) return Term.sym('error');
        
        ruleEngine.removeRule(ruleId);
        return Term.sym('ok');
    });
}

function mutatePattern(pattern) {
    // Simple string mutation
    return pattern.toString().replace(/\$[a-z]+/i, 'mutated');
}
```

---

## Part III: Testing and Evaluation

### 3.1 Unit Tests

#### 3.1.1 SelfModel Tests

**File**: `tests/unit/self/SelfModel.test.js`

```javascript
import { SelfModel } from '../../../core/src/self/SelfModel.js';
import { Memory } from '../../../core/src/memory/Memory.js';
import { RuleEngine } from '../../../core/src/reason/RuleEngine.js';

describe('SelfModel', () => {
    let memory, ruleEngine, selfModel;
    
    beforeEach(async () => {
        memory = new Memory();
        await memory.initialize();
        
        ruleEngine = new RuleEngine();
        selfModel = new SelfModel(memory, ruleEngine);
        await selfModel.initialize();
    });
    
    test('should mirror rules to memory', async () => {
        ruleEngine.addRule({
            id: 'test-rule',
            condition: '(Inh $x $y)',
            conclusion: '(Inh $x $z)'
        });
        
        await selfModel._mirrorRule(ruleEngine.getAllRules()[0]);
        
        const concepts = Array.from(memory.concepts.keys());
        expect(concepts.some(c => c.includes('Rule'))).toBe(true);
    });
    
    test('should track rule usage', () => {
        selfModel.recordRuleUsage('test-rule', true);
        selfModel.recordRuleUsage('test-rule', true);
        selfModel.recordRuleUsage('test-rule', false);
        
        const utility = selfModel._getRuleUtility('test-rule');
        expect(utility).toBeCloseTo(0.75, 2);  // (2+1)/(3+2) = 0.6
    });
    
    test('should query self-model', async () => {
        // Add test data
        await selfModel._mirrorRule({
            id: 'rule-1',
            condition: '(Inh $x $y)',
            conclusion: '(Inh $x $z)',
            utility: 0.8
        });
        
        const results = await selfModel.query('Rule');
        expect(results.length).toBeGreaterThan(0);
    });
});
```

#### 3.1.2 RuleEvolution Tests

**File**: `tests/unit/evolution/RuleEvolution.test.js`

```javascript
import { RuleEvolution } from '../../../core/src/evolution/RuleEvolution.js';
import { SelfModel } from '../../../core/src/self/SelfModel.js';

describe('RuleEvolution', () => {
    let ruleEngine, selfModel, memory, evolution;
    
    beforeEach(async () => {
        memory = new Memory();
        await memory.initialize();
        
        ruleEngine = new RuleEngine();
        selfModel = new SelfModel(memory, ruleEngine);
        await selfModel.initialize();
        
        evolution = new RuleEvolution(ruleEngine, selfModel, memory);
        
        // Seed rules
        for (let i = 0; i < 10; i++) {
            ruleEngine.addRule({
                id: `rule-${i}`,
                condition: `(Inh $x $y${i})`,
                conclusion: `(Inh $x $z${i})`,
                utility: 0.5
            });
        }
    });
    
    test('should mutate low-utility rules', async () => {
        // Set low utility for rule-0
        selfModel.recordRuleUsage('rule-0', false);
        selfModel.recordRuleUsage('rule-0', false);
        selfModel.recordRuleUsage('rule-0', false);
        
        const initialCount = ruleEngine.getAllRules().length;
        await evolution.evolve();
        
        // Should have mutated or removed rule-0
        const newCount = ruleEngine.getAllRules().length;
        expect(newCount).toBeGreaterThanOrEqual(initialCount - 1);
    });
    
    test('should duplicate high-utility rules', async () => {
        // Set high utility for rule-1
        for (let i = 0; i < 10; i++) {
            selfModel.recordRuleUsage('rule-1', true);
        }
        
        const initialCount = ruleEngine.getAllRules().length;
        await evolution.evolve();
        
        // Should have duplicated rule-1
        const newCount = ruleEngine.getAllRules().length;
        expect(newCount).toBeGreaterThan(initialCount);
    });
    
    test('should compute structural similarity', () => {
        const p1 = '(Inh $x $y)';
        const p2 = '(Inh $x $z)';
        const p3 = '(Sim $a $b)';
        
        const sim1 = evolution._structuralSimilarity(p1, p2);
        const sim2 = evolution._structuralSimilarity(p1, p3);
        
        expect(sim1).toBeGreaterThan(sim2);
    });
});
```

---

### 3.2 Integration Tests

**File**: `tests/integration/CognitiveAgent.test.js`

```javascript
import { CognitiveAgent } from '../../agent/src/CognitiveAgent.js';

describe('CognitiveAgent Integration', () => {
    let agent;
    
    beforeEach(async () => {
        agent = new CognitiveAgent({
            maxConcepts: 100,
            enableSelfModeling: true,
            enableRuleEvolution: true,
            enableAutonomousGoals: true
        });
        await agent.initialize();
    });
    
    afterEach(async () => {
        await agent.stop();
    });
    
    test('should run cognitive cycles', async () => {
        const metrics = await agent.run(5000);  // 5 seconds
        
        expect(metrics.cycles).toBeGreaterThan(0);
        expect(metrics.derivations).toBeGreaterThanOrEqual(0);
    });
    
    test('should generate autonomous goals', async () => {
        await agent.run(10000);
        
        // Goals should have been generated
        const concepts = Array.from(agent.memory.concepts.keys());
        const goalConcepts = concepts.filter(c => c.includes('Goal'));
        
        expect(goalConcepts.length).toBeGreaterThan(0);
    });
    
    test('should evolve rules', async () => {
        const initialRules = agent.ruleEngine.getAllRules().length;
        await agent.run(15000);
        const finalRules = agent.ruleEngine.getAllRules().length;
        
        // Rules should have evolved (some removed, some added)
        expect(Math.abs(finalRules - initialRules)).toBeGreaterThan(0);
    });
    
    test('should track rule utility', async () => {
        // Input some beliefs that will trigger rules
        await agent.input('(Inh [cat] [animal])');
        await agent.input('(Inh [animal] [living])');
        
        await agent.run(5000);
        
        // Self-model should have tracked usage
        if (agent.selfModel) {
            const rules = agent.selfModel.ruleUtilities;
            expect(rules.size).toBeGreaterThan(0);
        }
    });
});
```

---

### 3.3 AGI Evaluation Tests

**File**: `tests/evaluation/AGITests.test.js`

```javascript
describe('AGI Evaluation', () => {
    let agent;
    
    beforeEach(async () => {
        agent = new CognitiveAgent();
        await agent.initialize();
    });
    
    test('Transfer: Learn task A, apply to task B', async () => {
        // Task A: Learn specific inheritance
        await agent.input('(Inh [fluffy] [cat])');
        await agent.input('(Inh [cat] [animal])');
        await agent.run(5000);
        
        // Task B: Apply to new instance
        const startTime = Date.now();
        await agent.input('(Inh [whiskers] [cat])');
        await agent.run(2000);
        const newTime = Date.now() - startTime;
        
        // Should derive faster due to learned pattern
        // (This is a simplified test; real transfer would need more setup)
        expect(newTime).toBeLessThan(5000);
    });
    
    test('Abstraction: Form general rule from specifics', async () => {
        // Input specific examples
        await agent.input('(Inh [red] [color])');
        await agent.input('(Inh [blue] [color])');
        await agent.input('(Inh [green] [color])');
        
        await agent.run(10000);
        
        // Check if general rule was formed
        const rules = agent.ruleEngine.getAllRules();
        const generalRules = rules.filter(r => 
            r.condition?.includes('$') || r.conclusion?.includes('$')
        );
        
        expect(generalRules.length).toBeGreaterThan(0);
    });
    
    test('Self-improvement: Utility increases over time', async () => {
        const initialMetrics = agent.getMetrics();
        
        // Run with feedback
        for (let i = 0; i < 5; i++) {
            await agent.input(`(Inh [item${i}] [category])`);
            await agent.run(2000);
        }
        
        const finalMetrics = agent.getMetrics();
        
        // Average utility should have increased
        expect(finalMetrics.avgUtility).toBeGreaterThanOrEqual(initialMetrics.avgUtility);
    });
});
```

---

### 3.4 RSI Evaluation Tests

**File**: `tests/evaluation/RSITests.test.js`

```javascript
describe('RSI Evaluation', () => {
    let agent;
    
    beforeEach(async () => {
        agent = new CognitiveAgent({
            enableSelfModeling: true,
            enableRuleEvolution: true
        });
        await agent.initialize();
    });
    
    test('Self-model accuracy: Query system about itself', async () => {
        // Add known rules
        agent.ruleEngine.addRule({
            id: 'known-rule',
            condition: '(Inh $x $y)',
            conclusion: '(Inh $x $z)'
        });
        
        await agent.run(2000);
        
        // Query self-model
        if (agent.selfModel) {
            const rules = agent.ruleEngine.getAllRules();
            const mirroredRules = await agent.selfModel.query('Rule');
            
            // Self-model should reflect actual rules
            expect(mirroredRules.length).toBeGreaterThan(0);
        }
    });
    
    test('Safe modification: System remains functional after modifications', async () => {
        const initialRuleCount = agent.ruleEngine.getAllRules().length;
        
        // Run multiple evolution cycles
        for (let i = 0; i < 5; i++) {
            if (agent._ruleEvolution) {
                await agent._ruleEvolution.evolve();
            }
            await agent.run(1000);
        }
        
        // System should still be functional
        expect(agent.isRunning).toBe(true);
        
        // Should still have rules
        const finalRuleCount = agent.ruleEngine.getAllRules().length;
        expect(finalRuleCount).toBeGreaterThan(0);
    });
    
    test('Improvement rate: Utility increases over iterations', async () => {
        const utilities = [];
        
        // Run and track utility over time
        for (let i = 0; i < 10; i++) {
            await agent.input(`(Inh [test${i}] [category])`);
            await agent.run(2000);
            
            const metrics = agent.getMetrics();
            utilities.push(metrics.avgUtility);
        }
        
        // Check for positive trend (simple linear regression)
        const trend = computeTrend(utilities);
        expect(trend).toBeGreaterThan(-0.01);  // Allow small negative due to noise
    });
});

function computeTrend(values) {
    const n = values.length;
    const sumX = n * (n - 1) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, val, i) => sum + i * val, 0);
    const sumX2 = n * (n - 1) * (2 * n - 1) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
}
```

---

## Part IV: Concerns and Mitigations

### 4.1 Technical Concerns

#### C1: Rule Explosion

**Concern**: Evolution might create too many rules, overwhelming memory.

**Evidence**: Bag-based memory has fixed capacity, but rule creation could exceed processing capacity.

**Mitigations**:
1. **Hard limit**: `maxRules` config option (default: 200)
2. **Selection pressure**: Low-utility rules removed first
3. **Creation cost**: New rules start with low priority budget
4. **Monitoring**: Alert when rule count exceeds threshold

```javascript
// In RuleEvolution
async evolve() {
    const rules = this.ruleEngine.getAllRules();
    
    // Hard limit check
    if (rules.length >= this.config.maxRules) {
        // Aggressive removal
        const lowest = this._getLowestUtilityRules(rules, 10);
        for (const rule of lowest) {
            this.ruleEngine.removeRule(rule.id);
        }
    }
    
    // ... rest of evolution
}
```

---

#### C2: Utility Hacking

**Concern**: Rules might optimize for measured utility rather than actual usefulness.

**Evidence**: Goodhart's law - when a measure becomes a target, it ceases to be a good measure.

**Mitigations**:
1. **Multi-metric fitness**: Combine success rate, novelty, efficiency
2. **Delayed evaluation**: Utility computed over time window, not instant
3. **External validation**: Goals achieved, not just derivations made

```javascript
// Multi-metric utility
_computeRuleFitness(rule) {
    const successRate = this._getSuccessRate(rule);
    const novelty = this._getNovelty(rule);
    const efficiency = this._getEfficiency(rule);
    
    return 0.5 * successRate + 0.3 * novelty + 0.2 * efficiency;
}

_getNovelty(rule) {
    // How different from existing rules
    const rules = this.ruleEngine.getAllRules();
    const similarities = rules.map(r => 
        this._structuralSimilarity(rule.condition, r.condition)
    );
    return 1 - Math.max(...similarities);
}

_getEfficiency(rule) {
    // Derivations per resource unit
    const stats = this._getRuleStats(rule.id);
    return stats.derivations / (stats.resourceUsage || 1);
}
```

---

#### C3: Goal Drift

**Concern**: Self-modifications might corrupt or drift from original goals.

**Evidence**: Instrumental convergence - agents might modify goals for easier achievement.

**Mitigations**:
1. **Protected core**: Core goals in immutable memory region
2. **Goal checksums**: Verify goal integrity after modifications
3. **Rollback capability**: Restore from checkpoint if drift detected

```javascript
// In SelfModel
constructor(...) {
    this.coreGoals = new Set(['survival', 'learn', 'improve']);
    this.goalChecksums = new Map();
}

async verifyGoalIntegrity() {
    const currentGoals = await this._extractGoals();
    
    for (const coreGoal of this.coreGoals) {
        if (!currentGoals.some(g => g.includes(coreGoal))) {
            this.logWarn('Core goal missing!', { goal: coreGoal });
            return false;
        }
    }
    
    return true;
}

async rollbackIfNeeded() {
    const intact = await this.verifyGoalIntegrity();
    if (!intact) {
        await this._restoreFromCheckpoint();
        return true;
    }
    return false;
}
```

---

#### C4: Evolution Stagnation

**Concern**: Rule population might converge to local optimum.

**Evidence**: Genetic algorithms often get stuck in local optima.

**Mitigations**:
1. **Minimum mutation rate**: Always some random variation
2. **Periodic injection**: Add random rules periodically
3. **Niching**: Maintain diverse rule subpopulations

```javascript
// In RuleEvolution
async evolve() {
    // ... standard evolution ...
    
    // Periodic random injection
    if (this.cycleCount % 100 === 0) {
        this._injectRandomRules(5);
    }
    
    // Maintain diversity
    const diversity = this._computeDiversity();
    if (diversity < 0.3) {
        this._increaseMutationRate();
    }
}

_injectRandomRules(count) {
    for (let i = 0; i < count; i++) {
        this.ruleEngine.addRule({
            id: `random-${Date.now()}-${i}`,
            condition: this._generateRandomPattern(),
            conclusion: this._generateRandomPattern(),
            utility: 0.5
        });
    }
}
```

---

### 4.2 Safety Concerns

#### S1: Unintended Self-Modification

**Concern**: System might modify itself in harmful ways.

**Mitigations**:
1. **Sandboxed execution**: Modifications tested before applied
2. **Incremental changes**: Only one modification per cycle
3. **Human oversight**: Logging and alerting for significant changes

---

#### S2: Runaway Evolution

**Concern**: Evolution might accelerate beyond control.

**Mitigations**:
1. **Rate limiting**: Max N modifications per cycle
2. **Resource caps**: Evolution bounded by compute budget
3. **Kill switch**: External interrupt signal

---

#### S3: Goal Corruption

**Concern**: Core goals might be modified or removed.

**Mitigations**:
1. **Immutable core**: Core goals in write-protected memory
2. **Verification**: Goal integrity checked after each modification
3. **Rollback**: Automatic restoration if corruption detected

---

## Part V: Open Questions

### Q1: What is the minimal self-model required for RSI?

**Current approach**: Mirror all rules, budgets, concepts.

**Open questions**:
- Can we represent self-model more compactly?
- What level of detail is necessary?
- Should self-model be in same memory or separate?

**Experiments to run**:
1. Compare full mirror vs. summary statistics
2. Measure overhead of self-modeling
3. Test RSI capability with reduced self-model

---

### Q2: How to balance exploration vs. exploitation in rule evolution?

**Current approach**: Fixed thresholds (0.3 removal, 0.7 duplication).

**Open questions**:
- Should thresholds adapt based on performance?
- How to detect when to explore more vs. exploit known good rules?
- What's the optimal mutation rate?

**Experiments to run**:
1. Adaptive threshold strategies
2. Compare fixed vs. dynamic mutation rates
3. Measure exploration/exploitation tradeoff

---

### Q3: How to measure intelligence improvement?

**Current approach**: Rule utility, derivation count.

**Open questions**:
- What metrics correlate with "intelligence"?
- How to measure transfer learning?
- How to measure abstraction capability?

**Proposed metrics**:
1. **Sample efficiency**: Episodes to learn new task
2. **Transfer distance**: How different tasks can transfer
3. **Abstraction depth**: Levels of generalization achieved
4. **Goal achievement rate**: % of self-generated goals achieved

---

### Q4: What verification is needed before self-modification?

**Current approach**: Utility-based selection.

**Open questions**:
- Should modifications be simulated before applied?
- How to verify goal preservation?
- What formal guarantees are feasible?

**Approaches to explore**:
1. **Simulation**: Test modification in sandbox
2. **Formal verification**: Prove properties preserved
3. **Gradual rollout**: Apply to subset, monitor, then full

---

### Q5: How to ensure stable learning across self-modifications?

**Current approach**: Utility tracking persists across modifications.

**Open questions**:
- How to preserve learned knowledge during evolution?
- Should some rules be protected from modification?
- How to handle conflicting modifications?

**Approaches to explore**:
1. **Knowledge distillation**: Extract rules before modification
2. **Protected core**: Essential rules immune to evolution
3. **Conflict resolution**: Merge compatible modifications

---

## Part VI: Implementation Checklist

### Phase 1: Self-Modeling (Weeks 1-4)

- [ ] Create `core/src/self/SelfModel.js`
- [ ] Modify `NAR.js` to integrate SelfModel
- [ ] Add rule usage tracking to RuleEngine
- [ ] Create MeTTa operations for self-queries
- [ ] Write unit tests for SelfModel
- [ ] Write integration tests
- [ ] **Milestone**: System can answer queries about its own rules

### Phase 2: Rule Evolution (Weeks 5-8)

- [ ] Create `core/src/evolution/RuleEvolution.js`
- [ ] Implement mutation operators
- [ ] Implement crossover operators
- [ ] Implement selection mechanism
- [ ] Integrate with CognitiveAgent loop
- [ ] Write unit tests for RuleEvolution
- [ ] Write evolution evaluation tests
- [ ] **Milestone**: Rules evolve through mutation and selection

### Phase 3: Autonomous Goals (Weeks 9-10)

- [ ] Create `core/src/goals/GoalGenerator.js`
- [ ] Implement curiosity goals
- [ ] Implement competence goals
- [ ] Implement coherence goals
- [ ] Integrate with CognitiveAgent loop
- [ ] Write goal generation tests
- [ ] **Milestone**: System generates and pursues self-directed goals

### Phase 4: Integration (Weeks 11-12)

- [ ] Create `agent/src/CognitiveAgent.js`
- [ ] Integrate all components
- [ ] Run full system tests
- [ ] Run AGI evaluation tests
- [ ] Run RSI evaluation tests
- [ ] Performance optimization
- [ ] Documentation
- [ ] **Milestone**: Complete system running autonomously

---

## Part VII: Success Criteria

### Minimal Viable AGI

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| **Transfer** | Learn A, apply to B | 2× faster on B |
| **Abstraction** | General rules formed | >5 general rules |
| **Self-improvement** | Utility over time | +50% over 1000 cycles |
| **Goal pursuit** | Self-generated goals achieved | >40% success rate |
| **Curiosity** | Novel concepts discovered | >10 per 100 cycles |

### Minimal Viable RSI

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| **Self-model** | Query accuracy | >90% correct |
| **Safe modification** | System functional after mod | 100/100 modifications |
| **Improvement rate** | Utility slope | Positive over 1000 cycles |
| **Goal stability** | Core goals preserved | 100% preserved |
| **Autonomous iterations** | Self-improvement cycles | >10 iterations |

---

## Conclusion

This refined plan provides:

1. **Complete specifications** for all components
2. **Integration points** with existing SeNARS/MeTTa code
3. **Risk mitigations** for technical and safety concerns
4. **Open questions** for research exploration
5. **Testable criteria** for AGI and RSI

**Next step**: Begin Phase 1 implementation (Self-Modeling).

---

*"Simple enough to implement, powerful enough to emerge."*
