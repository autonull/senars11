export class ToolNode {
    constructor(tools) {
        this.tools = tools;
    }

    async invoke(input) {
        return input;
    }
}
