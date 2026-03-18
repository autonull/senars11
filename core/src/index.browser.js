import { NAR } from './nar/NAR.js';
import { setPlatform } from './platform/index.js';
import { PlatformBrowser } from './platform/PlatformBrowser.js';
import {
    WebAutomationTool,
    EmbeddingTool
} from './tool/index.js';

/**
 * Initialize SeNARS for Browser environment
 * @param {Object} config - Configuration object
 * @returns {NAR} - Configured NAR instance
 */
export function createNAR(config = {}) {
    // 1. Set Platform
    setPlatform(new PlatformBrowser());

    // 2. Select Safe Tools
    const tools = [
        new WebAutomationTool(),
        new EmbeddingTool()
    ];

    // 3. Create NAR with tools
    const nar = new NAR(config);

    // Inject tools directly
    if (nar.tools) {
        nar.tools.initialTools = tools;
    }

    return nar;
}

// Re-export core
export * from './index.js';
export { PlatformBrowser } from './platform/PlatformBrowser.js';
