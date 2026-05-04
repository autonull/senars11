export class ChatOpenAI {
    constructor(config) {
        this.config = config;
    }

    async invoke(input) {
        return {content: 'mock response'};
    }

    async stream(input) {
        return [{content: 'mock response'}];
    }
}
