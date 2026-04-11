import {Component} from '../../composable/Component.js';
import {mergeConfig} from '../../utils/index.js';

const MODULE_DEFAULTS = {name: 'CognitiveModule', enabled: true, priority: 0};

export class CognitiveModule extends Component {
    constructor(config = {}) {
        super(mergeConfig(MODULE_DEFAULTS, config));
        this.inputs = new Map();
        this.outputs = new Map();
        this.state = new Map();
    }

    async process(input, context = {}) {
        throw new Error('CognitiveModule must implement process()');
    }

    connectInput(name, source) {
        this.inputs.set(name, source);
        return this;
    }

    connectOutput(name, target) {
        this.outputs.set(name, target);
        return this;
    }

    getState(key) {
        return this.state.get(key);
    }

    setState(key, value) {
        this.state.set(key, value);
        this.emit('stateChange', {key, value});
        return this;
    }

    broadcast(output) {
        this.outputs.forEach(target => target.receive(output));
        return this;
    }

    receive(input) {
        return this;
    }
}
