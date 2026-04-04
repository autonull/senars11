// Mock for @langchain/core/tools
class DynamicTool {
    constructor(config) { this.name = config.name; this.description = config.description; this.func = config.func; }
}
class Tool {
    constructor(config) { this.name = config?.name || 'tool'; this.description = config?.description || ''; }
}
module.exports = { DynamicTool, Tool };
