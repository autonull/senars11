/**
 * MeTTaReasoner.js - MeTTa-based Reasoning Engine
 * 
 * Provides:
 * - Logical inference over beliefs
 * - Pattern matching and unification
 * - Goal-directed reasoning
 * - Integration with CognitiveArchitecture
 */
import { Logger } from '@senars/core';

export class MeTTaReasoner {
    constructor(mettaInterpreter, config = {}) {
        this.metta = mettaInterpreter;
        this.config = {
            inferenceDepth: config.inferenceDepth ?? 3,
            maxInferenceTime: config.maxInferenceTime ?? 500,
            beliefDecay: config.beliefDecay ?? 0.001
        };
        
        // Belief tracking
        this.beliefs = new Map();
        this.goals = [];
        
        Logger.info('[MeTTaReasoner] Initialized');
    }

    /**
     * Reason about attended perception
     */
    async reason(attended) {
        const result = {
            conclusions: [],
            inferences: [],
            goals: [],
            confidence: 0
        };
        
        if (!this.metta) {
            return result;
        }
        
        try {
            const startTime = Date.now();
            
            // 1. Store perception as belief
            await this._storeBelief(attended);
            
            // 2. Run forward inference
            const inferences = await this._forwardInference(attended);
            result.inferences = inferences;
            
            // 3. Check for goal matches
            const goalMatches = await this._matchGoals(attended);
            result.goals = goalMatches;
            
            // 4. Generate conclusions
            result.conclusions = await this._generateConclusions(attended, inferences, goalMatches);
            
            // 5. Update belief truth values
            await this._updateBeliefs(attended);
            
            const elapsed = Date.now() - startTime;
            result.confidence = Math.max(0.3, 1 - (elapsed / this.config.maxInferenceTime));
            
            Logger.debug(`[MeTTaReasoner] Reasoning completed in ${elapsed}ms`);
            
        } catch (error) {
            Logger.error('[MeTTaReasoner] Reasoning error:', error);
        }
        
        return result;
    }

    /**
     * Store perception as MeTTa belief
     */
    async _storeBelief(perception) {
        const content = perception.content;
        const source = perception.metadata?.from || 'unknown';
        const timestamp = perception.timestamp || Date.now();
        
        // Create belief atom
        const beliefAtom = `(belief "${source}" "${content.replace(/"/g, '\\"')}" ${timestamp})`;
        
        try {
            await this.metta.run(beliefAtom);
            
            // Track locally
            const beliefId = `belief_${timestamp}_${source}`;
            this.beliefs.set(beliefId, {
                id: beliefId,
                source,
                content,
                timestamp,
                truthValue: { confidence: 0.8, certainty: 0.7 },
                accessed: Date.now()
            });
            
        } catch (e) {
            Logger.debug('[MeTTaReasoner] Failed to store belief:', e.message);
        }
    }

    /**
     * Forward chaining inference
     */
    async _forwardInference(perception) {
        const inferences = [];
        
        if (!this.metta) return inferences;
        
        try {
            // Run inference rules
            const rules = [
                // Extract entities and relationships
                `(if (belief $x $content $t)
                    (then (extract-entities $content)))`,
                
                // Find related beliefs
                `(if (belief $x $c1 $t1) (belief $y $c2 $t2)
                    (then (find-relations $c1 $c2)))`
            ];
            
            // Simple pattern matching on content
            const entities = this._extractEntities(perception.content);
            if (entities.length > 0) {
                inferences.push({
                    type: 'entity_extraction',
                    entities,
                    confidence: 0.7
                });
            }
            
            // Check for implications
            const implications = await this._findImplications(perception.content);
            if (implications.length > 0) {
                inferences.push(...implications);
            }
            
        } catch (e) {
            Logger.debug('[MeTTaReasoner] Inference error:', e.message);
        }
        
        return inferences;
    }

    /**
     * Extract entities from content
     */
    _extractEntities(content) {
        const entities = [];
        
        // Simple entity extraction patterns
        const patterns = [
            { type: 'person', regex: /@(\w+)/g },
            { type: 'topic', regex: /#(\w+)/g },
            { type: 'concept', regex: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g },
            { type: 'technical', regex: /\b(AI|ML|NLP|API|HTTP|TCP|UDP|JSON|XML)\b/gi }
        ];
        
        for (const { type, regex } of patterns) {
            const matches = content.match(regex);
            if (matches) {
                entities.push(...matches.map(m => ({
                    type,
                    value: m.replace(/[@#]/g, '')
                })));
            }
        }
        
        return entities;
    }

    /**
     * Find implications in knowledge base
     */
    async _findImplications(content) {
        const implications = [];
        
        // Look for conditional patterns in stored beliefs
        for (const [id, belief] of this.beliefs.entries()) {
            if (belief.content && this._contentRelated(belief.content, content)) {
                // Found related belief - potential inference
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

    /**
     * Check if contents are related
     */
    _contentRelated(a, b) {
        if (!a || !b) return false;
        
        const aWords = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 4));
        const bWords = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 4));
        
        let overlap = 0;
        for (const word of aWords) {
            if (bWords.has(word)) overlap++;
        }
        
        return overlap >= 2;
    }

    /**
     * Match perception against active goals
     */
    async _matchGoals(perception) {
        const matches = [];
        
        for (const goal of this.goals) {
            const relevance = this._goalRelevance(goal, perception);
            if (relevance > 0.5) {
                matches.push({
                    goal,
                    relevance,
                    action: goal.action
                });
            }
        }
        
        return matches;
    }

    /**
     * Calculate goal relevance
     */
    _goalRelevance(goal, perception) {
        let relevance = 0;
        
        // Check topic match
        if (goal.topics) {
            for (const topic of goal.topics) {
                if (perception.content?.toLowerCase().includes(topic.toLowerCase())) {
                    relevance += 0.3;
                }
            }
        }
        
        // Check user match
        if (goal.user && perception.metadata?.from === goal.user) {
            relevance += 0.4;
        }
        
        // Check intent match
        if (goal.intent && perception.features?.intents?.includes(goal.intent)) {
            relevance += 0.3;
        }
        
        return Math.min(1.0, relevance);
    }

    /**
     * Generate conclusions from reasoning
     */
    async _generateConclusions(perception, inferences, goalMatches) {
        const conclusions = [];
        
        // From entity extraction
        for (const inf of inferences) {
            if (inf.type === 'entity_extraction' && inf.entities.length > 0) {
                conclusions.push({
                    type: 'context',
                    content: `Discussion involves: ${inf.entities.map(e => e.value).join(', ')}`,
                    confidence: inf.confidence
                });
            }
            
            if (inf.type === 'association') {
                conclusions.push({
                    type: 'association',
                    content: `Related to: ${inf.source}`,
                    confidence: inf.confidence
                });
            }
        }
        
        // From goal matches
        for (const match of goalMatches) {
            conclusions.push({
                type: 'goal_relevant',
                content: match.goal.description,
                goal: match.goal,
                confidence: match.relevance
            });
        }
        
        // Default conclusion if nothing specific
        if (conclusions.length === 0) {
            conclusions.push({
                type: 'observation',
                content: perception.content,
                confidence: 0.5
            });
        }
        
        return conclusions;
    }

    /**
     * Update belief truth values based on access
     */
    async _updateBeliefs(perception) {
        // Decay all beliefs slightly
        for (const belief of this.beliefs.values()) {
            belief.truthValue.confidence *= (1 - this.config.beliefDecay);
            belief.accessed = Date.now();
        }
        
        // Boost relevant beliefs
        const content = perception.content?.toLowerCase() || '';
        for (const belief of this.beliefs.values()) {
            if (this._contentRelated(belief.content, content)) {
                belief.truthValue.confidence = Math.min(1.0, belief.truthValue.confidence + 0.05);
            }
        }
        
        // Remove low-confidence beliefs
        for (const [id, belief] of this.beliefs.entries()) {
            if (belief.truthValue.confidence < 0.3) {
                this.beliefs.delete(id);
            }
        }
    }

    /**
     * Add a goal to pursue
     */
    addGoal(goal) {
        this.goals.push({
            id: `goal_${Date.now()}`,
            added: Date.now(),
            ...goal
        });
        Logger.info(`[MeTTaReasoner] Goal added: ${goal.description}`);
    }

    /**
     * Remove completed/expired goals
     */
    removeGoal(goalId) {
        this.goals = this.goals.filter(g => g.id !== goalId);
    }

    /**
     * Get current beliefs
     */
    getBeliefs(filter = {}) {
        let beliefs = Array.from(this.beliefs.values());
        
        if (filter.source) {
            beliefs = beliefs.filter(b => b.source === filter.source);
        }
        
        if (filter.minConfidence) {
            beliefs = beliefs.filter(b => b.truthValue.confidence >= filter.minConfidence);
        }
        
        return beliefs.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get reasoning state
     */
    getState() {
        return {
            beliefCount: this.beliefs.size,
            goalCount: this.goals.length,
            config: this.config
        };
    }
}
