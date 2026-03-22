import {Bag} from '../memory/Bag.js';
import {Logger} from '../util/Logger.js';
import {StrategyHelper} from './strategy/StrategyHelper.js';
import {DefaultFormationStrategy} from './strategy/DefaultFormationStrategy.js';

/**
 * Strategy component handles premise pairing and budget management.
 * 
 * Uses a formation strategy framework with candidateBag for collecting and selecting
 * secondary premises. Subclasses may override this behavior:
 * - BagStrategy: Uses a simpler priority-sampled bag approach (bypasses formation strategies)
 */
export class Strategy {
    constructor(config = {}) {
        this.config = {
            maxSecondaryPremises: config.maxSecondaryPremises || 10,
            candidateBagSize: config.candidateBagSize || 50,
            adaptivePriorities: config.adaptivePriorities ?? true,
            ...config
        };

        this.focus = config.focus || null;
        this.memory = config.memory || null;
        this.termFactory = config.termFactory || null;

        this.strategies = [];
        this.formationStrategies = [];
        this.candidateBag = new Bag(this.config.candidateBagSize, 'priority');

        // Add default strategy
        this.addFormationStrategy(new DefaultFormationStrategy(this.config));
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
                    const secondaryPremises = await this.selectSecondaryPremises(primaryPremise);
                    for (const secondaryPremise of secondaryPremises) {
                        yield [primaryPremise, secondaryPremise];
                    }
                } catch (error) {
                    Logger.error('Error processing primary premise in Strategy:', error);
                }
            }
        } catch (error) {
            Logger.error('Error in Strategy generatePremisePairs:', error);
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

            // Phase 3: Convert candidates to tasks and merge with legacy results
            const candidateTasks = this.candidateBag.getItemsInPriorityOrder()
                .slice(0, this.config.maxSecondaryPremises)
                .map(candidate => StrategyHelper.candidateToTask(candidate, primaryPremise, context))
                .filter(Boolean);

            const allResults = [...candidateTasks, ...legacyResults];

            // Deduplicate
            const seen = new Set();
            return allResults.filter(task => {
                const key = task?.term?.name || task?.term?.toString?.() || '';
                return !seen.has(key) && seen.add(key);
            }).slice(0, this.config.maxSecondaryPremises || 20);
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
