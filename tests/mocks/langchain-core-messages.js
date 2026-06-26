export class AIMessage {
    constructor(content) {
        this.content = content;
        this._getType = () => 'ai';
    }
}

export class HumanMessage {
    constructor(content) {
        this.content = content;
        this._getType = () => 'human';
    }
}

export class SystemMessage {
    constructor(content) {
        this.content = content;
        this._getType = () => 'system';
    }
}

export class AIMessageChunk {
    constructor(content) {
        this.content = content;
        this._getType = () => 'ai';
    }
}

export class ToolMessage {
    constructor(content) {
        this.content = content;
        this._getType = () => 'tool';
    }
}

export class ChatMessage {
    constructor(content, role) {
        this.content = content;
        this.role = role;
        this._getType = () => role;
    }
}

export class ChatMessageChunk {
    constructor(content, role) {
        this.content = content;
        this.role = role;
        this._getType = () => role;
    }
}

export class FunctionMessageChunk {
    constructor(content) {
        this.content = content;
        this._getType = () => 'function';
    }
}
export class HumanMessageChunk {
    constructor(content) {
        this.content = content;
        this._getType = () => 'human';
    }
}
export class SystemMessageChunk {
    constructor(content) {
        this.content = content;
        this._getType = () => 'system';
    }
}
export class ToolMessageChunk {
    constructor(content) {
        this.content = content;
        this._getType = () => 'tool';
    }
}

export const convertToProviderContentBlock = () => {};

export const iife = () => {};

export const isDataContentBlock = () => false;

export const parseBase64DataUrl = () => null;

export const parseMimeType = () => null;

export const isAIMessage = () => false;
