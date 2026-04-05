/**
 * Metacognition rules for the stream reasoner system.
 * These rules implement self-optimization and self-modification capabilities.
 */

import {Rule} from '../../Rule.js';
import {logError} from '../../utils/error.js';

/**
 * A rule that adjusts system parameters based on performance feedback
 */
export class AdjustCacheSizeRule extends Rule {
    constructor(config = {}) {
        super('metacognition-adjust-cache-size', 'metacognition', 0.9, config);
    }

    canApply(primaryPremise, secondaryPremise, context) {
        // Check if the premise indicates low cache hit rate
        return primaryPremise?.term?.name === '((SELF, has_property, low_cache_hit_rate) --> TRUE)' ||
            (primaryPremise?.term?.toString && primaryPremise.term.toString().includes('low_cache_hit_rate'));
    }

    apply(primaryPremise, secondaryPremise, context = {}) {
        if (!this.canApply(primaryPremise, secondaryPremise, context)) {return [];}

        try {
            const {termFactory} = context;
            if (termFactory?.getCacheSize) {
                const newCacheSize = Math.floor(termFactory.getCacheSize() * 1.2);

                if (context.nar) {
                    context.nar.config.set('termFactory.maxCacheSize', newCacheSize);
                    if (termFactory.setMaxCacheSize) {
                        termFactory.setMaxCacheSize(newCacheSize);
                    } else {
                        termFactory._maxCacheSize = newCacheSize;
                    }
                    context.nar.logInfo?.(`Adjusted TermFactory cache size to ${newCacheSize}`);
                }
            }
            return [];
        } catch (error) {
            logError(error, {ruleId: this.id, context: 'adjust_cache_size_rule_application'}, 'error');
            return [];
        }
    }
}

/**
 * Export the metacognition rules as an array for registration
 */
export const MetacognitionRules = [
    AdjustCacheSizeRule,
];

export default MetacognitionRules;