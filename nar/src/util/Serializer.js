import {NarseseParser, Task, TermFactory, TermSerializer} from '@senars/nar';

export class Serializer {
    static VERSION = '1.0.0';

    static toJSON(entity, options = {}) {
        if (!entity) {
            throw new Error('Cannot serialize null or undefined entity');
        }

        if (typeof entity.serialize === 'function') {
            return entity.serialize();
        }
        if (entity.constructor?.name?.includes('Term')) {
            return TermSerializer.toJSON(entity);
        }
        if (typeof entity === 'object') {
            return entity;
        }

        throw new Error(`Cannot serialize ${entity.constructor?.name ?? typeof entity}`);
    }

    static fromJSON(json, type = 'auto') {
        if (!json) {
            throw new Error('Cannot deserialize null or undefined JSON');
        }

        if (type === 'auto') {
            type = json.term && json.punctuation ? 'task'
                : json.operator || json.components ? 'term'
                    : json.concepts ? 'memory'
                        : json.memory && json.taskManager ? 'nar'
                            : json.steps && json.derivations ? 'trace'
                                : type;
        }

        switch (type) {
            case 'task':
                return Task.fromJSON(json);
            case 'term':
                return TermFactory.fromJSON?.(json) ?? TermSerializer.fromJSON(json);
            case 'memory':
                return global.Memory?.deserialize?.(json) ?? (() => {
                    throw new Error('Memory deserialization not available');
                })();
            case 'nar':
                return global.NAR?.deserialize?.(json) ?? (() => {
                    throw new Error('NAR deserialization not available');
                })();
            case 'trace':
                return json;
            default:
                throw new Error(`Unknown type: ${type}`);
        }
    }

    static toNarsese(entity) {
        if (!entity) {
            throw new Error('Cannot convert null or undefined to Narsese');
        }

        if (typeof entity.toNarsese === 'function') {
            return entity.toNarsese();
        }
        if (entity.constructor?.name?.includes('Term')) {
            return entity.toString();
        }
        if (entity.operator || entity.components) {
            return TermSerializer.toString(entity);
        }

        throw new Error(`Cannot convert ${entity.constructor?.name ?? typeof entity} to Narsese`);
    }

    static fromNarsese(str) {
        if (typeof str !== 'string') {
            throw new Error('fromNarsese requires a string input');
        }

        try {
            return new NarseseParser(new TermFactory()).parse(str);
        } catch (error) {
            throw new Error(`Failed to parse Narsese: ${error.message}`);
        }
    }

    static detect(input) {
        if (typeof input === 'string') {
            try {
                JSON.parse(input);
                return 'json';
            } catch {
                return 'narsese';
            }
        }
        if (typeof input === 'object' && input !== null) {
            return 'object';
        }
        throw new Error(`Cannot detect format of ${typeof input}`);
    }

    static parse(input, defaultType = 'task') {
        const format = this.detect(input);
        return format === 'json' ? this.fromJSON(JSON.parse(input), defaultType)
            : format === 'narsese' ? this.fromNarsese(input)
                : input;
    }

    static _serializeComponent(component) {
        return typeof component.serialize === 'function' ? component.serialize()
            : typeof component.toJSON === 'function' ? component.toJSON()
                : component;
    }

    static exportState(nar) {
        if (!nar) {
            throw new Error('Cannot export state from null or undefined NAR');
        }

        return {
            version: this.VERSION,
            timestamp: Date.now(),
            nar: {
                memory: nar.memory ? this._serializeComponent(nar.memory) : undefined,
                taskManager: nar.taskManager ? this._serializeComponent(nar.taskManager) : undefined,
                focus: nar.focus ? this._serializeComponent(nar.focus) : undefined,
                config: nar.config ? this._serializeComponent(nar.config) : undefined
            }
        };
    }

    static async importState(nar, state) {
        if (!nar) {
            throw new Error('Cannot import state into null or undefined NAR');
        }
        if (!state) {
            throw new Error('Cannot import null or undefined state');
        }

        state = this.migrate(state, this.VERSION);

        const imports = [
            {component: nar.memory, data: state.nar.memory},
            {component: nar.taskManager, data: state.nar.taskManager},
            {component: nar.focus, data: state.nar.focus}
        ];

        for (const {component, data} of imports) {
            if (data && component?.constructor?.deserialize) {
                await component.constructor.deserialize(data);
            }
        }
    }

    static migrate(state, toVersion) {
        if (!state.version) {
            state.version = '1.0.0';
        }
        return state;
    }

    static isSerializable(entity) {
        if (!entity || typeof entity !== 'object') {
            return false;
        }
        return typeof entity.serialize === 'function' ||
            typeof entity.toNarsese === 'function' ||
            (typeof entity.toString === 'function' && entity.constructor?.name?.includes('Term'));
    }

    static getEntityType(entity) {
        const name = entity?.constructor?.name;
        return !name ? 'unknown'
            : name === 'Task' ? 'task'
                : name.includes('Term') ? 'term'
                    : name === 'Memory' ? 'memory'
                        : name === 'NAR' ? 'nar'
                            : 'unknown';
    }
}
