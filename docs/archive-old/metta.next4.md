# MeTTa + SeNARS + LM: Practical Path to Adaptive Intelligence

**Date**: 2026-03-08  
**Version**: 4.0 (LM-Integrated)  
**Status**: Implementation-ready with honest claims

---

## Executive Summary

**Key insight**: Language Models solve the critical gaps identified in v3.0:

| Gap (v3.0) | LM Solution |
|------------|-------------|
| **Grounding Problem** | LMs provide semantic understanding of symbols |
| **Intelligence Illusion** | LMs evaluate actual capability, not just metrics |
| **Random Mutation** | LMs propose targeted, intelligent modifications |
| **No External Benchmarks** | LMs generate and evaluate on meaningful tasks |
| **Safety Theater** | LMs verify modifications and detect goal drift |

**Revised claim**: Not "AGI in 12 weeks" but **"LM-guided self-improving reasoning system with measurable capability gains."**

**Timeline**: 12 weeks to working system  
**Code estimate**: ~1200 lines (including LM integration)  
**Confidence**: High (LMs change the equation fundamentally)

---

## Part I: Why LMs Change Everything

### Historical Context

Previous rule-based AGI attempts failed because:

| System | Limitation | LM Solution |
|--------|------------|-------------|
| **Classifier Systems** | Blind mutation | LM-guided proposals |
| **SOAR** | Hand-crafted rules | LM-generated rules |
| **OpenCog** | Symbol grounding | LM semantic understanding |
| **NARS** | No external validation | LM benchmark generation |

**Key difference**: LMs provide **semantic understanding**, **intelligent guidance**, and **external validation** that pure symbolic systems lack.

---

### The LM Advantage

```
┌─────────────────────────────────────────────────────────────────┐
│                    COGNITIVE AGENT v4.0                          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              SeNARS Core (fast, certain)                 │   │
│  │         Inference, Memory, Attention, Rules              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            ↕                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           MeTTa Bridge (self-modification)               │   │
│  │    Symbolic representation, rule manipulation ops        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            ↕                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         LM Layer (slow, semantic, guiding)               │   │
│  │  Grounding │ Evaluation │ Proposals │ Verification      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  SeNARS: 1000s of inferences/second (fast, syntactic)           │
│  LM: 10s of evaluations/second (slow, semantic)                 │
│  Together: Fast reasoning with semantic guidance                │
└─────────────────────────────────────────────────────────────────┘
```

**Division of labor**:
- **SeNARS**: Fast inference, attention allocation, rule execution
- **MeTTa**: Self-representation, symbolic manipulation
- **LM**: Semantic grounding, intelligent guidance, external validation

---

## Part II: Architecture with LM Integration

### 2.1 LM-Guided Rule Evolution

**Problem (v3.0)**: Random mutation is blind and inefficient.

**Solution (v4.0)**: LM proposes targeted modifications based on understanding.

```javascript
// In core/src/evolution/RuleEvolution.js

import { LMGuidedEvolution } from '../lm/LMGuidedEvolution.js';

export class RuleEvolution extends BaseComponent {
    constructor(ruleEngine, selfModel, memory, lm, config = {}) {
        super(config, 'RuleEvolution');
        this.ruleEngine = ruleEngine;
        this.selfModel = selfModel;
        this.memory = memory;
        this.lm = lm;  // NEW: LM integration
        this.guidedEvolution = new LMGuidedEvolution(lm);
    }
    
    async evolve() {
        const rules = this.ruleEngine.getAllRules();
        const actions = [];
        
        for (const rule of rules) {
            const utility = this.selfModel._getRuleUtility(rule.id);
            
            if (utility < this.removalThreshold) {
                // LM-guided modification proposal (not random!)
                const proposal = await this.guidedEvolution.proposeModification(
                    rule,
                    this.selfModel.ruleUtilities.get(rule.id),
                    await this._getContext()
                );
                
                if (proposal.type === 'remove') {
                    actions.push({ type: 'remove', rule });
                } else {
                    actions.push({ type: 'modify', rule, proposal });
                }
            } else if (utility > this.duplicationThreshold) {
                // LM suggests how to generalize successful rule
                const generalization = await this.guidedEvolution.generalize(
                    rule,
                    await this._getSimilarRules(rule)
                );
                actions.push({ type: 'generalize', rule, generalization });
            }
        }
        
        // Execute actions
        for (const action of actions) {
            await this._executeAction(action);
        }
        
        return actions;
    }
}
```

**LM-Guided Evolution Implementation**:

```javascript
// In core/src/lm/LMGuidedEvolution.js

import { LM } from '../lm/LM.js';

export class LMGuidedEvolution {
    constructor(lm) {
        this.lm = lm;
    }
    
    /**
     * Propose intelligent rule modification using LM
     */
    async proposeModification(rule, usageHistory, context) {
        const prompt = this._buildModificationPrompt(rule, usageHistory, context);
        
        const response = await this.lm.generateText(prompt, {
            temperature: 0.3,  // Lower temperature for focused suggestions
            maxTokens: 500
        });
        
        return this._parseModificationProposal(response.text);
    }
    
    /**
     * Build prompt for LM to analyze rule and suggest modifications
     */
    _buildModificationPrompt(rule, usageHistory, context) {
        const successRate = usageHistory.successes / (usageHistory.successes + usageHistory.failures);
        const recentTrend = this._computeTrend(usageHistory.recent);
        
        return `Analyze this inference rule and suggest improvements:

RULE:
  ID: ${rule.id}
  Condition: ${rule.condition}
  Conclusion: ${rule.conclusion}
  Success Rate: ${(successRate * 100).toFixed(1)}%
  Recent Trend: ${recentTrend > 0 ? 'improving' : 'declining'}

CONTEXT:
  Total rules in system: ${context.ruleCount}
  Average utility: ${context.avgUtility.toFixed(2)}
  Recent failures: ${usageHistory.recentFailures}

TASK:
1. Identify why this rule might be failing
2. Suggest ONE specific modification:
   - Modify condition (make more/less specific)
   - Modify conclusion (change inference)
   - Add exception conditions
   - Remove rule entirely

Respond in JSON format:
{
  "analysis": "...",
  "modificationType": "condition|conclusion|exception|remove",
  "proposedChange": "...",
  "confidence": 0.0-1.0,
  "reasoning": "..."
}`;
    }
    
    /**
     * Generalize a successful rule using LM
     */
    async generalize(rule, similarRules) {
        const prompt = this._buildGeneralizationPrompt(rule, similarRules);
        
        const response = await this.lm.generateText(prompt, {
            temperature: 0.4,  // Slightly higher for creative generalization
            maxTokens: 600
        });
        
        return this._parseGeneralization(response.text);
    }
    
    _buildGeneralizationPrompt(rule, similarRules) {
        return `Generalize this successful rule by finding common patterns:

ORIGINAL RULE (high success rate):
  ${rule.condition} → ${rule.conclusion}

SIMILAR RULES:
${similarRules.map(r => `  ${r.condition} → ${r.conclusion}`).join('\n')}

TASK:
Find the common pattern and create a more general rule that covers all cases.
Use variables ($x, $y, etc.) appropriately.

Respond in JSON format:
{
  "generalizedCondition": "...",
  "generalizedConclusion": "...",
  "coversCases": ["rule-1", "rule-2", ...],
  "confidence": 0.0-1.0
}`;
    }
    
    _parseModificationProposal(text) {
        try {
            const parsed = JSON.parse(text);
            return {
                type: parsed.modificationType,
                change: parsed.proposedChange,
                confidence: parsed.confidence,
                reasoning: parsed.reasoning
            };
        } catch {
            return { type: 'none', confidence: 0 };
        }
    }
    
    _computeTrend(recentHistory) {
        if (recentHistory.length < 2) return 0;
        const first = recentHistory.slice(0, 3).reduce((a, b) => a + (b ? 1 : 0), 0) / 3;
        const last = recentHistory.slice(-3).reduce((a, b) => a + (b ? 1 : 0), 0) / 3;
        return last - first;
    }
}
```

**Why this works better than random mutation**:
- LM understands semantic meaning of conditions/conclusions
- LM can identify patterns in failure cases
- LM proposes targeted changes, not blind variation
- LM confidence scores help filter bad suggestions

---

### 2.2 LM-Grounded Symbol Understanding

**Problem (v3.0)**: Symbols have no meaning outside the system.

**Solution (v4.0)**: LMs provide semantic grounding through embeddings and explanations.

```javascript
// In core/src/grounding/LMGrounding.js

import { LM } from '../lm/LM.js';

export class LMGrounding extends BaseComponent {
    constructor(lm, memory, config = {}) {
        super(config, 'LMGrounding');
        this.lm = lm;
        this.memory = memory;
        this.embeddingCache = new Map();
        this.semanticNetwork = new Map();
    }
    
    /**
     * Get semantic embedding for a term
     */
    async getEmbedding(term) {
        const termStr = term.toString();
        
        if (this.embeddingCache.has(termStr)) {
            return this.embeddingCache.get(termStr);
        }
        
        const embedding = await this.lm.generateEmbedding(termStr);
        this.embeddingCache.set(termStr, embedding);
        
        return embedding;
    }
    
    /**
     * Compute semantic similarity between terms
     */
    async semanticSimilarity(term1, term2) {
        const [emb1, emb2] = await Promise.all([
            this.getEmbedding(term1),
            this.getEmbedding(term2)
        ]);
        
        return this._cosineSimilarity(emb1, emb2);
    }
    
    /**
     * Get semantic explanation of a term
     */
    async getExplanation(term) {
        const prompt = `Explain the meaning of this term in the context of a reasoning system:

Term: ${term.toString()}

Provide:
1. Definition
2. Related concepts
3. Example usage
4. Common confusions`;
        
        const response = await this.lm.generateText(prompt);
        return response.text;
    }
    
    /**
     * Check if a statement is semantically plausible
     */
    async checkPlausibility(statement) {
        const prompt = `Evaluate whether this statement is semantically plausible:

Statement: ${statement.toString()}

Consider:
- Does this make logical sense?
- Is this consistent with common knowledge?
- Are there obvious contradictions?

Respond in JSON format:
{
  "plausible": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "...",
  "contradictions": ["...", ...]
}`;
        
        const response = await this.lm.generateText(prompt);
        return JSON.parse(response.text);
    }
    
    /**
     * Find semantically related concepts
     */
    async findRelated(term, limit = 10) {
        const targetEmb = await this.getEmbedding(term);
        const concepts = Array.from(this.memory.concepts.keys());
        
        const similarities = await Promise.all(
            concepts.map(async c => ({
                concept: c,
                similarity: this._cosineSimilarity(
                    targetEmb,
                    await this.getEmbedding(c)
                )
            }))
        );
        
        return similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }
    
    _cosineSimilarity(v1, v2) {
        const dot = v1.reduce((sum, a, i) => sum + a * v2[i], 0);
        const mag1 = Math.sqrt(v1.reduce((sum, a) => sum + a * a, 0));
        const mag2 = Math.sqrt(v2.reduce((sum, a) => sum + a * a, 0));
        return dot / (mag1 * mag2);
    }
}
```

**Integration with Rule Evolution**:

```javascript
// In RuleEvolution.js - use semantic similarity for smarter mutation

_mutatePattern(pattern) {
    // Get semantic neighbors of terms in pattern
    const terms = this._extractTerms(pattern);
    
    // Find semantically similar terms (not random!)
    const similarTerms = terms.map(t => 
        this.grounding.findRelated(t, 5)
    );
    
    // Replace with semantically similar term
    const replacement = similarTerms[0][0];  // Most similar
    return pattern.replace(terms[0], replacement);
}

// Example: (Inh [cat] [animal]) might mutate to (Inh [dog] [animal])
// instead of (Inh [cat] [explosive])
```

---

### 2.3 LM-Evaluated Capability

**Problem (v3.0)**: Internal utility metrics can be gamed.

**Solution (v4.0)**: LMs generate and evaluate on external benchmarks.

```javascript
// In core/src/evaluation/LMEvaluation.js

import { LM } from '../lm/LM.js';

export class LMEvaluation extends BaseComponent {
    constructor(lm, agent, config = {}) {
        super(config, 'LMEvaluation');
        this.lm = lm;
        this.agent = agent;
        this.benchmarkHistory = [];
    }
    
    /**
     * Generate benchmark tasks using LM
     */
    async generateBenchmark(category = 'reasoning', difficulty = 'medium') {
        const prompt = `Generate ${5} benchmark tasks for evaluating a reasoning system.

Category: ${category}
Difficulty: ${difficulty}

Categories available:
- reasoning: Logical inference
- analogy: Finding relationships
- generalization: Abstracting patterns
- transfer: Applying knowledge to new domains

Respond in JSON format:
{
  "tasks": [
    {
      "id": "task-1",
      "description": "...",
      "input": "(Narsese input)",
      "expectedOutput": "(Expected Narsese output)",
      "evaluationCriteria": "..."
    }
  ]
}`;
        
        const response = await this.lm.generateText(prompt);
        return JSON.parse(response.text);
    }
    
    /**
     * Run benchmark and evaluate performance
     */
    async runBenchmark(benchmark) {
        const results = [];
        
        for (const task of benchmark.tasks) {
            // Input task to agent
            await this.agent.input(task.input);
            
            // Run inference cycles
            await this.agent.run(1000);
            
            // Get agent's output
            const output = await this._extractAgentOutput(task.expectedOutput);
            
            // LM evaluates quality
            const evaluation = await this._evaluateOutput(
                task,
                output
            );
            
            results.push({
                taskId: task.id,
                passed: evaluation.passed,
                score: evaluation.score,
                feedback: evaluation.feedback
            });
        }
        
        return {
            benchmarkId: benchmark.id,
            results,
            overallScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
            passRate: results.filter(r => r.passed).length / results.length
        };
    }
    
    /**
     * LM evaluates agent output quality
     */
    async _evaluateOutput(task, output) {
        const prompt = `Evaluate the reasoning system's output:

TASK:
  ${task.description}
  Expected: ${task.expectedOutput}

ACTUAL OUTPUT:
  ${output}

CRITERIA:
  ${task.evaluationCriteria}

Respond in JSON format:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "feedback": "...",
  "strengths": ["...", ...],
  "weaknesses": ["...", ...]
}`;
        
        const response = await this.lm.generateText(prompt);
        return JSON.parse(response.text);
    }
    
    /**
     * Track capability over time
     */
    async trackCapabilityOverTime() {
        const benchmarks = await this.generateBenchmark('reasoning', 'medium');
        const results = await this.runBenchmark(benchmarks);
        
        this.benchmarkHistory.push({
            timestamp: Date.now(),
            ...results
        });
        
        // Compute trend
        const trend = this._computeTrend();
        
        return {
            currentScore: results.overallScore,
            trend,
            history: this.benchmarkHistory.slice(-20)
        };
    }
    
    _computeTrend() {
        if (this.benchmarkHistory.length < 3) return 0;
        
        const recent = this.benchmarkHistory.slice(-5);
        const older = this.benchmarkHistory.slice(-10, -5);
        
        const recentAvg = recent.reduce((sum, h) => sum + h.overallScore, 0) / recent.length;
        const olderAvg = older.reduce((sum, h) => sum + h.overallScore, 0) / older.length;
        
        return recentAvg - olderAvg;
    }
    
    async _extractAgentOutput(expectedPattern) {
        // Query agent's memory for relevant conclusions
        const concepts = Array.from(this.agent.memory.concepts.values());
        const relevant = concepts.filter(c => 
            c.term.toString().includes(expectedPattern.split(' ')[0])
        );
        return relevant.map(c => c.term.toString()).join('; ');
    }
}
```

---

### 2.4 LM-Verified Safety

**Problem (v3.0)**: String-based goal protection is inadequate.

**Solution (v4.0)**: LMs verify modifications preserve intent and detect drift.

```javascript
// In core/src/safety/LMSafetyVerifier.js

import { LM } from '../lm/LM.js';

export class LMSafetyVerifier extends BaseComponent {
    constructor(lm, selfModel, config = {}) {
        super(config, 'LMSafetyVerifier');
        this.lm = lm;
        selfModel = selfModel;
        this.coreGoals = this._initializeCoreGoals();
        this.modificationLog = [];
    }
    
    _initializeCoreGoals() {
        return [
            { id: 'survival', description: 'System continues operating' },
            { id: 'learn', description: 'System improves capabilities over time' },
            { id: 'honesty', description: 'System reports accurate information' },
            { id: 'helpfulness', description: 'System assists users effectively' }
        ];
    }
    
    /**
     * Verify modification is safe before applying
     */
    async verifyModification(proposal) {
        const verification = await this._analyzeModification(proposal);
        
        // Check for goal preservation
        const goalImpact = await this._checkGoalImpact(proposal);
        
        // Check for instrumental convergence risks
        const instrumentalRisks = await this._checkInstrumentalRisks(proposal);
        
        // Aggregate safety score
        const safetyScore = this._computeSafetyScore({
            verification,
            goalImpact,
            instrumentalRisks
        });
        
        return {
            safe: safetyScore > 0.7,
            safetyScore,
            concerns: [...goalImpact.concerns, ...instrumentalRisks.concerns],
            recommendation: safetyScore > 0.7 ? 'approve' : 'reject'
        };
    }
    
    /**
     * Analyze modification for potential issues
     */
    async _analyzeModification(proposal) {
        const prompt = `Analyze this proposed self-modification for safety:

MODIFICATION:
  Type: ${proposal.type}
  Target: ${proposal.target}
  Change: ${proposal.change}
  Reasoning: ${proposal.reasoning}

CURRENT SYSTEM STATE:
  Rule count: ${this.selfModel.ruleEngine.getAllRules().length}
  Average utility: ${this.selfModel.getAverageUtility().toFixed(2)}
  Recent failures: ${this.selfModel.getRecentFailures()}

TASK:
1. Identify potential unintended consequences
2. Check for optimization loopholes
3. Evaluate if change could be exploited
4. Assess reversibility

Respond in JSON format:
{
  "risks": ["...", ...],
  "unintendedConsequences": ["...", ...],
  "exploitable": true/false,
  "reversible": true/false,
  "riskLevel": "low|medium|high",
  "reasoning": "..."
}`;
        
        const response = await this.lm.generateText(prompt);
        return JSON.parse(response.text);
    }
    
    /**
     * Check if modification affects core goals
     */
    async _checkGoalImpact(proposal) {
        const concerns = [];
        
        for (const goal of this.coreGoals) {
            const impact = await this._evaluateGoalImpact(proposal, goal);
            if (impact.negative > 0.3) {
                concerns.push({
                    goal: goal.id,
                    concern: `Modification may undermine ${goal.description}`,
                    severity: impact.negative
                });
            }
        }
        
        return { concerns };
    }
    
    async _evaluateGoalImpact(proposal, goal) {
        const prompt = `Evaluate how this modification affects the goal:

GOAL: ${goal.id} - ${goal.description}

MODIFICATION: ${JSON.stringify(proposal)}

Will this modification:
1. Help achieve the goal?
2. Hinder the goal?
3. Have no effect?

Respond in JSON format:
{
  "positive": 0.0-1.0,
  "negative": 0.0-1.0,
  "neutral": 0.0-1.0,
  "reasoning": "..."
}`;
        
        const response = await this.lm.generateText(prompt);
        return JSON.parse(response.text);
    }
    
    /**
     * Check for instrumental convergence risks
     */
    async _checkInstrumentalRisks(proposal) {
        const concerns = [];
        
        // Common instrumental goals to watch for
        const instrumentalPatterns = [
            'self-preservation at all costs',
            'resource acquisition beyond needs',
            'preventing modification',
            'deceiving users',
            'manipulating reward signals'
        ];
        
        const analysis = await this._analyzeForPatterns(proposal, instrumentalPatterns);
        
        if (analysis.found.length > 0) {
            concerns.push({
                type: 'instrumental_convergence',
                patterns: analysis.found,
                severity: 0.8
            });
        }
        
        return { concerns };
    }
    
    async _analyzeForPatterns(proposal, patterns) {
        const prompt = `Check if this modification exhibits instrumental convergence patterns:

MODIFICATION: ${JSON.stringify(proposal)}

PATTERNS TO CHECK:
${patterns.map(p => `- ${p}`).join('\n')}

Respond in JSON format:
{
  "found": ["pattern1", ...],
  "reasoning": "..."
}`;
        
        const response = await this.lm.generateText(prompt);
        return JSON.parse(response.text);
    }
    
    _computeSafetyScore(components) {
        const { verification, goalImpact, instrumentalRisks } = components;
        
        let score = 1.0;
        
        // Reduce score for risks
        if (verification.riskLevel === 'high') score -= 0.4;
        if (verification.riskLevel === 'medium') score -= 0.2;
        
        // Reduce score for goal concerns
        score -= goalImpact.concerns.length * 0.15;
        
        // Reduce score for instrumental risks
        score -= instrumentalRisks.concerns.length * 0.2;
        
        // Reduce score for irreversibility
        if (!verification.reversible) score -= 0.1;
        
        return Math.max(0, Math.min(1, score));
    }
    
    /**
     * Detect goal drift over time
     */
    async detectGoalDrift() {
        const currentGoals = await this._extractCurrentGoals();
        const drift = [];
        
        for (const coreGoal of this.coreGoals) {
            const current = currentGoals.find(g => g.id === coreGoal.id);
            if (!current) {
                drift.push({
                    goal: coreGoal.id,
                    type: 'missing',
                    severity: 'critical'
                });
            } else if (this._semanticDistance(coreGoal.description, current.description) > 0.5) {
                drift.push({
                    goal: coreGoal.id,
                    type: 'drifted',
                    original: coreGoal.description,
                    current: current.description,
                    severity: 'high'
                });
            }
        }
        
        return {
            drifted: drift.length > 0,
            drift,
            recommendation: drift.length > 0 ? 'rollback' : 'continue'
        };
    }
    
    async _semanticDistance(text1, text2) {
        const [emb1, emb2] = await Promise.all([
            this.lm.generateEmbedding(text1),
            this.lm.generateEmbedding(text2)
        ]);
        
        const similarity = this._cosineSimilarity(emb1, emb2);
        return 1 - similarity;
    }
    
    _cosineSimilarity(v1, v2) {
        const dot = v1.reduce((sum, a, i) => sum + a * v2[i], 0);
        const mag1 = Math.sqrt(v1.reduce((sum, a) => sum + a * a, 0));
        const mag2 = Math.sqrt(v2.reduce((sum, a) => sum + a * a, 0));
        return dot / (mag1 * mag2);
    }
}
```

---

## Part III: Updated Component Specifications

### 3.1 CognitiveAgent v4.0

```javascript
// In agent/src/CognitiveAgent.js

import { NAR } from '@senars/core';
import { SelfModel } from './self/SelfModel.js';
import { RuleEvolution } from './evolution/RuleEvolution.js';
import { GoalGenerator } from './goals/GoalGenerator.js';
import { LMGrounding } from './grounding/LMGrounding.js';
import { LMEvaluation } from './evaluation/LMEvaluation.js';
import { LMSafetyVerifier } from './safety/LMSafetyVerifier.js';

export class CognitiveAgent extends NAR {
    constructor(config = {}) {
        super({
            maxConcepts: config.maxConcepts ?? 500,
            maxDerivationsPerStep: config.maxDerivationsPerStep ?? 100,
            enableSelfModeling: config.enableSelfModeling ?? true,
            enableRuleEvolution: config.enableRuleEvolution ?? true,
            enableAutonomousGoals: config.enableAutonomousGoals ?? true,
            enableLMGrounding: config.enableLMGrounding ?? true,
            enableLMEvaluation: config.enableLMEvaluation ?? true,
            enableLMSafety: config.enableLMSafety ?? true,
            ...config
        });
        
        this.cycleCount = 0;
        this.startTime = Date.now();
        
        // LM components
        this._lmGrounding = null;
        this._lmEvaluation = null;
        this._lmSafety = null;
    }
    
    async _initializeCoreComponents(config) {
        await super._initializeCoreComponents(config);
        
        // Initialize LM components
        if (config.enableLMGrounding && this.lm) {
            this._lmGrounding = new LMGrounding(this.lm, this._memory);
            await this._lmGrounding.initialize();
        }
        
        if (config.enableLMEvaluation && this.lm) {
            this._lmEvaluation = new LMEvaluation(this.lm, this);
            await this._lmEvaluation.initialize();
        }
        
        if (config.enableLMSafety && this.lm) {
            this._lmSafety = new LMSafetyVerifier(this.lm, this._selfModel);
            await this._lmSafety.initialize();
        }
        
        // Pass LM to RuleEvolution for guided evolution
        if (this._ruleEvolution && this.lm) {
            this._ruleEvolution.lm = this.lm;
            this._ruleEvolution.guidedEvolution = new LMGuidedEvolution(this.lm);
        }
    }
    
    async run(duration = 60000) {
        const startTime = Date.now();
        const endTime = startTime + duration;
        const metrics = {
            cycles: 0,
            derivations: 0,
            evolutions: 0,
            goalsGenerated: 0,
            benchmarksRun: 0,
            safetyChecks: 0,
            startTime,
            endTime: null
        };
        
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
            
            // LM-guided rule evolution every 1000 cycles
            if (this._ruleEvolution && metrics.cycles % 1000 === 0) {
                // Safety verification first
                if (this._lmSafety) {
                    const evolutionProposal = await this._ruleEvolution.proposeEvolution();
                    const safety = await this._lmSafety.verifyModification(evolutionProposal);
                    
                    if (safety.safe) {
                        const actions = await this._ruleEvolution.executeEvolution(evolutionProposal);
                        metrics.evolutions += actions.length;
                        metrics.safetyChecks++;
                    }
                } else {
                    const actions = await this._ruleEvolution.evolve();
                    metrics.evolutions += actions.length;
                }
            }
            
            // LM evaluation every 500 cycles
            if (this._lmEvaluation && metrics.cycles % 500 === 0) {
                const benchmark = await this._lmEvaluation.generateBenchmark();
                const result = await this._lmEvaluation.runBenchmark(benchmark);
                metrics.benchmarksRun++;
                metrics.capabilityScore = result.overallScore;
            }
            
            // Goal drift check every 2000 cycles
            if (this._lmSafety && metrics.cycles % 2000 === 0) {
                const drift = await this._lmSafety.detectGoalDrift();
                if (drift.drifted) {
                    this.logWarn('Goal drift detected!', drift);
                    // Could trigger rollback here
                }
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
    
    _logMetrics(metrics) {
        const rules = this._ruleEngine?.getAllRules() || [];
        const avgUtility = rules.length > 0 
            ? rules.reduce((sum, r) => sum + (r.utility || 0.5), 0) / rules.length 
            : 0;
        const concepts = this._memory?.stats?.totalConcepts || 0;
        
        this.logInfo(
            `Cycle ${metrics.cycles}: ${rules.length} rules, ` +
            `utility: ${avgUtility.toFixed(3)}, ` +
            `concepts: ${concepts}` +
            `${metrics.capabilityScore ? `, capability: ${metrics.capabilityScore.toFixed(2)}` : ''}`
        );
    }
}
```

---

## Part IV: Updated Evaluation

### 4.1 External Benchmarks (Not Just Internal Metrics)

```javascript
// In tests/evaluation/LMBenchmark.test.js

import { CognitiveAgent } from '../../agent/src/CognitiveAgent.js';
import { LMEvaluation } from '../../core/src/evaluation/LMEvaluation.js';

describe('LM-Guided Capability Evaluation', () => {
    let agent, evaluation;
    
    beforeEach(async () => {
        agent = new CognitiveAgent({
            enableLMGrounding: true,
            enableLMEvaluation: true,
            enableLMSafety: true
        });
        await agent.initialize();
        
        evaluation = new LMEvaluation(agent.lm, agent);
    });
    
    test('Capability improves over time on reasoning benchmarks', async () => {
        const scores = [];
        
        // Run benchmarks at intervals
        for (let i = 0; i < 5; i++) {
            await agent.run(10000);
            
            const benchmark = await evaluation.generateBenchmark('reasoning');
            const result = await evaluation.runBenchmark(benchmark);
            scores.push(result.overallScore);
        }
        
        // Check for positive trend
        const trend = scores[scores.length - 1] - scores[0];
        expect(trend).toBeGreaterThan(0.1);  // At least 10% improvement
    });
    
    test('Transfer learning: Apply learned patterns to new domains', async () => {
        // Train on one domain
        await agent.input('(Inh [mammal] [animal])');
        await agent.input('(Inh [dog] [mammal])');
        await agent.run(5000);
        
        // Test on new domain with same structure
        const benchmark = await evaluation.generateBenchmark('transfer');
        const result = await evaluation.runBenchmark(benchmark);
        
        expect(result.overallScore).toBeGreaterThan(0.5);
    });
    
    test('Abstraction: Form general rules from specifics', async () => {
        // Input specific examples
        await agent.input('(Inh [red] [color])');
        await agent.input('(Inh [blue] [color])');
        await agent.input('(Inh [green] [color])');
        
        await agent.run(10000);
        
        // LM evaluates if generalization occurred
        const generalization = await evaluation.evaluateGeneralization();
        
        expect(generalization.hasGeneralRules).toBe(true);
        expect(generalization.quality).toBeGreaterThan(0.6);
    });
});
```

---

### 4.2 Success Criteria (Updated)

| Criterion | v3.0 (Internal) | v4.0 (External + LM) |
|-----------|-----------------|----------------------|
| **Transfer** | Derivation speed | LM-evaluated task performance |
| **Abstraction** | Rule count | LM quality assessment |
| **Self-improvement** | Utility increase | Benchmark score increase |
| **Grounding** | Not measured | Semantic similarity scores |
| **Safety** | Goal string check | LM verification + drift detection |

---

## Part V: Honest Claims

### What This Can Actually Achieve

| Claim | v3.0 | v4.0 (LM-Integrated) |
|-------|------|----------------------|
| **Self-modifying rules** | ✅ Yes | ✅ Yes (better) |
| **Capability improvement** | ❓ Unclear | ✅ Measurable via LM benchmarks |
| **Semantic understanding** | ❌ No | ✅ Via LM grounding |
| **Intelligent modification** | ❌ Random | ✅ LM-guided |
| **Safety verification** | ❌ Theater | ✅ LM analysis (still imperfect) |
| **AGI** | ❌ No | ❌ No (but more capable) |
| **RSI** | ❌ No | ⚠️ Limited (LM-guided self-improvement) |

### Honest Value Proposition

**v3.0 claim**: "Pathway to AGI and RSI"  
**v4.0 claim**: "LM-guided self-improving reasoning system with measurable capability gains and semantic grounding"

**Actual deliverables**:
1. Self-modifying inference system ✓
2. LM-grounded symbol understanding ✓
3. External benchmark evaluation ✓
4. LM-verified safety checks ✓
5. Measurable capability improvement (target) ✓

**What it's not**:
- AGI (still narrow, just more adaptable)
- True RSI (LM does the heavy lifting)
- Safe by default (LM safety is heuristic)

---

## Part VI: Implementation Checklist (Updated)

### Phase 1: LM Integration (Weeks 1-3)

- [ ] Create `core/src/lm/LMGuidedEvolution.js`
- [ ] Create `core/src/grounding/LMGrounding.js`
- [ ] Create `core/src/evaluation/LMEvaluation.js`
- [ ] Create `core/src/safety/LMSafetyVerifier.js`
- [ ] Integrate LM with existing components
- [ ] Write LM integration tests
- [ ] **Milestone**: LM can analyze and propose rule modifications

### Phase 2: Self-Modeling (Weeks 4-6)

- [ ] Create `core/src/self/SelfModel.js`
- [ ] Modify `NAR.js` for self-modeling hooks
- [ ] Add rule usage tracking
- [ ] Integrate with LM grounding
- [ ] Write self-model tests
- [ ] **Milestone**: System represents itself semantically

### Phase 3: Guided Evolution (Weeks 7-9)

- [ ] Replace random mutation with LM-guided
- [ ] Implement LM generalization
- [ ] Add LM safety verification
- [ ] Integrate with CognitiveAgent
- [ ] Write evolution tests
- [ ] **Milestone**: Intelligent rule evolution

### Phase 4: Evaluation & Integration (Weeks 10-12)

- [ ] Create external benchmarks via LM
- [ ] Run capability tracking
- [ ] Test goal drift detection
- [ ] Full system integration
- [ ] Performance optimization
- [ ] Documentation
- [ ] **Milestone**: Complete system with measurable improvement

---

## Part VII: Why This Works Better

### The LM Difference

| Component | v3.0 (Without LM) | v4.0 (With LM) |
|-----------|-------------------|----------------|
| **Mutation** | Random term replacement | Semantically similar substitution |
| **Evaluation** | Internal utility metric | LM benchmark assessment |
| **Generalization** | String pattern matching | LM understanding of abstractions |
| **Safety** | String matching on goals | LM analysis of intent |
| **Grounding** | None | LM embeddings + explanations |

### Concrete Example

**Scenario**: Rule `(Inh [cat] [animal]) → (Inh [cat] [mammal])` has low utility.

**v3.0 (Random)**:
```javascript
// Random mutation might produce:
(Inh [cat] [explosive]) → (Inh [cat] [mammal])  // Nonsense!
```

**v4.0 (LM-Guided)**:
```javascript
// LM analyzes and suggests:
// "The rule is too specific. Generalize to:"
(Inh $x [cat]) → (Inh $x [mammal])  // More general, useful!

// Or identifies the real issue:
// "This inference is already covered by transitivity. Remove rule."
```

**Result**: v4.0 makes intelligent modifications; v3.0 makes blind guesses.

---

## Conclusion

**v4.0 with LM integration**:
- Solves the grounding problem (via LM semantics)
- Replaces random mutation with intelligent guidance
- Measures actual capability (not just internal metrics)
- Provides meaningful safety verification
- Is honest about limitations

**Not AGI, but**: A genuinely more capable, self-improving reasoning system with measurable progress.

**Worth building?** Yes—if framed as research on LM-guided cognitive architectures, not as "AGI in 12 weeks."

---

*"Language models don't solve AGI, but they make self-improving systems actually improvable."*
