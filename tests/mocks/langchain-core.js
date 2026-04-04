export class AIMessage {
    constructor(content) { this.content = content; this._getType = () => 'ai'; }
}
export class HumanMessage {
    constructor(content) { this.content = content; this._getType = () => 'human'; }
}
export class SystemMessage {
    constructor(content) { this.content = content; this._getType = () => 'system'; }
}
export class AIMessageChunk {
    constructor(content) { this.content = content; this._getType = () => 'ai'; }
}
export class ToolMessage {
    constructor(content) { this.content = content; this._getType = () => 'tool'; }
}
export class DynamicTool {
    constructor(config) { Object.assign(this, config); }
    async call(input) { return this.func(input); }
}
export class ChatGenerationChunk {
    constructor(config) { Object.assign(this, config); }
}
export class BaseChatModel {
    constructor(config) { this.config = config; }
    async invoke(input) { return { content: 'mock' }; }
}
