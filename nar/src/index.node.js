import {NAR} from './nar/NAR.js';
import {setPlatform} from '@senars/core/src/platform/index.js';
import {PlatformNode} from '@senars/core/src/platform/PlatformNode.js';
import {CommandExecutorTool, FileOperationsTool, MediaProcessingTool} from '@senars/core/src/tool/node/index.js';
import {EmbeddingTool, WebAutomationTool} from '@senars/core/src/tool/index.js';

/**
 * Initialize SeNARS for Node.js environment
 */
export function createNAR(config = {}) {
    setPlatform(new PlatformNode());

    const tools = [
        new FileOperationsTool(),
        new CommandExecutorTool(),
        new MediaProcessingTool(),
        new WebAutomationTool(),
        new EmbeddingTool()
    ];

    const nar = new NAR(config);

    if (nar.tools) {
        nar.tools.initialTools = tools;
    }

    return nar;
}

export * from './index.js';
