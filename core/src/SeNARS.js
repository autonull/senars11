import { NAR } from './nar/NAR.js';
import { Logger } from './util/Logger.js';
import { Unifier } from './term/Unifier.js';
import { IntrospectionEvents } from './util/IntrospectionEvents.js';

/**
 * SeNARS Facade - A simplified API for SeNARS reasoning system
 */
export class SeNARS {
    constructor(config = {}) {
        this.nar = new NAR({
            lm: {
                enabled: false,
                ...config.lm
            },
            memory: {
                capacity: 1000,
                ...config.memory
            },
            ...config
        });

        this._initialized = false;
        this._initPromise = null;
        this._unifier = null;
    }

    async _initialize() {
        if (this._initialized) return;
        if (this._initPromise) return this._initPromise;

        this._initPromise = this.nar.initialize()
            .then(() => {
                this._initialized = true;
                // Initialize unifier using the NAR's term factory
                if (this.nar._termFactory) {
                    this._unifier = new Unifier(this.nar._termFactory);
                }
            })
            .catch(error => {
                Logger.error('Failed to initialize SeNARS:', error);
                this._initPromise = null;
                throw error;
            });

        return this._initPromise;
    }

    async learn(narsese) {
        await this._ensureInitialized();
        try {
            await this.nar.input(narsese);
            return true;
        } catch (error) {
            Logger.error('Learning failed:', error);
            return false;
        }
    }

    /**
     * Ask a question to the system.
     * Supports variable unification (e.g., "(like, num:1, ?what)?").
     * @param {string} narsese - The question in Narsese format.
     * @param {Object} options - Options for the query.
     * @returns {Promise<Object>} - The answer with confidence and proof.
     */
    async ask(narsese, options = {}) {
        await this._ensureInitialized();
        const cycles = options.cycles ?? 20;

        try {
            const questionTerm = this._parseTerm(narsese);

            await this.nar.input(narsese);

            if (cycles > 0) {
                await this.nar.runCycles(cycles);
            }

            const matchingBeliefs = this._findMatchingBeliefs(questionTerm, narsese);

            let answer = false;
            let confidence = 0;
            let frequency = 0;
            let bestSubstitution = {};
            let bestBeliefTerm = null;

            if (matchingBeliefs?.length > 0) {
                const bestBelief = matchingBeliefs.reduce((best, current) => {
                    return (current.truth?.c ?? 0) > (best.truth?.c ?? 0) ? current : best;
                }, matchingBeliefs[0]);

                if (bestBelief?.truth) {
                    frequency = bestBelief.truth.f;
                    confidence = bestBelief.truth.c;
                    answer = frequency > 0.5;
                    bestBeliefTerm = bestBelief.term?.toString();

                    // Get the substitution for the best answer if using unification
                    if (questionTerm && this._unifier) {
                         const matchResult = this._unifier.match(questionTerm, bestBelief.term);
                         if (matchResult.success) {
                             bestSubstitution = matchResult.substitution;
                         }
                    }
                }
            }

            return {
                answer,
                confidence,
                frequency,
                substitution: bestSubstitution,
                term: bestBeliefTerm,
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
     * Attempt to achieve a goal.
     * @param {string} narsese - The goal statement (will append '!' if missing).
     * @param {Object} options - Options (cycles, threshold).
     * @returns {Promise<Object>} - Status of goal achievement.
     */
    async achieve(narsese, options = {}) {
        await this._ensureInitialized();
        const cycles = options.cycles ?? 50;
        const threshold = options.threshold ?? 0.8;

        const goalInput = narsese.trim().endsWith('!') ? narsese : `${narsese.replace(/[?.!]$/, '')}!`;

        try {
            const goalTerm = this._parseTerm(goalInput);

            const executedOperations = [];
            const opListener = (event) => {
                // Handle different event structures
                let task = event.task || event.payload?.task;

                if (task) {
                    // Check if it's an operation
                    const term = task.term;
                    const isOp = term?.isOperation || term?.toString().startsWith('^');

                    if (isOp) {
                        executedOperations.push(term.toString());
                    }
                }
            };

            this.nar.on(IntrospectionEvents.TASK_ADDED, opListener);

            try {
                await this.nar.input(goalInput);

                if (cycles > 0) {
                    await this.nar.runCycles(cycles);
                }
            } finally {
                this.nar.off(IntrospectionEvents.TASK_ADDED, opListener);
            }

            // Check if goal is satisfied (belief exists with high expectation)
            // Note: NARS handles goal processing internally, but we can peek at beliefs
            // to see if the system *believes* the goal condition is met.

            const matchingBeliefs = this._findMatchingBeliefs(goalTerm, goalInput);

            let achieved = false;
            let bestTruth = { f: 0, c: 0 };
            let bestTerm = null;

            if (matchingBeliefs.length > 0) {
                const bestBelief = matchingBeliefs.reduce((best, current) => {
                     // Using expectation: e = c * (f - 0.5) + 0.5
                     const expCurrent = (current.truth?.c ?? 0) * ((current.truth?.f ?? 0) - 0.5) + 0.5;
                     const expBest = (best.truth?.c ?? 0) * ((best.truth?.f ?? 0) - 0.5) + 0.5;
                     return expCurrent > expBest ? current : best;
                }, matchingBeliefs[0]);

                if (bestBelief) {
                    bestTruth = bestBelief.truth;
                    bestTerm = bestBelief.term?.toString();
                    const expectation = (bestTruth.c) * (bestTruth.f - 0.5) + 0.5;
                    // Usually "achieved" means expectation > threshold (e.g. > 0.5 or higher)
                    // Or if simple truth: f > 0.5 and c > threshold
                    achieved = expectation > threshold || (bestTruth.f > 0.8 && bestTruth.c > 0.5);
                }
            }

            return {
                achieved,
                term: bestTerm,
                truth: bestTruth,
                executedOperations,
                cyclesRun: cycles,
                timestamp: Date.now()
            };

        } catch (error) {
            Logger.error('Achieve failed:', error);
             return {
                achieved: false,
                error: error.message
            };
        }
    }

    _parseTerm(narsese) {
        if (this.nar._parser) {
            try {
                const parsed = this.nar._parser.parse(narsese);
                return parsed.term;
            } catch (e) {
                // Parse error is expected if narsese is invalid or partial, input() will handle full error reporting
                return null;
            }
        }
        return null;
    }

    _findMatchingBeliefs(term, narseseFallback) {
        const allBeliefs = this.nar.getBeliefs();

        if (term && this._unifier) {
            return allBeliefs.filter(b => {
                const result = this._unifier.match(term, b.term);
                return result.success;
            });
        }

        const keyTerms = this._extractKeyTerms(narseseFallback);
        return allBeliefs.filter(b => {
            const beliefStr = b.term?.toString() || '';
            return keyTerms.every(t => beliefStr.includes(t));
        });
    }

    _extractKeyTerms(narsese) {
        return narsese
            .replace(/[()?!]/g, '') // Remove structural chars but keep dots inside numbers if any
            .replace(/\.$/, '')    // Remove trailing dot
            .split(/--?>|<->|==>/) // Split by relations
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }

    async _ensureInitialized() {
        if (!this._initialized) {
            await this._initialize();
        }
    }

    _getRecentProofChain() {
        const derivations = this.nar.streamReasoner?.metrics?.recentDerivations;
        if (derivations) {
            return derivations.slice(-10).map(d => ({
                term: d.term?.toString() || 'unknown',
                rule: d.rule || 'unknown',
                truth: d.truth || { f: 0, c: 0 }
            }));
        }
        return [];
    }

    query(term) { return this.nar.getBeliefs(term); }
    getBeliefs() { return this.nar.getBeliefs(); }
    reset() { this.nar.reset(); }

    async start() {
        await this._ensureInitialized();
        return this.nar.start();
    }

    stop() { return this.nar.stop(); }

    async step() {
        await this._ensureInitialized();
        return this.nar.step();
    }

    async runCycles(count) {
        await this._ensureInitialized();
        return this.nar.runCycles(count);
    }

    getStats() { return this.nar.getStats(); }
    getNAR() { return this.nar; }

    async dispose() {
        if (this.nar) {
            await this.nar.dispose();
        }
    }
}
