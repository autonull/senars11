import {Concept} from './Concept.js';
import {Term} from '../term/Term.js';
import {MemoryIndex} from './MemoryIndex.js';
import {MemoryConsolidation} from './MemoryConsolidation.js';
import {Bag} from './Bag.js';
import {BaseComponent} from '../util/BaseComponent.js';
import {MemoryValidator} from '../util/MemoryValidator.js';
import {IntrospectionEvents} from '../util/IntrospectionEvents.js';
import {MemoryStatistics} from './MemoryStatistics.js';
import {MemoryScorer} from './MemoryScorer.js';
import {MemoryResourceManager} from './MemoryResourceManager.js';
import {ForgettingStrategyFactory} from './forgetting/ForgettingStrategyFactory.js';
import {Archive} from './Archive.js';

export class Memory extends BaseComponent {
    static CONSOLIDATION_THRESHOLDS = Object.freeze({
        activationThreshold: 0.1,
        minTasksThreshold: 5,
        decayThreshold: 0.01,
        minTasksForDecay: 2
    });

    static DEFAULT_CONFIG = Object.freeze({
        priorityThreshold: 0.5,
        priorityDecayRate: 0.01,
        consolidationInterval: 10,
        maxConcepts: 1000,
        maxTasksPerConcept: 100,
        forgetPolicy: 'priority',
        resourceBudget: 10000,
        activationDecayRate: 0.005,
        memoryPressureThreshold: 0.8,
        enableAdaptiveForgetting: true,
        memoryValidationInterval: 30000,
    });

    constructor(config = {}, eventBus = null, termFactory = null) {
        const mergedConfig = {...Memory.DEFAULT_CONFIG, ...config, enableMemoryValidation: config.enableMemoryValidation !== false};
        super(mergedConfig, 'Memory', eventBus);

        this._termFactory = termFactory;
        this._initComponents();
        this._initStats();
    }

    static get SCORING_WEIGHTS() { return MemoryScorer.SCORING_WEIGHTS; }
    static get NORMALIZATION_LIMITS() { return MemoryScorer.NORMALIZATION_LIMITS; }

    get config() { return {...this._config}; }
    get concepts() { return new Map(this._concepts); }
    get focusConcepts() { return new Set(this._focusConcepts); }
    get index() { return this._index; }
    get archive() { return this._archive; }
    get stats() { return {...this._stats}; }

    _initComponents() {
        this._concepts = new Map();
        this._conceptBag = new Bag(this._config.maxConcepts, this._config.forgetPolicy);
        this._focusConcepts = new Set();
        this._index = new MemoryIndex();
        this._consolidation = new MemoryConsolidation();
        this._archive = new Archive();

        this._resourceManager = new MemoryResourceManager(this._config);
        this._forgettingStrategy = ForgettingStrategyFactory.create(this._config.forgetPolicy);

        this._memoryValidator = this._config.enableMemoryValidation
            ? new MemoryValidator({ enableChecksums: true, validationInterval: this._config.memoryValidationInterval })
            : null;
    }

    _initStats() {
        this._stats = {
            totalConcepts: 0,
            totalTasks: 0,
            focusConceptsCount: 0,
            createdAt: Date.now(),
            lastConsolidation: Date.now(),
            conceptsForgotten: 0,
            tasksForgotten: 0,
            memoryCorruptionEvents: 0,
            validationFailures: 0
        };
        this._cyclesSinceConsolidation = 0;
        this._lastConsolidationTime = Date.now();
    }

    getConfigValue(key, defaultVal) {
        return this._config[key] ?? defaultVal;
    }

    addTask(task, currentTime = Date.now()) {
        if (!task?.term) return false;

        const term = task.term;
        let concept = this.getConcept(term) || this._createConcept(term);

        if (concept && concept.totalTasks >= this._config.maxTasksPerConcept) {
            concept.enforceCapacity(this._config.maxTasksPerConcept, this._config.forgetPolicy);
        }

        const added = concept.addTask(task);
        if (added) {
            this._handleTaskAdded(task, concept);
        }
        return added;
    }

    _handleTaskAdded(task, concept) {
        this._emitIntrospectionEvent(IntrospectionEvents.MEMORY_TASK_ADDED, () => ({task: task.serialize()}));
        this._stats.totalTasks++;
        this._resourceManager.updateResourceUsage(concept, 1);

        if (task.budget?.priority) {
            concept.boostActivation(task.budget.priority * 0.1);
        }

        if (task.budget.priority >= this._config.priorityThreshold) {
            this._focusConcepts.add(concept);
            this._updateFocusConceptsCount();
        }

        if (this._config.enableAdaptiveForgetting && this._resourceManager.isUnderMemoryPressure(this._stats)) {
            this._resourceManager.applyAdaptiveForgetting(this);
        }
    }

    _createConcept(term) {
        if (this._stats.totalConcepts >= this._config.maxConcepts) {
            this._applyConceptForgetting();
        }

        const concept = new Concept(term, this._config);
        this._concepts.set(term.name, concept);
        this._index.addConcept(concept);
        this._stats.totalConcepts++;
        this._emitIntrospectionEvent(IntrospectionEvents.MEMORY_CONCEPT_CREATED, () => ({concept: concept.serialize()}));
        return concept;
    }

    getConcept(term) {
        if (!term) return null;
        const name = this._getTermName(term);
        const concept = this._concepts.get(name);
        if (concept) {
            this._emitIntrospectionEvent(IntrospectionEvents.MEMORY_CONCEPT_ACCESSED, () => ({concept: concept.serialize()}));
        }
        return concept || null;
    }

    _getTermName(term) {
        return typeof term === 'string' ? term : term.name;
    }

    _applyConceptForgetting() {
        const termToForget = this._forgettingStrategy.forget(this._concepts, this._stats);
        if (termToForget) {
            this.removeConcept(termToForget);
            this._stats.conceptsForgotten++;
        }
    }

    removeConcept(term) {
        const name = this._getTermName(term);
        const concept = this._concepts.get(name);
        if (!concept) return false;

        if (this._focusConcepts.has(concept)) {
            this._focusConcepts.delete(concept);
            this._updateFocusConceptsCount();
        }
        this._concepts.delete(name);
        this._index.removeConcept(concept);
        this._stats.totalConcepts--;
        this._stats.totalTasks -= concept.totalTasks;

        return true;
    }

    getAllConcepts() {
        return Array.from(this._concepts.values());
    }

    *getTasksIterator() {
        for (const concept of this._concepts.values()) {
            if (concept.getAllTasks) {
                yield* concept.getAllTasks();
            }
        }
    }

    getTasks(limit = 0) {
        const tasks = [];
        for (const task of this.getTasksIterator()) {
            tasks.push(task);
            if (limit > 0 && tasks.length >= limit) break;
        }
        return tasks;
    }

    getConceptsByCriteria(criteria = {}) {
        return this.getAllConcepts().filter(c => this._conceptMatchesCriteria(c, criteria));
    }

    _conceptMatchesCriteria(concept, criteria) {
        if (criteria.minActivation !== undefined && concept.activation < criteria.minActivation) return false;
        if (criteria.minTasks !== undefined && concept.totalTasks < criteria.minTasks) return false;
        if (criteria.taskType && concept.getTasksByType(criteria.taskType).length === 0) return false;
        if (criteria.onlyFocus === true && !this._focusConcepts.has(concept)) return false;
        return true;
    }

    getMostActiveConcepts(limit = 10, scoringType = 'standard') {
        const scoringOptions = scoringType === 'composite' ? {
            weights: {
                activationWeight: 0.3, useCountWeight: 0.2, taskCountWeight: 0.2,
                qualityWeight: 0.15, complexityWeight: 0.15, diversityWeight: 0.1
            }
        } : { weights: Memory.SCORING_WEIGHTS };

        return this.getConceptsByCompositeScoring({ limit, scoringOptions, sortBy: 'composite' });
    }

    getConceptsByCompositeScoring({limit = 10, minScore = 0, scoringOptions = {}, sortBy = 'composite'} = {}) {
        const concepts = this.getAllConcepts();
        const scoredConcepts = concepts
            .map(concept => ({concept, score: MemoryScorer.calculateDetailedConceptScore(concept, scoringOptions.weights || {})}))
            .filter(item => item.score.compositeScore >= minScore);

        return scoredConcepts
            .sort(MemoryScorer.getSorterFunction(sortBy))
            .slice(0, limit)
            .map(item => item.concept);
    }

    consolidate(currentTime = Date.now()) {
        if (this._cyclesSinceConsolidation++ < this._config.consolidationInterval) return;

        this._cyclesSinceConsolidation = 0;
        this._stats.lastConsolidation = currentTime;
        this._lastConsolidationTime = currentTime;

        this._emitIntrospectionEvent(IntrospectionEvents.MEMORY_CONSOLIDATION_START, {timestamp: currentTime});

        const results = this._consolidation.consolidate(this, currentTime);
        this.applyActivationDecay();
        this._resourceManager.cleanup(this._concepts);
        this._updateFocusConceptsCount();

        this._emitIntrospectionEvent(IntrospectionEvents.MEMORY_CONSOLIDATION_END, {timestamp: Date.now(), results});

        return results;
    }

    boostConceptActivation(term, boostAmount = 0.1) {
        const name = this._getTermName(term);
        const concept = this._concepts.get(name);
        if (concept) {
            concept.boostActivation(boostAmount);
            if (!this._focusConcepts.has(concept)) {
                this._focusConcepts.add(concept);
                this._updateFocusConceptsCount();
            }
        }
    }

    updateConceptQuality(term, qualityChange) {
        const name = this._getTermName(term);
        this._concepts.get(name)?.updateQuality(qualityChange);
    }

    getDetailedStats() {
        const stats = MemoryStatistics.getDetailedStats(this, this._stats);
        stats.indexStats = this._index.getStats();
        return stats;
    }

    getHealthMetrics() {
        return this._consolidation.calculateHealthMetrics(this);
    }

    _updateFocusConceptsCount() {
        this._stats.focusConceptsCount = this._focusConcepts.size;
    }

    clear() {
        this._concepts.clear();
        this._focusConcepts.clear();
        this._index.clear();
        this._initStats();
    }

    hasConcept(term) {
        const name = this._getTermName(term);
        return this._concepts.has(name);
    }

    getTotalTaskCount() { return this._stats.totalTasks; }

    getConceptsWithBeliefs(pattern) {
        return this.getAllConcepts().filter(concept =>
            concept.getTasksByType('BELIEF').some(task => task.term.equals(pattern))
        );
    }

    getMemoryPressureStats() {
        return this._resourceManager.getMemoryPressureStats(this._stats);
    }

    applyActivationDecay() {
        const decayRate = this._config.activationDecayRate;
        for (const concept of this._concepts.values()) {
            concept.applyDecay(decayRate);
        }
    }

    getConceptsByResourceUsage(ascending = false) {
        return this._resourceManager.getConceptsByResourceUsage(this._concepts, ascending);
    }

    getModifiedConcepts(sinceTimestamp) {
        const modified = [];
        for (const concept of this._concepts.values()) {
            if (concept.lastModified > sinceTimestamp) {
                modified.push(concept);
            }
        }
        return modified;
    }

    getBeliefDeltas(sinceTimestamp) {
        const modifiedConcepts = this.getModifiedConcepts(sinceTimestamp);
        const deltas = [];

        for (const concept of modifiedConcepts) {
            const beliefs = concept.getTasksByType('BELIEF');
            if (beliefs.length > 0) {
                const bestBelief = beliefs[0];
                deltas.push({
                    term: concept.term.toString(),
                    truth: {
                        frequency: bestBelief.truth.frequency,
                        confidence: bestBelief.truth.confidence
                    },
                    timestamp: concept.lastModified,
                    source: 'gossip'
                });
            }
        }
        return deltas;
    }

    validateMemory() {
        if (!this._memoryValidator) {
            return {valid: true, message: 'Memory validation is disabled'};
        }

        const validations = this._getValidationTargets();
        const results = this._memoryValidator.validateBatch(validations);
        const invalidResults = results.filter(result => !result.result.valid);

        if (invalidResults.length > 0) {
            return this._handleValidationFailures(invalidResults, results.length);
        }

        return {valid: true, message: 'Memory validation passed'};
    }

    _getValidationTargets() {
        return [
            ...Array.from(this._concepts).map(([term, concept]) => [`concept_${term.toString()}`, concept]),
            ['memory_index', this._index],
            ['memory_stats', this._stats]
        ];
    }

    _handleValidationFailures(invalidResults, totalChecked) {
        this._stats.memoryCorruptionEvents++;
        this._stats.validationFailures += invalidResults.length;

        this.logWarn('Memory corruption detected', {
            invalidCount: invalidResults.length,
            totalChecked,
            details: invalidResults.map(r => ({
                key: r.key,
                message: r.result.message
            }))
        });

        return {
            valid: false,
            message: `Memory corruption detected in ${invalidResults.length} structures`,
            details: invalidResults
        };
    }

    updateMemoryChecksum(key, obj) {
        return this._memoryValidator ? this._memoryValidator.updateChecksum(key, obj) : null;
    }

    getMemoryValidationStats() {
        if (!this._memoryValidator) {
            return {validationEnabled: false};
        }

        return {
            validationEnabled: true,
            validationStats: this._stats,
            checksumCount: this._memoryValidator.getChecksums().size
        };
    }

    enableMemoryValidation() {
        if (!this._memoryValidator) {
            this._memoryValidator = new MemoryValidator({
                enableChecksums: true,
                validationInterval: this._config.memoryValidationInterval
            });
        }
        this._memoryValidator.enable();
    }

    disableMemoryValidation() {
        if (this._memoryValidator) {
            this._memoryValidator.disable();
        }
    }

    serialize() {
        const conceptsData = Array.from(this._concepts.values()).map(concept => ({
            term: concept.term.serialize ? concept.term.serialize() : concept.term.toString(),
            concept: concept.serialize ? concept.serialize() : null
        }));

        return {
            config: this._config,
            concepts: conceptsData,
            focusConcepts: Array.from(this._focusConcepts).map(c => c.term.toString()),
            index: this._index.serialize ? this._index.serialize() : null,
            stats: this._stats,
            resourceTracker: Object.fromEntries(this._resourceManager.getResourceTracker()),
            resourceManagerStats: this._resourceManager.getStats(),
            cyclesSinceConsolidation: this._cyclesSinceConsolidation,
            lastConsolidationTime: this._lastConsolidationTime,
            version: '1.0.0'
        };
    }

    async deserialize(data) {
        try {
            if (!data || !data.concepts) throw new Error('Invalid memory data');

            this.clear();
            if (data.config) this._config = {...this._config, ...data.config};

            for (const conceptData of data.concepts) {
                if (conceptData.concept) {
                    const term = this._resolveTermForDeserialization(conceptData.term);
                    const concept = new Concept(term, this._config);
                    if (concept.deserialize) await concept.deserialize(conceptData.concept);

                    this._concepts.set(term.name, concept);
                    this._stats.totalConcepts++;
                    this._stats.totalTasks += concept.totalTasks || 0;
                    this._index.addConcept(concept);
                }
            }

            if (data.focusConcepts) {
                for (const termStr of data.focusConcepts) {
                    const concept = this._concepts.get(termStr);
                    if (concept) this._focusConcepts.add(concept);
                }
                this._updateFocusConceptsCount();
            }

            if (data.index && this._index.deserialize) await this._index.deserialize(data.index);
            if (data.stats) this._stats = {...data.stats};
            if (data.resourceTracker) this._resourceManager.setResourceTracker(new Map(Object.entries(data.resourceTracker)));

            this._cyclesSinceConsolidation = data.cyclesSinceConsolidation || 0;
            this._lastConsolidationTime = data.lastConsolidationTime || Date.now();

            return true;
        } catch (error) {
            this.logError('Error during memory deserialization:', error);
            return false;
        }
    }

    _resolveTermForDeserialization(termData) {
        if (this._termFactory) return this._termFactory.fromJSON(termData);
        if (typeof termData === 'string') {
             return {
                toString: () => termData,
                equals: (other) => other.toString && other.toString() === termData,
                name: termData,
                type: 'atom',
                isTerm: true
            };
        }
        return termData instanceof Term ? termData : Term.fromJSON(termData);
    }
}
