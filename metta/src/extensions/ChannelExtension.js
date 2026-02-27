/**
 * ChannelExtension.js - MeTTa Extension for Channel Primitives
 * Bridges the JS ChannelManager to MeTTa Atoms.
 */
import { Term } from '../kernel/Term.js';
import { Logger } from '../../../core/src/util/Logger.js';

export class ChannelExtension {
    constructor(interpreter, channelManager) {
        this.interpreter = interpreter;
        this.channelManager = channelManager;
        this.ground = interpreter.ground;
    }

    register() {
        this.ground.add('join-channel', this._joinChannel.bind(this));
        this.ground.add('leave-channel', this._leaveChannel.bind(this));
        this.ground.add('send-message', this._sendMessage.bind(this));
        this.ground.add('web-search', this._webSearch.bind(this));

        Logger.info('Channel primitives registered in MeTTa.');
    }

    async _joinChannel(typeAtom, configAtom) {
        // (join-channel <type> <config>)
        // type: "irc" | "nostr"
        // config: List or Struct
        const type = typeAtom.name || typeAtom.toString();
        const config = this._atomToConfig(configAtom);

        Logger.info(`[MeTTa] Joining channel: ${type} with config`, config);

        let ChannelClass;
        // Dynamically import from agent package (requires correct path resolution or injection)
        // Since we are inside metta package, we rely on dependency injection of channelManager which should handle factory
        // BUT, channelManager doesn't have a factory method yet.
        // We need to either import the classes here (circular dependency risk?) or rely on a factory.
        // For now, we will assume ChannelManager has a `createChannel` method or we import dynamically.

        try {
            // Lazy import to avoid circular dependency issues at module level if any
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
        const target = targetAtom.name || targetAtom.toString().replace(/"/g, ''); // Unquote if string
        const content = contentAtom.name || contentAtom.toString().replace(/"/g, ''); // Unquote if string

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
        // This requires WebSearchTool instance. We'll create a temporary one or use a shared one.
        // Ideally injected.
        try {
             const { WebSearchTool } = await import('../../../agent/src/io/index.js');
             const tool = new WebSearchTool(); // Use default mock for now or inject config
             const results = await tool.search(query);

             // Convert results to MeTTa List
             // ( (Title Link Snippet) ... )
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

    // Helper to convert MeTTa structure to JS Object
    _atomToConfig(atom) {
        // Handle ( (key value) (key value) ) list
        const config = {};
        if (atom.type === 'expression' || atom.name === '()') { // List
             // Iterate through list elements using interpreter's flatten or manual traversal
             // Assuming simple list of pairs for now
             // Using interpreter helper if available, or manual:
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
