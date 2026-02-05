import { NAR } from './nar/NAR.js';
import { Logger } from './util/Logger.js';

/**
 * SeNARS Facade - A simplified API for SeNARS reasoning system
 * 
 * The goal is to provide a friction-free API that allows users to quickly
 * experience SeNARS value in under 60 seconds.
 * 
 * @example
 * import { SeNARS } from 'senars';
 * 
 * const brain = new SeNARS();
 * brain.learn('(cats --> mammals).');
 * brain.learn('(mammals --> animals).');
 * 
 * const answer = await brain.ask('(cats --> animals)?');
 * // → { answer: true, confidence: 0.85, proof: [...] }
 */
export class SeNARS {
    constructor(config = {}) {
        // Use sensible defaults for a simple user experience
        this.nar = new NAR({
            // Default configuration for ease of use
            lm: {
                enabled: false, // Disable LM by default for simplicity
                ...config.lm
            },
            memory: {
                capacity: 1000,
                ...config.memory
            },
            // Override with user config
            ...config
        });

        // Auto-initialize for friction-free experience
        this._initialized = false;
        this._initPromise = null;
    }

    async _initialize() {
        // If already initialized or initialization in progress, return/wait
        if (this._initialized) {
            return;
        }
        if (this._initPromise) {
            return this._initPromise;
        }

        // Create initialization promise
        this._initPromise = (async () => {
            try {
                await this.nar.initialize();
                this._initialized = true;
            } catch (error) {
                Logger.error('Failed to initialize SeNARS:', error);
                this._initPromise = null; // Reset on error so it can be retried
                throw error;
            }
        })();

        return this._initPromise;
    }

    /**
     * Learn a fact or belief in Narsese format
     * @param {string} narsese - The Narsese statement to learn (e.g., '(cats --> mammals).')
     * @returns {Promise<boolean>} - Whether the learning was successful
     */
    async learn(narsese) {
        if (!this._initialized) {
            await this._initialize();
        }

        try {
            await this.nar.input(narsese);
            return true;
        } catch (error) {
            Logger.error('Learning failed:', error);
            return false;
        }
    }

    /**
     * Ask a question in Narsese format
     * @param {string} narsese - The Narsese question (e.g., '(cats --> animals)?')
     * @param {Object} options - Options for asking (cycles: number of reasoning cycles to run)
     * @returns {Promise<Object>} - Result with answer, confidence, and proof chain
     */
    async ask(narsese, options = {}) {
        if (!this._initialized) {
            await this._initialize();
        }

        const cycles = options.cycles ?? 20;

        try {
            // Input the question
            await this.nar.input(narsese);

            // Run reasoning cycles to derive answers
            if (cycles > 0) {
                await this.nar.runCycles(cycles);
            }

            // Get all beliefs
            const allBeliefs = this.nar.getBeliefs();

            // Extract key terms from the question - e.g. "(penguin --> flyer)?" => ["penguin", "flyer"]
            const keyTerms = narsese
                .replace(/[()?.!]/g, '')
                .split(/--?>|<->|==>/)
                .map(s => s.trim())
                .filter(s => s.length > 0);

            // Find beliefs where the term string contains ALL key terms
            // This follows the pattern from integration tests
            const matchingBeliefs = allBeliefs.filter(b => {
                const beliefStr = b.term?.toString() || '';
                return keyTerms.every(term => beliefStr.includes(term));
            });

            // Find the best matching belief
            let answer = false;
            let confidence = 0;
            let frequency = 0;

            if (matchingBeliefs && matchingBeliefs.length > 0) {
                const bestBelief = matchingBeliefs.reduce((best, current) => {
                    const currentConf = current.truth?.c ?? 0;
                    const bestConf = best.truth?.c ?? 0;
                    return currentConf > bestConf ? current : best;
                }, matchingBeliefs[0]);

                if (bestBelief?.truth) {
                    frequency = bestBelief.truth.f;
                    confidence = bestBelief.truth.c;
                    answer = frequency > 0.5;
                }
            }

            return {
                answer,
                confidence,
                frequency,
                proof: this._getRecentProofChain(),
                timestamp: Date.now()
            };
        } catch (error) {
            Logger.error('Question failed:', error);
            return {
                answer: null,
                confidence: 0,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Get recent proof chain for the latest reasoning
     * @private
     */
    _getRecentProofChain() {
        // Get recent derivations from the stream reasoner
        if (this.nar.streamReasoner?.metrics?.recentDerivations) {
            return this.nar.streamReasoner.metrics.recentDerivations.slice(-10).map(d => ({
                term: d.term?.toString() || 'unknown',
                rule: d.rule || 'unknown',
                truth: d.truth || { f: 0, c: 0 }
            }));
        }
        return [];
    }

    /**
     * Query the system for beliefs about a term
     * @param {string} term - The term to query
     * @returns {Array} - Array of beliefs about the term
     */
    query(term) {
        return this.nar.getBeliefs(term);
    }

    /**
     * Get all current beliefs in the system
     * @returns {Array} - Array of all beliefs
     */
    getBeliefs() {
        return this.nar.getBeliefs();
    }

    /**
     * Reset the reasoning system
     */
    reset() {
        this.nar.reset();
    }

    /**
     * Start the reasoning process
     */
    async start() {
        if (!this._initialized) {
            await this._initialize();
        }
        return this.nar.start();
    }

    /**
     * Stop the reasoning process
     */
    stop() {
        return this.nar.stop();
    }

    /**
     * Perform a single reasoning step
     */
    async step() {
        if (!this._initialized) {
            await this._initialize();
        }
        return this.nar.step();
    }

    /**
     * Run multiple reasoning cycles
     * @param {number} count - Number of cycles to run
     */
    async runCycles(count) {
        if (!this._initialized) {
            await this._initialize();
        }
        return this.nar.runCycles(count);
    }

    /**
     * Get system statistics
     */
    getStats() {
        return this.nar.getStats();
    }

    /**
     * Get the underlying NAR instance (for advanced users)
     */
    getNAR() {
        return this.nar;
    }

    /**
     * Cleanup resources
     */
    async dispose() {
        if (this.nar) {
            await this.nar.dispose();
        }
    }
}