/**
 * @deprecated Import from './error.js' instead
 * Re-exports for backward compatibility, including the ErrorHandler class
 */
export * from './error.js';

import { createErrorHandler } from './error.js';

export class ErrorHandler {
    constructor(componentName = '') {
        this.componentName = componentName;
        this.handlers = createErrorHandler(componentName);
    }
    logError(error, context = {}, level = 'error') { return this.handlers.logError(error, context, level); }
    wrapError(error, message, context = {}) { return this.handlers.wrapError(error, message, context); }
    async safeAsync(asyncFn, context = '', contextInfo = {}, defaultValue = null) { return this.handlers.safeAsync(asyncFn, context, contextInfo, defaultValue); }
    safeSync(syncFn, context = '', contextInfo = {}, defaultValue = null) { return this.handlers.safeSync(syncFn, context, contextInfo, defaultValue); }
    async executeWithHandling(operation, context = '', options = {}) { return this.handlers.executeWithHandling(operation, context, options); }
    executeSyncWithHandling(operation, context = '', options = {}) { return this.handlers.executeSyncWithHandling(operation, context, options); }
}
