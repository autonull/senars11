export class McpServer {
    constructor() {
        this.tools = new Map();
    }

    tool(name, schema, callback) {
        this.tools.set(name, callback);
    }

    async connect() {
    }

    async close() {
    }
}
