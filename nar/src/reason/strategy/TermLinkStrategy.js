/**
 * @file TermLinkStrategy.js
 * @description Premise formation strategy that uses TermLayer links for candidates.
 *
 * This strategy leverages existing term associations in the TermLayer
 * to find premise candidates based on conceptual links.
 */

import {PremiseFormationStrategy} from './PremiseFormationStrategy.js';

/**
 * Strategy that uses TermLayer links for premise candidate generation.
 *
 * When a task involves term A, this strategy yields all terms linked to A
 * in the TermLayer, enabling associative premise formation.
 */
export class TermLinkStrategy extends PremiseFormationStrategy {
    /**
     * @param {object} config - Configuration options
     * @param {number} config.maxLinks - Maximum links to yield per term
     * @param {number} config.minLinkPriority - Minimum link priority to consider
     */
    constructor(config = {}) {
        super(config);
        Object.assign(this, {
            maxLinks: config.maxLinks ?? 20,
            minLinkPriority: config.minLinkPriority ?? 0.1
        });
    }

    /**
     * Generate candidates from the TermLayer based on term links.
     * @param {Task} primaryTask - The primary premise task
     * @param {object} context - Context with termLayer
     * @yields {{term: Term, type: string, priority: number, linkData: object}}
     */
    async* generateCandidates(primaryTask, context) {
        if (!this.enabled) return;

        const {termLayer} = context;
        const term = primaryTask?.term;
        if (!termLayer || !term) return;

        // Get direct links from the primary term
        yield* this._getLinksForTerm(term, termLayer);

        // Also get links from subject/predicate if compound
        if (term.isCompound) {
            if (term.subject) yield* this._getLinksForTerm(term.subject, termLayer);
            if (term.predicate) yield* this._getLinksForTerm(term.predicate, termLayer);
        }
    }

    /**
     * Get links for a specific term from the TermLayer.
     * @private
     */
    * _getLinksForTerm(sourceTerm, termLayer) {
        const links = termLayer.get(sourceTerm);
        if (!links || links.length === 0) return;

        let count = 0;
        for (const link of links) {
            if (count >= this.maxLinks) break;

            const linkPriority = link.data?.priority ?? 0.5;
            if (linkPriority < this.minLinkPriority) continue;

            this._recordCandidate();
            yield {
                term: link.target,
                type: 'term-link',
                priority: linkPriority * this.priority,
                linkData: link.data,
                sourceTerm: sourceTerm
            };
            count++;
        }
    }

    toString() {
        return `TermLinkStrategy(priority=${this.priority}, maxLinks=${this.maxLinks})`;
    }
}
