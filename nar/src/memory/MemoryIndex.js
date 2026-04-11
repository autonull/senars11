import {IndexConfiguration} from './IndexConfiguration.js';
import {PerformanceMonitor} from './PerformanceMonitor.js';
import {ValidationUtils} from './ValidationUtils.js';
import {ValidationRepair} from './ValidationRepair.js';
import {AtomicIndex} from './indexes/AtomicIndex.js';
import {CompoundIndex} from './indexes/CompoundIndex.js';
import {ActivationIndex} from './indexes/ActivationIndex.js';
import {TemporalIndex} from './indexes/TemporalIndex.js';
import {RelationshipIndex} from './indexes/RelationshipIndex.js';
import {ConceptFinder} from './ConceptFinder.js';
import {RelationshipTraversal} from './RelationshipTraversal.js';
import {SimilaritySearch} from './SimilaritySearch.js';
import {MemoryStatsCollector} from './MemoryStatsCollector.js';
import {TemporalQueries} from './TemporalQueries.js';
import {MemoryExporter} from './MemoryExporter.js';

export class MemoryIndex {
    constructor() {
        this._totalConcepts = 0;
        this._config = IndexConfiguration.getDefaultConfig();

        this._atomicIndex = new AtomicIndex(this._config);
        this._compoundIndex = new CompoundIndex(this._config);
        this._activationIndex = new ActivationIndex(this._config);
        this._temporalIndex = new TemporalIndex(this._config);
        this._relationshipIndex = new RelationshipIndex(this._config);

        this._indexes = [
            this._atomicIndex,
            this._compoundIndex,
            this._activationIndex,
            this._temporalIndex,
            this._relationshipIndex
        ];

        this._termIdToConcepts = new Map();
        this._performanceMonitor = new PerformanceMonitor();
        this._validationUtils = new ValidationUtils();

        this._conceptFinder = new ConceptFinder(
            this._atomicIndex, this._compoundIndex, this._activationIndex, this._temporalIndex
        );
        this._relationshipTraversal = new RelationshipTraversal(this._relationshipIndex);
        this._similaritySearch = new SimilaritySearch(this._compoundIndex);
        this._statsCollector = new MemoryStatsCollector(
            this._activationIndex, this._temporalIndex, this._compoundIndex
        );
        this._temporalQueries = new TemporalQueries();
        this._exporter = new MemoryExporter();
    }

    addConcept(concept) {
        const {term} = concept;
        this._totalConcepts++;
        if (term.id) {
            if (!this._termIdToConcepts.has(term.id)) {
                this._termIdToConcepts.set(term.id, []);
            }
            this._termIdToConcepts.get(term.id).push(concept);
        }
        this._indexes.forEach(index => index.add(concept));
    }

    removeConcept(concept) {
        const {term} = concept;
        if (term.id && this._termIdToConcepts.has(term.id)) {
            const concepts = this._termIdToConcepts.get(term.id);
            const index = concepts.indexOf(concept);
            if (index !== -1) {
                concepts.splice(index, 1);
                if (concepts.length === 0) {
                    this._termIdToConcepts.delete(term.id);
                }
            }
        }
        this._indexes.forEach(index => index.remove(concept));
        this._totalConcepts = Math.max(0, this._totalConcepts - 1);
    }

    updateConcept(concept, updates) {
        this.removeConcept(concept);
        Object.assign(concept, updates);
        this.addConcept(concept);
    }

    addConcepts(concepts) {
        for (const concept of concepts) {
            this.addConcept(concept);
        }
    }

    getConcept(termHash) {
        const concepts = this._termIdToConcepts.get(termHash);
        return concepts?.length > 0 ? concepts[concepts.length - 1] : undefined;
    }

    getAllConcepts() {
        const allConcepts = new Set();
        for (const index of this._indexes) {
            if (index?.getAll) {
                for (const concept of index.getAll()) {
                    allConcepts.add(concept);
                }
            }
        }
        return Array.from(allConcepts);
    }

    clear() {
        this._indexes.forEach(index => index?.clear?.());
        this._totalConcepts = 0;
    }

    rebuildIndex(concepts) {
        this.clear();
        for (const concept of concepts) {
            this.addConcept(concept);
        }
    }

    findConceptsWithFilters(filters = {}) {
        return this._conceptFinder.findConceptsWithFilters(filters, () => this.getAllConcepts());
    }

    findConceptsByRelevance(queryTerm, limit = 10) {
        return this._conceptFinder.findConceptsByRelevance(
            queryTerm, limit, () => this.getAllConcepts(),
            (q, c) => this._similaritySearch.calculateRelevanceScore(q, c)
        );
    }

    findRelatedConceptsExtended(term, options = {}) {
        return this._relationshipTraversal.findRelatedConceptsExtended(term, options);
    }

    findRelatedConcepts(term, searchOptions = {}) {
        return this._similaritySearch.findRelatedConcepts(term, searchOptions, () => this.getAllConcepts());
    }

    queryConcepts(query, options = {}) {
        return this._conceptFinder.queryConcepts(
            query, options, () => this.getAllConcepts(),
            (term, limit) => this._conceptFinder.searchConceptsByText(term, limit, () => this.getAllConcepts()),
            (filters) => this._conceptFinder.findConceptsWithFilters(filters, () => this.getAllConcepts())
        );
    }

    getStats() {
        return this._statsCollector.getStats(this._totalConcepts, () => this.getAllConcepts(), this._getIndexDetails());
    }

    getConceptDistribution() {
        return this._statsCollector.getConceptDistribution(this._totalConcepts, () => this.getAllConcepts());
    }

    getMostActiveConcepts(limit = 10) {
        return this._conceptFinder.getMostActiveConcepts(limit, () => this.getAllConcepts());
    }

    getRecentConcepts(limit = 10) {
        return this._conceptFinder.getRecentConcepts(limit, () => this.getAllConcepts());
    }

    getConceptsByTimePeriod(period = 'day') {
        return this._temporalQueries.getConceptsByTimePeriod(period, () => this.getAllConcepts());
    }

    export(format = 'json') {
        return this._exporter.export(format, () => this.getAllConcepts(), () => this.getStats(), this._config);
    }

    findInheritanceConcepts(term) {
        return this._relationshipTraversal.findInheritanceConcepts(term);
    }

    findImplicationConcepts(term) {
        return this._relationshipTraversal.findImplicationConcepts(term);
    }

    findSimilarityConcepts(term) {
        return this._relationshipTraversal.findSimilarityConcepts(term);
    }

    findRelationshipConcepts(relationshipType, additionalCriteria = {}) {
        return this._relationshipTraversal.findRelationshipConcepts(relationshipType, additionalCriteria);
    }

    findConceptsByOperator(operator) {
        return this._conceptFinder.findConceptsByOperator(operator);
    }

    findConceptsByComplexity(level) {
        return this._conceptFinder.findConceptsByComplexity(level);
    }

    findConceptsByCategory(category) {
        return this._conceptFinder.findConceptsByCategory(category);
    }

    findConceptsByActivation(minActivation, maxActivation) {
        return this._conceptFinder.findConceptsByActivation(minActivation, maxActivation);
    }

    findConceptsByComponent(componentTerm) {
        return this._conceptFinder.findConceptsByComponent(componentTerm);
    }

    findConceptsByTemporal(createdAfter, createdBefore) {
        return this._conceptFinder.findConceptsByTemporal(createdAfter, createdBefore);
    }

    findAtomicConcepts(name) {
        return this._conceptFinder.findAtomicConcepts(name);
    }

    startPerformanceMonitoring(interval) {
        this._performanceMonitor.startMonitoring(null, interval);
    }

    stopPerformanceMonitoring() {
        this._performanceMonitor.stopMonitoring();
    }

    getPerformanceStats() {
        return this._performanceMonitor.getPerformanceStats(this._getIndexStats());
    }

    optimizePerformance() {
        return this._performanceMonitor.optimize();
    }

    optimize() {
    }

    startAutoValidation(interval) {
        this._validationUtils.startAutoValidation(null, interval);
    }

    stopAutoValidation() {
        this._validationUtils.stopAutoValidation();
    }

    validate() {
        return this._validationUtils.validate(this._getIndexStats(), console);
    }

    repair() {
        return ValidationRepair.repair(this._getIndexStats(), this._validationUtils, console);
    }

    registerValidationRule(name, ruleFn) {
        this._validationUtils.registerValidationRule(name, ruleFn);
    }

    unregisterValidationRule(name) {
        return this._validationUtils.unregisterValidationRule(name);
    }

    getValidationStats() {
        return this._validationUtils.getValidationStats(this._getIndexStats());
    }

    _getIndexDetails() {
        return Object.fromEntries(
            ['atomic', 'compound', 'activation', 'temporal', 'relationship']
                .map(name => [name, this[`_${name}Index`].constructor.name])
        );
    }

    _getIndexStats() {
        return {
            atomic: {size: this._atomicIndex.getAll().length},
            compound: {size: this._compoundIndex.getAll().length},
            activation: {size: this._activationIndex.getAll().length},
            temporal: {size: this._temporalIndex.getAll().length},
            relationship: {size: this._relationshipIndex.getAll().length}
        };
    }
}
