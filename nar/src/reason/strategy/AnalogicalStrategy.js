import {PremiseFormationStrategy} from './PremiseFormationStrategy.js';
import {Unifier} from '../../term/Unifier.js';

const SIMILARITY_OPERATORS = new Set(['<->', '↔', 'similarity']);
const IMPLICATION_OPERATORS = new Set(['-->', '==>', 'inheritance']);
const ANALOGICAL_CONFIDENCE_PENALTY = 0.7;

export class AnalogicalStrategy extends PremiseFormationStrategy {
    constructor(config = {}) {
        super(config);
        this.name = 'AnalogicalStrategy';

        if (!config.termFactory) {
            throw new Error('AnalogicalStrategy requires termFactory in config');
        }

        this.termFactory = config.termFactory;
        this.unifier = new Unifier(this.termFactory);
        this.config = {
            minSimilarityThreshold: config.minSimilarityThreshold ?? 0.5,
            maxCandidates: config.maxCandidates ?? 10,
            searchDepth: config.searchDepth ?? 2,
            ...config
        };
    }

    async* generateCandidates(task, memory, context) {
        if (!task.term || !memory) return;

        const similarityRelations = this._findTasksByPredicate(memory, this._isSimilarityRelation);
        const implications = this._findTasksByPredicate(memory, this._isImplication);

        for (const similarity of similarityRelations) {
            for (const implication of implications) {
                const analogy = this._tryAnalogicalMapping(similarity, implication);

                if (analogy) {
                    yield {
                        premise1: similarity,
                        premise2: implication,
                        priority: this._calculateAnalogicalPriority(similarity, implication),
                        source: this.name,
                        metadata: {type: 'analogical', mapping: analogy.mapping}
                    };
                }
            }
        }
    }

    _findTasksByPredicate(memory, predicate) {
        const concepts = memory.getAllConcepts?.() ?? [];
        return concepts.flatMap(concept =>
            (concept.getTasks?.() ?? []).filter(task => predicate.call(this, task))
        );
    }

    _isSimilarityRelation(task) {
        return task.term?.operator && task.isBelief?.() &&
            SIMILARITY_OPERATORS.has(task.term.operator);
    }

    _isImplication(task) {
        return task.term?.operator && task.isBelief?.() &&
            IMPLICATION_OPERATORS.has(task.term.operator);
    }

    _tryAnalogicalMapping(similarity, implication) {
        const [simSubject, simPredicate] = similarity.term.components;
        const [implSubject, implPredicate] = implication.term.components;

        const match1 = this.unifier.unify(simPredicate, implSubject);
        if (match1.success) {
            return {
                mapping: match1.substitution,
                source: simSubject,
                target: implPredicate,
                middleTerm: simPredicate
            };
        }

        const match2 = this.unifier.unify(simSubject, implSubject);
        if (match2.success) {
            return {
                mapping: match2.substitution,
                source: simPredicate,
                target: implPredicate,
                middleTerm: simSubject
            };
        }

        return null;
    }

    _calculateAnalogicalPriority(similarity, implication) {
        const simConfidence = similarity.truth?.confidence ?? 0.5;
        const implConfidence = implication.truth?.confidence ?? 0.5;
        const basePriority = Math.min(simConfidence, implConfidence);
        const boost = simConfidence * implConfidence * 0.2;
        return Math.min(1.0, basePriority + boost);
    }

    mapKnowledge(sourcePattern, targetPattern, knowledge) {
        const mapping = this.unifier.unify(sourcePattern, knowledge.term);
        if (!mapping.success) return null;

        const transferredTerm = this._applyStructuralMapping(
            knowledge.term,
            sourcePattern,
            targetPattern,
            mapping.substitution
        );
        if (!transferredTerm) return null;

        const originalConfidence = knowledge.truth?.confidence ?? 0.9;
        const transferredConfidence = originalConfidence * ANALOGICAL_CONFIDENCE_PENALTY;

        return knowledge.clone({
            term: transferredTerm,
            truth: knowledge.truth ? {
                frequency: knowledge.truth.frequency,
                confidence: transferredConfidence
            } : null
        });
    }

    _applyStructuralMapping(term, sourcePattern, targetPattern, substitution) {
        const sourceSub = this.unifier.applySubstitution(sourcePattern, substitution);
        const targetSub = this.unifier.applySubstitution(targetPattern, substitution);
        return this.unifier.unify(term, sourceSub).success ? targetSub : null;
    }

    getStatus() {
        return {
            ...super.getStatus(),
            type: 'AnalogicalStrategy',
            config: this.config
        };
    }
}
