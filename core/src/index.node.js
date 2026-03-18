import { NAR } from './nar/NAR.js';
import { setPlatform } from './platform/index.js';
import { PlatformNode } from './platform/PlatformNode.js';
import {
    FileOperationsTool,
    CommandExecutorTool,
    MediaProcessingTool
} from './tool/node/index.js';
import {
    WebAutomationTool,
    EmbeddingTool
} from './tool/index.js';

/**
 * Initialize SeNARS for Node.js environment
 * @param {Object} config - Configuration object
 * @returns {NAR} - Configured NAR instance
 */
export function createNAR(config = {}) {
    // 1. Set Platform
    setPlatform(new PlatformNode());

    // 2. Select Tools
    const tools = [
        new FileOperationsTool(),
        new CommandExecutorTool(),
        new MediaProcessingTool(),
        new WebAutomationTool(),
        new EmbeddingTool()
    ];

    // 3. Create NAR with tools
    const nar = new NAR(config);

    // Inject tools directly if not already configured
    if (nar.tools) {
        nar.tools.initialTools = tools;
    }

    return nar;
}

// Re-export core
export * from './index.js';
export { PlatformNode } from './platform/PlatformNode.js';
