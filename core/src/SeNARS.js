import { NAR } from './nar/NAR.js';
import { Logger } from './util/Logger.js';
import { Unifier } from './term/Unifier.js';

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

        this._initPromise = (async () => {
            try {
                await this.nar.initialize();
                this._initialized = true;
                // Initialize unifier using the NAR's term factory
                if (this.nar._termFactory) {
                    this._unifier = new Unifier(this.nar._termFactory);
                }
            } catch (error) {
                Logger.error('Failed to initialize SeNARS:', error);
                this._initPromise = null;
                throw error;
            }
        })();

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
            // Parse the question first to get the term pattern
            let questionTerm = null;
            if (this.nar._parser) {
                const parsed = this.nar._parser.parse(narsese);
                questionTerm = parsed.term;
            }

            await this.nar.input(narsese);

            if (cycles > 0) {
                await this.nar.runCycles(cycles);
            }

            const allBeliefs = this.nar.getBeliefs();
            let matchingBeliefs = [];

            if (questionTerm && this._unifier) {
                // Use unification to find matching beliefs
                matchingBeliefs = allBeliefs.filter(b => {
                    const result = this._unifier.match(questionTerm, b.term);
                    return result.success;
                });
            } else {
                // Fallback to string matching if parser/unifier not available
                const keyTerms = this._extractKeyTerms(narsese);
                matchingBeliefs = allBeliefs.filter(b => {
                    const beliefStr = b.term?.toString() || '';
                    return keyTerms.every(term => beliefStr.includes(term));
                });
            }

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

    _extractKeyTerms(narsese) {
        return narsese
            .replace(/[()?.!]/g, '')
            .split(/--?>|<->|==>/)
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
