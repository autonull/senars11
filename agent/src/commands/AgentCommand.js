import {handleError} from '@senars/core';

export class AgentCommand {
    constructor(name, description, usage) {
        this.name = name;
        this.description = description;
        this.usage = usage;
    }

    async execute(agent, ...args) {
        try {
            return await this._executeImpl(agent, ...args);
        } catch (error) {
            return handleError(error, `${this.name} command`, `Error executing ${this.name} command`);
        }
    }

    async _executeImpl(agent, ...args) {
        throw new Error(`_executeImpl not implemented for command: ${this.name}`);
    }
}

export class AgentCommandRegistry {
    #commands = new Map();

    register(command) {
        if (!(command instanceof AgentCommand)) {
            throw new Error('Command must be an instance of AgentCommand');
        }
        this.#commands.set(command.name, command);
    }

    get(name) {
        return this.#commands.get(name);
    }

    getAll() {
        return [...this.#commands.values()];
    }

    async execute(name, agent, ...args) {
        const command = this.get(name);
        return command ? command.execute(agent, ...args) : `Unknown command: ${name}`;
    }

    getHelp() {
        const commands = this.getAll();
        if (commands.length === 0) {
            return 'No commands registered.';
        }
        return commands.map(cmd => `  ${cmd.name.padEnd(12)} - ${cmd.description}`).join('\n');
    }
}
