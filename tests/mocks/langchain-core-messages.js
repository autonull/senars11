// Mock for @langchain/core/messages
class AIMessage {
    constructor(content) {
        this.content = content;
        this._getType = () => 'ai';
    }
}

class HumanMessage {
    constructor(content) {
        this.content = content;
        this._getType = () => 'human';
    }
}

class SystemMessage {
    constructor(content) {
        this.content = content;
        this._getType = () => 'system';
    }
}

module.exports = {AIMessage, HumanMessage, SystemMessage};
