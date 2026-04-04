export const START = '__start__';
export const END = '__end__';
export const INTERRUPT = '__interrupt__';
export const COMMAND_SYMBOL = Symbol('command');

export class StateGraph {
    constructor(schema) { this._schema = schema; this._nodes = new Map(); this._edges = []; }
    addNode(name, action) { this._nodes.set(name, action); return this; }
    addEdge(from, to) { this._edges.push([from, to]); return this; }
    addConditionalEdge(from, mapping) { this._edges.push([from, mapping]); return this; }
    setEntryPoint(name) { this._entryPoint = name; return this; }
    setFinishPoint(name) { this._finishPoint = name; return this; }
    compile() {
        return {
            invoke: async (input) => ({ result: input }),
            stream: async function* () { yield { result: 'input' }; }
        };
    }
}

export class Send {
    constructor(node, input) { this.node = node; this.input = input; }
}

export class Command {
    constructor(config) { Object.assign(this, config); }
}

export function isCommand(obj) { return obj instanceof Command; }
export function isInterrupted(obj) { return false; }
export class Overwrite {}
