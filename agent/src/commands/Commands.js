/**
 * Standardized Command Interface
 * Auto-discovers commands from subdirectories
 */

export {AgentCommand, AgentCommandRegistry} from './AgentCommand.js';

// Agent commands
export * from './agent/agent-commands.js';

// System commands
export * from './system/system-commands.js';

// Display commands
export * from './display/display-commands.js';
