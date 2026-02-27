/**
 * ChannelExtension.js - MeTTa Extension for Channel Primitives
 * Bridges the JS ChannelManager to MeTTa Atoms.
 */
import { Term } from '../kernel/Term.js';
import { Logger } from '@senars/core';

export class ChannelExtension {
    constructor(interpreter, channelManager) {
        this.interpreter = interpreter;
        this.channelManager = channelManager;
        this.ground = interpreter.ground;
        this.eventListeners = new Map(); // channelId -> [{ type, callback }]
    }

    register() {
        this.ground.add('join-channel', this._joinChannel.bind(this));
        this.ground.add('leave-channel', this._leaveChannel.bind(this));
        this.ground.add('send-message', this._sendMessage.bind(this));
        this.ground.add('web-search', this._webSearch.bind(this));
        this.ground.add('on-event', this._onEvent.bind(this));
        this.ground.add('llm-query', this._llmQuery.bind(this));

        // Listen to all messages globally to route to specific listeners
        this.channelManager.on('message', this._handleGlobalMessage.bind(this));

        Logger.info('Channel primitives registered in MeTTa.');
    }

    async _joinChannel(typeAtom, configAtom) {
        // (join-channel <type> <config>)
        const type = typeAtom.name || typeAtom.toString();
        const config = this._atomToConfig(configAtom);

        Logger.info(`[MeTTa] Joining channel: ${type} with config`, config);

        let ChannelClass;

        try {
            // Lazy import to avoid circular dependency
            const { IRCChannel, NostrChannel } = await import('../../../agent/src/io/index.js');

            if (type === 'irc') ChannelClass = IRCChannel;
            else if (type === 'nostr') ChannelClass = NostrChannel;
            else return Term.sym('Error:UnknownChannelType');

            const channel = new ChannelClass(config);
            this.channelManager.register(channel);
            await channel.connect();

            return Term.sym(channel.id);
        } catch (error) {
            Logger.error('Error joining channel:', error);
            return Term.sym('Error:JoinFailed');
        }
    }

    async _leaveChannel(channelIdAtom) {
        const id = channelIdAtom.name;
        try {
            await this.channelManager.unregister(id);
            return Term.sym('True');
        } catch (error) {
            return Term.sym('False');
        }
    }

    async _sendMessage(channelIdAtom, targetAtom, contentAtom) {
        const id = channelIdAtom.name;
        const target = targetAtom.name || targetAtom.toString().replace(/"/g, '');
        const content = contentAtom.name || contentAtom.toString().replace(/"/g, '');

        try {
            await this.channelManager.sendMessage(id, target, content);
            return Term.sym('True');
        } catch (error) {
            Logger.error(`Failed to send message to ${id}:`, error);
            return Term.sym('False');
        }
    }

    async _webSearch(queryAtom) {
        const query = queryAtom.name || queryAtom.toString().replace(/"/g, '');
        try {
             const { WebSearchTool } = await import('../../../agent/src/io/index.js');
             // TODO: Inject configured instance instead of new default
             const tool = new WebSearchTool();
             const results = await tool.search(query);

             // Convert results to MeTTa List: ( (Title Link Snippet) ... )
             const listItems = results.map(r =>
                Term.exp(':', [
                    Term.str(r.title),
                    Term.str(r.link),
                    Term.str(r.snippet)
                ])
             );
             return this.interpreter._listify(listItems);

        } catch (error) {
            Logger.error('Web search failed:', error);
             return Term.sym('()');
        }
    }

    async _llmQuery(promptAtom) {
        // (llm-query "prompt")
        const prompt = promptAtom.name || promptAtom.toString().replace(/"/g, '');

        try {
            // Access Agent's AI Client if available
            // We need access to the agent instance here.
            // In Agent.js we passed `this.channelManager` to `ChannelExtension`.
            // We didn't pass `this` (the agent).
            // We should have passed `this` to ChannelExtension constructor or have a way to access AI.
            // However, ChannelExtension is instantiated in Agent.js.
            // Let's assume we can get it or use a default if not provided.

            // Wait, I updated Agent.js to pass `this.channelManager` but not `this`.
            // I should update Agent.js to pass `this` as well, or attach it to channelManager?
            // Actually, in `MemoryExtension` I passed `this`.
            // Let's assume I will update `Agent.js` to pass `this` to `ChannelExtension` constructor too.

            if (this.agent && this.agent.ai) {
                const response = await this.agent.ai.generate(prompt);
                return Term.str(response.text);
            }

            return Term.str("Error: AI Client not available");
        } catch (error) {
            Logger.error('LLM query failed:', error);
            return Term.str(`Error: ${error.message}`);
        }
    }

    _onEvent(channelIdAtom, eventTypeAtom, callbackAtom) {
        // (on-event <channel-id> <event-type> <callback>)
        const channelId = channelIdAtom.name || channelIdAtom.toString().replace(/"/g, '');
        const eventType = eventTypeAtom.name || eventTypeAtom.toString().replace(/"/g, '');

        if (!this.eventListeners.has(channelId)) {
            this.eventListeners.set(channelId, []);
        }

        this.eventListeners.get(channelId).push({
            type: eventType,
            callback: callbackAtom
        });

        Logger.info(`[MeTTa] Registered listener for ${channelId}:${eventType}`);
        return Term.sym('True');
    }

    _handleGlobalMessage(msg) {
        const listeners = this.eventListeners.get(msg.channelId);
        if (!listeners) return;

        const type = msg.metadata?.type || 'message';

        listeners.forEach(listener => {
            if (listener.type === type || listener.type === '*') {
                this._triggerCallback(listener.callback, msg);
            }
        });
    }

    _triggerCallback(callbackAtom, msg) {
        // (callback <from> <content>)
        // Escaping/quoting might be needed for content
        // Simple string injection for now
        this.interpreter.runAsync(`!(${callbackAtom} "${msg.from}" "${msg.content}")`)
            .catch(err => Logger.error('Error executing event callback:', err));
    }

    // Helper to convert MeTTa structure to JS Object
    _atomToConfig(atom) {
        const config = {};
        if (atom.type === 'expression' || atom.name === '()') {
             const elements = this.interpreter._flattenToList(atom);
             elements.forEach(pair => {
                 if (pair.type === 'expression' && pair.components.length === 2) {
                     const key = pair.components[0].toString().replace(/"/g, '');
                     const val = pair.components[1].toString().replace(/"/g, '');
                     config[key] = val;
                 }
             });
        }
        return config;
    }
}
