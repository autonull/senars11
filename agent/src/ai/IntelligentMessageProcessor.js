/**
 * IntelligentMessageProcessor.js - Advanced Message Processing Pipeline
 * Integrates MeTTa, LLM, and SeNARS for intelligent, context-aware responses.
 * Features:
 * - Message classification (question, command, statement, greeting)
 * - Context-aware response generation
 * - Memory-based conversation history
 * - SeNARS belief integration
 * - Rate-limited, deliberate output
 */
import { Logger } from '@senars/core';

export class IntelligentMessageProcessor {
    constructor(agent, config = {}) {
        this.agent = agent;
        this.config = {
            respondToMentions: config.respondToMentions ?? true,
            respondToQuestions: config.respondToQuestions ?? true,
            respondToCommands: config.respondToCommands ?? true,
            respondToGreeting: config.respondToGreeting ?? true,
            learnFromConversation: config.learnFromConversation ?? true,
            questionThreshold: config.questionThreshold ?? 0.5,
            commandThreshold: config.commandThreshold ?? 0.6,
            maxContextLength: config.maxContextLength ?? 30,
            contextWindowMs: config.contextWindowMs ?? 3600000,
            botNick: config.botNick || 'senars',
            personality: config.personality || 'helpful and concise',
            minResponseDelay: config.minResponseDelay ?? 500,
            maxResponseDelay: config.maxResponseDelay ?? 2000,
            verbose: config.verbose ?? false,
        };

        this.contexts = new Map();
        this.classificationCache = new Map();
        this.responseQueue = [];
        this.processingResponse = false;
        this.stats = { messagesProcessed: 0, responsesGenerated: 0, commandsExecuted: 0, questionsAnswered: 0 };
    }

    /**
     * Process an incoming message and generate appropriate response
     * @param {object} msg - Message object from ChannelManager
     * @returns {Promise<{shouldRespond: boolean, response?: string, action?: string}>}
     */
    async processMessage(msg) {
        this.stats.messagesProcessed++;

        const { from, content, metadata } = msg;
        const isPrivate = metadata?.isPrivate || false;
        const channel = metadata?.channel || msg.channelId || 'unknown';

        // Get or create context for this conversation
        const contextKey = `${channel}:${from}`;
        const context = this._getOrCreateContext(contextKey);
        
        // Update context with new message
        context.messages.push({
            from,
            content,
            timestamp: Date.now(),
            isPrivate
        });
        
        // Trim old messages
        this._trimContext(context);
        
        // Check if message is directed at bot
        const isMentioned = this._isMessageForBot(content, channel);
        
        // Classify message type
        const classification = await this._classifyMessage(content, isMentioned, isPrivate);
        
        // Store classification in context
        context.lastClassification = classification;
        
        // Decide whether to respond
        const shouldRespond = this._shouldRespond(classification, isMentioned, isPrivate);
        
        if (!shouldRespond) {
            // Still learn from the message
            if (this.config.learnFromConversation) {
                await this._learnFromMessage(msg, classification);
            }
            return { shouldRespond: false };
        }
        
        // Generate response based on classification
        let response;
        let action = 'message';
        
        try {
            switch (classification.type) {
                case 'command':
                    response = await this._handleCommand(content, from, channel);
                    action = 'command';
                    this.stats.commandsExecuted++;
                    break;
                    
                case 'question':
                    response = await this._handleQuestion(content, context, msg);
                    action = 'answer';
                    this.stats.questionsAnswered++;
                    break;
                    
                case 'greeting':
                    response = await this._handleGreeting(content, from, context);
                    action = 'greeting';
                    break;
                    
                case 'statement':
                default:
                    response = await this._handleStatement(content, context, msg);
                    action = 'response';
                    break;
            }
            
            if (response) {
                this.stats.responsesGenerated++;
                
                // Add response to context
                context.messages.push({
                    from: this.config.botNick,
                    content: response,
                    timestamp: Date.now(),
                    isPrivate
                });
                
                // Learn from the exchange
                if (this.config.learnFromConversation) {
                    await this._learnFromExchange(msg, response, classification);
                }
            }
            
            return {
                shouldRespond: true,
                response,
                action,
                classification
            };
            
        } catch (error) {
            Logger.error('Error generating response:', error);
            return {
                shouldRespond: false,
                error: error.message
            };
        }
    }

    /**
     * Get or create conversation context
     */
    _getOrCreateContext(key) {
        if (!this.contexts.has(key)) {
            this.contexts.set(key, {
                messages: [],
                lastActivity: Date.now(),
                topic: null,
                sentiment: 'neutral'
            });
        }
        return this.contexts.get(key);
    }

    /**
     * Trim old messages from context
     */
    _trimContext(context) {
        const now = Date.now();
        const cutoff = now - this.config.contextWindowMs;
        
        // Remove old messages
        context.messages = context.messages.filter(m => m.timestamp > cutoff);
        
        // Keep only recent messages
        if (context.messages.length > this.config.maxContextLength) {
            context.messages = context.messages.slice(-this.config.maxContextLength);
        }
        
        context.lastActivity = now;
    }

    /**
     * Check if message is directed at the bot
     */
    _isMessageForBot(content, channel) {
        if (!this.config.respondToMentions) return false;
        
        const nick = this.config.botNick;
        const patterns = [
            new RegExp(`\\b${nick}\\b`, 'i'),
            new RegExp(`^${nick}[:,\\s]`, 'i'),
            new RegExp(`[:,\\s]${nick}[!?\\.]*$`, 'i')
        ];
        
        return patterns.some(p => p.test(content));
    }

    /**
     * Classify message type using LLM
     */
    async _classifyMessage(content, isMentioned, isPrivate) {
        // Check cache first
        const cacheKey = `${content.length}:${content.slice(0, 50)}`;
        if (this.classificationCache.has(cacheKey)) {
            return this.classificationCache.get(cacheKey);
        }
        
        // Private messages and mentions always get full classification
        if (isPrivate || isMentioned) {
            const classification = await this._llmClassify(content);
            this.classificationCache.set(cacheKey, classification);
            return classification;
        }
        
        // Quick heuristic classification for public messages
        const classification = this._heuristicClassify(content);
        this.classificationCache.set(cacheKey, classification);
        return classification;
    }

    /**
     * Quick heuristic classification
     */
    _heuristicClassify(content) {
        const lower = content.toLowerCase().trim();
        
        // Command patterns
        if (lower.startsWith('!') || lower.startsWith('/') || lower.startsWith('.')) {
            return { type: 'command', confidence: 0.9 };
        }
        
        // Question patterns
        const questionWords = ['what', 'who', 'when', 'where', 'why', 'how', 'is', 'are', 'do', 'does', 'can', 'could', 'would', 'should'];
        const hasQuestionWord = questionWords.some(w => lower.startsWith(w + ' '));
        const hasQuestionMark = lower.endsWith('?');
        
        if (hasQuestionMark || (hasQuestionWord && lower.includes('?'))) {
            return { type: 'question', confidence: 0.8 };
        }
        
        // Greeting patterns
        const greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'yo', 'sup'];
        if (greetings.some(g => lower.startsWith(g))) {
            return { type: 'greeting', confidence: 0.85 };
        }
        
        // Farewell patterns
        const farewells = ['bye', 'goodbye', 'see you', 'later', 'gtg', 'brb', 'afk'];
        if (farewells.some(f => lower.includes(f))) {
            return { type: 'farewell', confidence: 0.8 };
        }
        
        // Default to statement
        return { type: 'statement', confidence: 0.5 };
    }

    /**
     * LLM-based classification for complex messages
     */
    async _llmClassify(content) {
        if (!this.agent.ai) {
            return this._heuristicClassify(content);
        }
        
        try {
            const prompt = `Classify this message into one of: command, question, greeting, farewell, statement.
Message: "${content}"
Respond with just the type name.`;

            const result = await this.agent.ai.generate(prompt);
            const type = result.text.toLowerCase().trim();
            
            return {
                type: type || 'statement',
                confidence: 0.7
            };
        } catch (error) {
            Logger.debug('LLM classification failed, using heuristics');
            return this._heuristicClassify(content);
        }
    }

    /**
     * Decide whether to respond
     */
    _shouldRespond(classification, isMentioned, isPrivate) {
        // Always respond to private messages
        if (isPrivate) return true;

        // Respond to direct mentions
        if (isMentioned) return true;

        // Respond to commands
        if (classification.type === 'command' && this.config.respondToCommands) {
            return true;
        }

        // Respond to questions (lowered threshold for public engagement)
        if (classification.type === 'question' &&
            classification.confidence >= this.config.questionThreshold &&
            this.config.respondToQuestions) {
            return true;
        }

        // Respond to greetings in public channels
        if (classification.type === 'greeting' && this.config.respondToGreeting) {
            return true;
        }

        // Don't respond to other statements in public channels (avoids spam)
        return false;
    }

    /**
     * Handle command messages
     */
    async _handleCommand(content, from, channel) {
        // Remove command prefix
        const cmdContent = content.replace(/^[!/.]/, '').trim();
        const [cmd, ...args] = cmdContent.split(/\s+/);

        // Check for built-in commands
        const builtInCommands = {
            'help': async () => await this._getHelpMessage(),
            'ping': async () => 'Pong!',
            'version': async () => `${this.config.botNick} v1.0 - Intelligent IRC Agent`,
            'uptime': async () => {
                const uptime = Math.floor((Date.now() - this.agent.startTime) / 1000);
                if (isNaN(uptime) || uptime < 0) return 'Uptime: unknown';
                const mins = Math.floor(uptime / 60);
                const secs = uptime % 60;
                return `Uptime: ${mins}m ${secs}s`;
            },
            'stats': async () => {
                return `Messages: ${this.stats.messagesProcessed}, Responses: ${this.stats.responsesGenerated}`;
            },
            'whoami': async () => `You are ${from}`,
            'users': async () => {
                const irc = this.agent.channelManager?.get('irc');
                if (irc && irc.getUsersInChannel) {
                    const users = irc.getUsersInChannel(channel);
                    return `Users in ${channel}: ${users.join(', ')}`;
                }
                return 'Cannot get user list';
            },
            'context': async () => {
                const lines = [];
                lines.push('=== System State ===');

                const ctxKey = `${channel}:${from}`;
                const ctx = this.contexts.get(ctxKey);
                lines.push(`\nHISTORY (${ctx?.messages?.length || 0} messages):`);
                if (ctx?.messages) {
                    ctx.messages.slice(-10).forEach(m => {
                        lines.push(`  ${m.from}: ${m.content.substring(0, 80)}`);
                    });
                }

                if (this.agent.semanticMemory) {
                    const recent = await this.agent.semanticMemory.getRecent(10) || [];
                    lines.push(`\nMEMORIES (${recent.length} recent):`);
                    recent.forEach(m => {
                        lines.push(`  [${m.type || '?'}] ${m.content.substring(0, 80)}`);
                    });
                }

                const beliefs = this.agent.getBeliefs?.() || [];
                lines.push(`\nBELIEFS (${beliefs.length} total):`);
                beliefs.slice(0, 5).forEach(b => {
                    lines.push(`  ${b}`);
                });

                lines.push(`\nLLM: ${this.agent.ai?.defaultProvider || '?'}/${this.agent.ai?.defaultModel || '?'}`);
                lines.push('\n=== End State ===');
                return lines.join('\n');
            }
        };
        
        if (builtInCommands[cmd.toLowerCase()]) {
            try {
                return await builtInCommands[cmd.toLowerCase()]();
            } catch (error) {
                return `Error executing command: ${error.message}`;
            }
        }
        
        // Try agent command registry
        if (this.agent.commandRegistry?.get(cmd)) {
            try {
                const result = await this.agent.commandRegistry.execute(cmd, this.agent, ...args);
                return result;
            } catch (error) {
                return `Command error: ${error.message}`;
            }
        }
        
        // Unknown command
        return `Unknown command: ${cmd}. Type !help for available commands.`;
    }

    /**
     * Build structured context: RECALL + HISTORY (mirrors ContextBuilder.metta pattern)
     */
    async _buildContext(content, context) {
        const parts = {};

        // RECALL — SemanticMemory query for relevant past exchanges
        if (this.agent.semanticMemory && content) {
            try {
                const memories = await this.agent.semanticMemory.query(content, 5);
                if (memories.length > 0) {
                    parts.RECALL = memories.map((m, i) =>
                        `[${m.type || 'memory'}] ${m.content}${m.score ? ` (relevance: ${m.score.toFixed(2)})` : ''}`
                    ).join('\n');
                }
            } catch (e) {
                Logger.debug('SemanticMemory query failed:', e.message);
            }
        }

        // HISTORY — recent conversation
        const history = context.messages
            .map(m => `${m.from}: ${m.content}`)
            .join('\n');
        if (history) parts.HISTORY = history;

        return parts;
    }

    /**
     * Format structured context into a prompt string
     */
    _formatContext(parts) {
        const sections = [];
        if (parts.RECALL) sections.push(`RECALL:\n${parts.RECALL}`);
        if (parts.HISTORY) sections.push(`HISTORY:\n${parts.HISTORY}`);
        return sections.join('\n\n');
    }

    /**
     * Handle question messages
     */
    async _handleQuestion(content, context, msg) {
        const structuredContext = await this._buildContext(content, context);
        const contextStr = this._formatContext(structuredContext);

        const systemPrompt = `You are ${this.config.botNick}, a helpful assistant.
Be CONCISE and DIRECT. Answer in 1-2 sentences max (under 300 characters).
Personality: ${this.config.personality}`;

        const userPrompt = `${contextStr ? contextStr + '\n\n' : ''}Question: ${content}`;

        try {
            const result = await this.agent.ai.generate([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]);
            return result.text.trim();
        } catch (error) {
            Logger.error('Error answering question:', error.message);
            return "Not sure about that one.";
        }
    }

    /**
     * Handle greeting messages
     */
    async _handleGreeting(content, from, context) {
        const greetings = [
            `Hello ${from}!`,
            `Hi ${from}! How can I help?`,
            `Greetings ${from}!`,
            `Hey ${from}! What's up?`
        ];
        
        // Pick a greeting based on context
        const lastGreeting = context.messages
            .filter(m => m.from === this.config.botNick)
            .slice(-1)[0];
        
        // Avoid repeating the same greeting
        let greeting = greetings[Math.floor(Math.random() * greetings.length)];
        if (lastGreeting && greeting === lastGreeting.content) {
            greeting = greetings[(greetings.indexOf(greeting) + 1) % greetings.length];
        }
        
        return greeting;
    }

    /**
     * Handle statement messages
     */
    async _handleStatement(content, context, msg) {
        const structuredContext = await this._buildContext(content, context);
        const contextStr = this._formatContext(structuredContext);

        const systemPrompt = `You are ${this.config.botNick}, a helpful assistant.
Be CONCISE and NATURAL. Respond in 1 sentence max (under 200 characters).
Personality: ${this.config.personality}`;

        const userPrompt = `${contextStr ? contextStr + '\n\n' : ''}Message: ${content}`;

        try {
            const result = await this.agent.ai.generate([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]);
            return result.text.trim();
        } catch (error) {
            Logger.debug('Error generating statement response:', error.message);
            return null;
        }
    }

    /**
     * Get help message
     */
    async _getHelpMessage() {
        return `${this.config.botNick} Commands:
!help - Show this help
!ping - Check if bot is alive
!version - Show bot version
!uptime - Show bot uptime
!stats - Show message statistics
!context - Dump system state (memories, beliefs, history)
!whoami - Show your nick
!users - Show users in channel

Just ask questions or talk naturally!`;
    }

    /**
     * Learn from message (integrate with SeNARS via MeTTa)
     */
    async _learnFromMessage(msg, classification) {
        if (!this.agent.metta) return;

        const { from, content, channel } = msg;
        try {
            // Store as MeTTa atom: (heard channel user content)
            const safeContent = content.replace(/[()"]/g, '').substring(0, 200);
            const atom = `(heard "${channel}" "${from}" "${safeContent}")`;
            this.agent.metta.run(atom);
        } catch (error) {
            Logger.debug('Error learning from message:', error);
        }
    }

    /**
     * Learn from exchange (store conversation pair via MeTTa)
     */
    async _learnFromExchange(msg, response, classification) {
        if (!this.agent.metta) return;

        try {
            const { from, content, channel } = msg;
            const safeContent = content.replace(/[()"]/g, '').substring(0, 200);
            const safeResponse = response.replace(/[()"]/g, '').substring(0, 200);
            const atom = `(conversation "${channel}" "${from}" "${safeContent}" "${safeResponse}")`;
            this.agent.metta.run(atom);
        } catch (error) {
            Logger.debug('Error learning from exchange:', error);
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeContexts: this.contexts.size,
            cacheSize: this.classificationCache.size
        };
    }

    /**
     * Clear context for a user/channel
     */
    clearContext(key) {
        this.contexts.delete(key);
    }

    /**
     * Clear all contexts
     */
    clearAllContexts() {
        this.contexts.clear();
    }
}
