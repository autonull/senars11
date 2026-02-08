import {Bag} from '../memory/Bag.js';
import {Task} from '../task/Task.js';
import {Logger} from '../util/Logger.js';

/**
 * Strategy component handles premise pairing and budget management.
 *
 * Supports multiple premise formation strategies:
 * - DecompositionStrategy: extracts subterms for pairing
 * - TermLinkStrategy: uses conceptual associations
 * - TaskMatchStrategy: pairs with existing tasks
 *
 * Strategies are mixed via priority-weighted Bag sampling.
 */
export class Strategy {
    /**
     * @param {object} config - Configuration options
     * @param {number} config.maxSecondaryPremises - Max secondary premises per primary
     * @param {number} config.candidateBagSize - Size of candidate collection bag
     * @param {boolean} config.adaptivePriorities - Enable adaptive strategy priority adjustment
     */
    constructor(config = {}) {
        this.config = {
            maxSecondaryPremises: config.maxSecondaryPremises || 10,
            candidateBagSize: config.candidateBagSize || 50,
            adaptivePriorities: config.adaptivePriorities ?? true,
            ...config
        };

        // Store the focus or memory reference if provided in config
        this.focus = config.focus || null;
        this.memory = config.memory || null;
        this.termFactory = config.termFactory || null;

        // Legacy sub-strategies (for backward compatibility)
        this.strategies = [];

        // NEW: Premise formation strategies with priority-weighted sampling
        this.formationStrategies = [];

        // NEW: Candidate bag for priority-sampled collection
        this.candidateBag = new Bag(this.config.candidateBagSize, 'priority');
    }

    /**
     * Add a premise formation strategy.
     * @param {PremiseFormationStrategy} strategy - The formation strategy
     */
    addFormationStrategy(strategy) {
        this.formationStrategies.push(strategy);
    }

    addStrategy(strategy) {
        this.strategies.push(strategy);
    }


    async ask(task) {
        for (const strategy of this.strategies) {
            if (typeof strategy.ask === 'function') {
                const result = await strategy.ask(task);
                if (result && result.length > 0) {
                    return result;
                }
            }
        }
        return null;
    }

    /**
     * Generate premise pairs from a stream of primary premises
     * @param {AsyncGenerator<Task>} premiseStream - Stream of primary premises
     * @returns {AsyncGenerator<Array<Task>>} - Stream of premise pairs [primary, secondary]
     */
    async* generatePremisePairs(premiseStream) {
        try {
            for await (const primaryPremise of premiseStream) {
                try {
                    // Select secondary premises based on strategy
                    const secondaryPremises = await this.selectSecondaryPremises(primaryPremise);

                    // Yield pairs of primary and secondary premises
                    for (const secondaryPremise of secondaryPremises) {
                        yield [primaryPremise, secondaryPremise];
                    }
                } catch (error) {
                    Logger.error('Error processing primary premise in Strategy:', error);
                    // Continue to next premise rather than failing completely

                }
            }
        } catch (error) {
            Logger.error('Error in Strategy generatePremisePairs:', error);
            // Re-throw to allow upstream handling
            throw error;
        }
    }

    /**
     * Select secondary premises for a given primary premise.
     * Uses premise formation strategies with Bag-based priority sampling.
     * @param {Task} primaryPremise - The primary premise
     * @param {Object} availableTasks - Optional available tasks context with indices
     * @returns {Promise<Array<Task>>} - Array of secondary premises
     */
    async selectSecondaryPremises(primaryPremise, availableTasks = null) {
        try {
            // Clear previous candidates
            this.candidateBag.clear();

            const context = this._getFormationContext(availableTasks);

            // Phase 1: Collect candidates from formation strategies
            if (this.formationStrategies.length > 0) {
                for (const strategy of this.formationStrategies) {
                    if (!strategy.enabled) continue;

                    try {
                        for await (const candidate of strategy.generateCandidates(primaryPremise, context)) {
                            // Add candidate to bag with priority
                            const candidateEntry = {
                                ...candidate,
                                strategy: strategy,
                                budget: {priority: candidate.priority || 0.5},
                                toString: () => candidate.term?.name || 'candidate'
                            };
                            this.candidateBag.add(candidateEntry);
                        }
                    } catch (strategyError) {
                        Logger.debug(`Formation strategy error: ${strategyError.message}`);
                    }
                }
            }

            // Phase 2: Legacy delegate to sub-strategies (backward compatibility)
            const legacyResults = [];
            for (const strategy of this.strategies) {
                if (typeof strategy.selectSecondaryPremises === 'function') {
                    const strategyResults = await strategy.selectSecondaryPremises(primaryPremise);
                    if (strategyResults?.length > 0) {
                        legacyResults.push(...strategyResults);
                    }
                }
            }

            // Phase 3: Fallback to default selection if no formation strategies or candidates
            if (this.candidateBag.size === 0 && legacyResults.length === 0) {
                if (this.config.premiseSelector) {
                    const selectorResults = await this.config.premiseSelector.select(primaryPremise);
                    if (selectorResults) return selectorResults.slice(0, this.config.maxSecondaryPremises);
                }
                return this._selectDefaultSecondaryPremises(primaryPremise);
            }

            // Phase 4: Convert candidates to tasks and merge with legacy results
            const candidateTasks = this.candidateBag.getItemsInPriorityOrder()
                .slice(0, this.config.maxSecondaryPremises)
                .map(candidate => this._candidateToTask(candidate, primaryPremise))
                .filter(Boolean);

            // Merge with legacy results, prioritizing formation strategy candidates
            const allResults = [...candidateTasks, ...legacyResults];

            // Deduplicate by term name
            const seen = new Set();
            const uniqueResults = allResults.filter(task => {
                const key = task?.term?.name || task?.term?.toString?.() || '';
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            return uniqueResults.slice(0, this.config.maxSecondaryPremises || 20);
        } catch (error) {
            Logger.error('Error in selectSecondaryPremises:', error);
            return [];
        }
    }

    /**
     * Get context for formation strategies.
     * @private
     */
    _getFormationContext(availableTasks = null) {
        return {
            termFactory: this.termFactory || this.config.termFactory,
            memory: this.memory,
            focus: this.focus,
            termLayer: this.memory?.termLayer,
            availableTasks: availableTasks
        };
    }

    /**
     * Convert a candidate to a Task for use as a secondary premise.
     * @private
     */
    _candidateToTask(candidate, primaryPremise) {
        // If candidate has sourceTask, use it directly (from TaskMatchStrategy)
        if (candidate.sourceTask) {
            return candidate.sourceTask;
        }

        // For decomposed terms, we MUST find an existing task.
        // We cannot create a synthetic belief because decomposition does not imply truth.
        // e.g. (A ==> B) decomposes to A and B, but does not imply A or B is true.
        if (candidate.term) {
            return this._findTaskForTerm(candidate.term);
        }

        return null;
    }

    /**
     * Find an existing task for a term in focus or memory.
     * @private
     */
    _findTaskForTerm(term) {
        // Check focus first
        if (this.focus) {
            // This assumes focus has a way to get a task by term, or we iterate.
            // focus.getTask(term) would be ideal.
            // If not, we might need to iterate or rely on Term's unique ID if focus is a Map.
            // For now, let's assume we can't easily query focus by term without iteration
            // unless we add a method to Focus.
            // But we can check the candidateBag if it was populated by TaskMatchStrategy?
            // No, TaskMatchStrategy populates based on matching.

            // Let's try to find it in the available tasks (which might be expensive but correct)
            // Optimization: Focus usually has a limited size.
            const tasks = this.focus.getTasks();
            const found = tasks.find(t => t.term.equals(term));
            if (found) return found;
        }

        // Check memory
        if (this.memory) {
            // Memory usually has concepts indexed by term.
            // concept = memory.getConcept(term)
            if (this.memory.getConcept) {
                const concept = this.memory.getConcept(term);
                if (concept) {
                    // Return the most relevant task from the concept (e.g. highest confidence belief)
                    return concept.getBelief ? concept.getBelief() : null;
                }
            }
        }

        return null;
    }


    /**
     * Default selection logic for NAL premises
     * @private
     */
    _selectDefaultSecondaryPremises(primaryPremise) {
        // Get tasks from focus or memory that could pair with the primary premise
        let allTasks = this._getAvailableTasks();

        // Filter tasks to find those that could be meaningfully paired with the primary premise
        const validSecondaryTasks = allTasks.filter(task =>
            task &&
            task !== primaryPremise &&  // Don't pair a task with itself
            task.term &&  // Has a valid term
            task.term !== primaryPremise.term  // Different terms
        );

        // Prioritize secondary premises that are likely to form syllogistic patterns
        return this._prioritizeCompatibleTasks(primaryPremise, validSecondaryTasks);
    }

    /**
     * Get tasks from focus or memory based on availability
     * @private
     */
    _getAvailableTasks() {
        // Try to get tasks from focus - get all tasks to enable fair sampling
        if (this.focus) {
            return this.focus.getTasks(1000); // Get all tasks in focus to enable fair roulette sampling
        }
        // Get tasks from memory concepts if focus is not available
        else if (this.memory && typeof this.memory.getAllConcepts === 'function') {
            return this.memory.getAllConcepts()
                .flatMap(concept => concept.getTasks ? concept.getTasks() : [])
                .slice(0, 1000); // Get up to 1000 tasks to enable fair sampling
        }

        return [];
    }

    /**
     * Prioritize tasks that are compatible with the primary premise for rule application
     * @param {Task} primaryPremise - The primary premise
     * @param {Array<Task>} secondaryTasks - Array of potential secondary premises
     * @returns {Array<Task>} - Prioritized array of compatible tasks
     */
    _prioritizeCompatibleTasks(primaryPremise, secondaryTasks) {
        if (!primaryPremise?.term?.components || !Array.isArray(secondaryTasks)) {
            return secondaryTasks;
        }

        // Identify the syllogistic compatibility based on matching terms
        const primaryComponents = primaryPremise.term.components;
        if (primaryComponents?.length !== 2) {
            return secondaryTasks;
        }

        const [primarySubject, primaryObject] = primaryComponents;

        // Use reduce to categorize tasks in a single pass for better performance
        const {highlyCompatible, compatible, lessCompatible} = secondaryTasks.reduce(
            (acc, task) => {
                const category = this._categorizeTaskCompatibility(task, primarySubject, primaryObject);
                acc[category].push(task);
                return acc;
            },
            {highlyCompatible: [], compatible: [], lessCompatible: []}
        );

        // Return in order: highly compatible first, then compatible, then less compatible
        return [...highlyCompatible, ...compatible, ...lessCompatible];
    }

    /**
     * Check if two terms are equal using proper Term comparison
     * @private
     */
    _termsEqual(t1, t2) {
        if (!t1 || !t2) return false;
        if (typeof t1.equals === 'function') {
            return t1.equals(t2);
        }
        // Fallback for non-Term objects
        const name1 = t1.name || t1._name || t1.toString?.() || '';
        const name2 = t2.name || t2._name || t2.toString?.() || '';
        return name1 === name2;
    }

    /**
     * Categorize a task's compatibility with the primary premise
     * @private
     */
    _categorizeTaskCompatibility(task, primarySubject, primaryObject) {
        if (!task?.term?.components || task.term.components.length !== 2) {
            return 'lessCompatible';
        }

        const [secondarySubject, secondaryObject] = task.term.components;

        // Check for syllogistic patterns:
        // Pattern 1: primary=(S->M), secondary=(M->P) where primaryObject = secondarySubject (M term matches)
        // Pattern 2: primary=(M->P), secondary=(S->M) where primarySubject = secondaryObject (M term matches)
        const pattern1 = this._termsEqual(primaryObject, secondarySubject);  // primary ends where secondary starts
        const pattern2 = this._termsEqual(primarySubject, secondaryObject);  // primary starts where secondary ends

        if (pattern1 || pattern2) {
            return 'highlyCompatible';  // These are most likely to generate syllogistic derivations
        }

        // Check for other types of compatibility
        const hasCommonTerms = this._termsEqual(primarySubject, secondarySubject) ||
            this._termsEqual(primarySubject, secondaryObject) ||
            this._termsEqual(primaryObject, secondarySubject) ||
            this._termsEqual(primaryObject, secondaryObject);

        return hasCommonTerms ? 'compatible' : 'lessCompatible';
    }

    /**
     * Get status information about the strategy
     * @returns {object} Status information
     */
    getStatus() {
        return {
            config: this.config,
            type: this.constructor.name,
            timestamp: Date.now()
        };
    }
}
