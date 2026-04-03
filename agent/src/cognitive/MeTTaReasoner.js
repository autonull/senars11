/**
 * MeTTaReasoner.js - MeTTa-based Reasoning Engine
 * 
 * Provides logical inference, pattern matching, and goal-directed reasoning
 * with proper fallback handling when MeTTa is unavailable.
 */
import { Logger } from '@senars/core';
import { extractEntities, contentOverlap } from './TextAnalysis.js';

export class MeTTaReasoner {
    constructor(mettaInterpreter, config = {}) {
        this.metta = mettaInterpreter;
        this.config = {
            inferenceDepth: config.inferenceDepth ?? 3,
            maxInferenceTime: config.maxInferenceTime ?? 500,
            beliefDecay: config.beliefDecay ?? 0.001
        };
        this.beliefs = new Map();
        this.goals = [];
        Logger.info('[MeTTaReasoner] Initialized');
    }

    async reason(attended) {
        const result = { conclusions: [], inferences: [], goals: [], confidence: 0 };
        if (!this.metta) return result;

        try {
            const startTime = Date.now();
            await this._storeBelief(attended);
            const inferences = await this._forwardInference(attended);
            result.inferences = inferences;
            result.goals = await this._matchGoals(attended);
            result.conclusions = await this._generateConclusions(attended, inferences, result.goals);
            await this._updateBeliefs(attended);
            result.confidence = Math.max(0.3, 1 - (Date.now() - startTime) / this.config.maxInferenceTime);
            Logger.debug(`[MeTTaReasoner] Reasoning completed in ${Date.now() - startTime}ms`);
        } catch (error) {
            Logger.error('[MeTTaReasoner] Reasoning error:', error);
        }
        return result;
    }

    async _storeBelief(perception) {
        const content = perception.content;
        const source = perception.metadata?.from ?? 'unknown';
        const timestamp = perception.timestamp ?? Date.now();
        const beliefAtom = `(belief "${source}" "${content?.replace(/"/g, '\\"') ?? ''}" ${timestamp})`;

        try {
            await this.metta.run(beliefAtom);
            const beliefId = `belief_${timestamp}_${source}`;
            this.beliefs.set(beliefId, {
                id: beliefId, source, content, timestamp,
                truthValue: { confidence: 0.8, certainty: 0.7 },
                accessed: Date.now()
            });
        } catch (e) {
            Logger.debug('[MeTTaReasoner] Failed to store belief:', e.message);
        }
    }

    async _forwardInference(perception) {
        const inferences = [];
        if (!this.metta) return inferences;

        try {
            const entities = extractEntities(perception.content);
            if (entities.length > 0) {
                inferences.push({ type: 'entity_extraction', entities, confidence: 0.7 });
            }
            const implications = await this._findImplications(perception.content);
            if (implications.length > 0) inferences.push(...implications);
        } catch (e) {
            Logger.debug('[MeTTaReasoner] Inference error:', e.message);
        }
        return inferences;
    }

    async _findImplications(content) {
        const implications = [];
        for (const [id, belief] of this.beliefs.entries()) {
            if (belief.content && contentOverlap(belief.content, content)) {
                implications.push({
                    type: 'association',
                    source: belief.content,
                    target: content,
                    confidence: belief.truthValue.confidence * 0.6
                });
            }
        }
        return implications;
    }

    _contentRelated(a, b) {
        return contentOverlap(a, b, { minWordLength: 4 });
    }

    async _matchGoals(perception) {
        return this.goals
            .map(goal => ({ goal, relevance: this._goalRelevance(goal, perception) }))
            .filter(({ relevance }) => relevance > 0.5)
            .map(({ goal, relevance }) => ({ goal, relevance, action: goal.action }));
    }

    _goalRelevance(goal, perception) {
        let relevance = 0;
        const content = perception.content?.toLowerCase() ?? '';
        if (goal.topics) goal.topics.forEach(t => { if (content.includes(t.toLowerCase())) relevance += 0.3; });
        if (goal.user && perception.metadata?.from === goal.user) relevance += 0.4;
        if (goal.intent && perception.features?.intents?.includes(goal.intent)) relevance += 0.3;
        return Math.min(1.0, relevance);
    }

    async _generateConclusions(perception, inferences, goalMatches) {
        const conclusions = [];
        inferences.forEach(inf => {
            if (inf.type === 'entity_extraction' && inf.entities.length > 0) {
                conclusions.push({
                    type: 'context',
                    content: `Discussion involves: ${inf.entities.map(e => e.value).join(', ')}`,
                    confidence: inf.confidence
                });
            }
            if (inf.type === 'association') {
                conclusions.push({ type: 'association', content: `Related to: ${inf.source}`, confidence: inf.confidence });
            }
        });
        goalMatches.forEach(match => {
            conclusions.push({ type: 'goal_relevant', content: match.goal.description, goal: match.goal, confidence: match.relevance });
        });
        if (conclusions.length === 0) {
            conclusions.push({ type: 'observation', content: perception.content, confidence: 0.5 });
        }
        return conclusions;
    }

    async _updateBeliefs(perception) {
        const content = perception.content?.toLowerCase() ?? '';
        for (const belief of this.beliefs.values()) {
            belief.truthValue.confidence *= (1 - this.config.beliefDecay);
            belief.accessed = Date.now();
            if (this._contentRelated(belief.content, content)) {
                belief.truthValue.confidence = Math.min(1.0, belief.truthValue.confidence + 0.05);
            }
        }
        for (const [id, belief] of this.beliefs.entries()) {
            if (belief.truthValue.confidence < 0.3) this.beliefs.delete(id);
        }
    }

    addGoal(goal) {
        this.goals.push({ id: `goal_${Date.now()}`, added: Date.now(), ...goal });
        Logger.info(`[MeTTaReasoner] Goal added: ${goal.description}`);
    }

    removeGoal(goalId) { this.goals = this.goals.filter(g => g.id !== goalId); }
    getBeliefs(filter = {}) {
        let beliefs = Array.from(this.beliefs.values());
        if (filter.source) beliefs = beliefs.filter(b => b.source === filter.source);
        if (filter.minConfidence) beliefs = beliefs.filter(b => b.truthValue.confidence >= filter.minConfidence);
        return beliefs.sort((a, b) => b.timestamp - a.timestamp);
    }
    getState() { return { beliefCount: this.beliefs.size, goalCount: this.goals.length, config: this.config }; }
}
