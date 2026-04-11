/**
 * Re-exports from @senars/core for convenience within nar/
 */
export {
    ReasonerError,
    RuleExecutionError,
    PremiseSourceError,
    StreamProcessingError,
    logError,
    tryCatch,
    createErrorHandler,
    withErrorHandler
} from '@senars/core/src/errors/index.js';
