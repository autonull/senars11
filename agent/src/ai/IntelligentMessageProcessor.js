/**
 * IntelligentMessageProcessor.js — Embodiment Bus → LLM → SkillDispatcher pipeline
 *
 * One entry point: processMessage(msg)
 * 1. Classify message
 * 2. Build context (query stores: SemanticMemory, NARS beliefs, MeTTa atoms, AuditSpace, Skills, WM)
 * 3. Call LLM
 * 4. Parse / dispatch response (S-expr → SkillDispatcher, fallback → direct text)
 * 5. Store memory atoms
 * 6. Emit audit events
 */
import { Logger } from '@senars/core';
import { SkillDispatcher } from '../skills/SkillDispatcher.js';
import { AuditSpace } from '../memory/AuditSpace.js';
import { isEnabled } from '../config/capabilities.js';
import { join } from 'path';

const SKILLS_METTA_PATH = join(process.cwd(), 'agent', 'src', 'metta', 'skills.metta');
const SKILL_SLOT_ORDER = ['STARTUP_ORIENT', 'RECALL', 'BELIEFS', 'WM', 'HISTORY', 'FEEDBACK', 'SKILLS'];
const GREETINGS = ['Hello {name}!', 'Hi {name}! How can I help?', 'Greetings {name}!', 'Hey {name}! What\'s up?'];
const FAREWELL_KEYWORDS = new Set(['bye', 'goodbye', 'see you', 'later', 'gtg', 'brb', 'afk']);
const GREETING_KEYWORDS = new Set(['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'yo', 'sup']);
const QUESTION_STARTERS = new Set(['what', 'who', 'when', 'where', 'why', 'how', 'is', 'are', 'do', 'does', 'can', 'could', 'would', 'should']);

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
            agentConfig: config.agentConfig ?? null,
        };

        this.contexts = new Map();
        this.classificationCache = new Map();
        this.responseQueue = [];
        this.processingResponse = false;
        this.stats = { messagesProcessed: 0, responsesGenerated: 0, commandsExecuted: 0, questionsAnswered: 0 };
        this._startedAt = Date.now();
        this._firstMessageOriented = false;

        this._skillDispatcher = null;
        this._auditSpace = null;
        this._initSkillsAndAudit();
    }

    async _initSkillsAndAudit() {
        const agentCfg = this.config.agentConfig;
        if (!agentCfg) {return;}

        if (isEnabled(agentCfg, 'auditLog')) {
            this._auditSpace = new AuditSpace(agentCfg);
            try { await this._auditSpace.initialize(); }
            catch (e) { Logger.warn('[IMP] AuditSpace init failed:', e.message); }
        }

        if (isEnabled(agentCfg, 'sExprSkillDispatch')) {
            this._skillDispatcher = new SkillDispatcher(agentCfg);
            try {
                this._skillDispatcher.loadSkillsFromFile(SKILLS_METTA_PATH);
            } catch (e) { Logger.warn('[IMP] SkillDispatcher init failed:', e.message); }
            this._registerDefaultSkillHandlers();
        }
    }

    _registerDefaultSkillHandlers() {
        if (!this._skillDispatcher) {return;}

        this._skillDispatcher.register('respond', async (text) => ({ text }), 'mettaControlPlane', ':reflect', 'Reply to user');
        this._skillDispatcher.register('think', async (content) => ({ internal: content }), 'mettaControlPlane', ':reflect', 'Internal reasoning');
        this._skillDispatcher.register('metta', async (expr) => {
            try { return { result: this.agent.metta?.run(expr) }; }
            catch (e) { return { error: e.message }; }
        }, 'mettaControlPlane', ':reflect', 'Evaluate MeTTa expression');
        this._skillDispatcher.register('send', async (channel, text) => {
            try {
                await this.agent.channelManager?.sendMessage(String(channel), String(channel), String(text));
                return { sent: true };
            } catch (e) { return { error: e.message }; }
        }, 'mettaControlPlane', ':network', 'Send to specific channel');
    }

    async processMessage(msg) {
        this.stats.messagesProcessed++;
        const { from, content, metadata } = msg;
        const isPrivate = metadata?.isPrivate ?? false;
        const channel = metadata?.channel ?? msg.channelId ?? 'unknown';
        const contextKey = `${channel}:${from}`;
        const context = this._getOrCreateContext(contextKey);

        // Strip bot nick prefix: "SeNARchy: hi" → "hi"
        const cleanContent = this._stripNickPrefix(content, this.config.botNick);

        context.messages.push({ from, content: cleanContent, timestamp: Date.now(), isPrivate });
        this._trimContext(context);

        const isMentioned = this._isMessageForBot(content, channel);
        const classification = await this._classifyMessage(cleanContent, isMentioned, isPrivate);
        context.lastClassification = classification;

        await this._auditEmit('message-received', { from, channel, content: content.substring(0, 500), isPrivate });

        if (!this._shouldRespond(classification, isMentioned, isPrivate)) {
            if (this.config.learnFromConversation) {await this._learnFromMessage(msg);}
            return { shouldRespond: false };
        }

        if (!this._firstMessageOriented) {
            await this._startupOrient(contextKey);
            this._firstMessageOriented = true;
        }

        let response, action = 'message', skillResults;
        try {
            switch (classification.type) {
                case 'command':
                    ({ response, action, skillResults } = await this._handleCommand(content, from, channel, context));
                    break;
                case 'question':
                    ({ response, action, skillResults } = await this._handleQuestion(content, context));
                    this.stats.questionsAnswered++;
                    break;
                case 'greeting':
                    response = this._handleGreeting(content, from, context);
                    action = 'greeting';
                    break;
                default:
                    ({ response, action, skillResults } = await this._handleStatement(content, context));
                    break;
            }

            if (response) {
                this.stats.responsesGenerated++;
                context.messages.push({ from: this.config.botNick, content: typeof response === 'string' ? response : JSON.stringify(response), timestamp: Date.now(), isPrivate });
                if (this.config.learnFromConversation) {await this._learnFromExchange(msg, response);}
                await this._auditEmit('response-sent', { to: from, channel, content: String(response).substring(0, 500) });
            }

            return { shouldRespond: true, response, action, classification, skillResults };
        } catch (error) {
            Logger.error('Error generating response:', error);
            return { shouldRespond: false, error: error.message };
        }
    }

    async _startupOrient(contextKey) {
        const context = this.contexts.get(contextKey);
        if (!context) {return;}

        try {
            const beliefs = this.agent.getBeliefs?.() ?? [];
            if (beliefs.length) {context.startupBeliefs = beliefs.slice(0, 5).map(b => String(b));}
        } catch (e) { Logger.debug('[IMP] Startup orient beliefs failed:', e.message); }

        if (this._auditSpace) {
            try {
                const recentErrors = this._auditSpace.getRecent(5, 'cycle-audit').filter(e => e.error);
                if (recentErrors.length) {context.startupFeedback = recentErrors.map(e => e.error?.substring(0, 200)).join('; ');}
            } catch (e) { Logger.debug('[IMP] Startup orient feedback failed:', e.message); }
        }

        if (this.agent.metta) {
            try {
                const recentConv = this.agent.metta.query('(conversation $channel $user $input $response)');
                if (recentConv?.length) {
                    context.startupHistory = recentConv.slice(-5).map(r => {
                        const inp = r.$input?.value ?? r.$input?.name ?? '';
                        const resp = r.$response?.value ?? r.$response?.name ?? '';
                        return `[prior] user: ${inp} → bot: ${resp}`;
                    }).join('\n');
                }
            } catch (e) { Logger.debug('[IMP] Startup orient history failed:', e.message); }
        }
    }

    async _buildContext(content, context) {
        const parts = {};

        await this._buildSlotRecall(parts, content);
        await this._buildSlotBeliefs(parts, content);
        this._buildSlotWM(parts, context);
        this._buildSlotHistory(parts, context);
        await this._buildSlotFeedback(parts);
        this._buildSlotSkills(parts);
        this._buildSlotStartupOrient(parts, context);

        return parts;
    }

    async _buildSlotRecall(parts, content) {
        if (!this.agent.semanticMemory || !content) {return;}
        try {
            await this.agent.semanticMemory.initialize();
            const memories = await this.agent.semanticMemory.query(content, 5);
            if (memories.length) {
                parts.RECALL = memories.map(m =>
                    `[${m.type || 'memory'}] ${m.content}${m.score ? ` (relevance: ${m.score.toFixed(2)})` : ''}`
                ).join('\n');
            }
        } catch (e) { Logger.debug('SemanticMemory query failed:', e.message); }
    }

    async _buildSlotBeliefs(parts, content) {
        try {
            const beliefs = this.agent.getBeliefs?.() ?? [];
            if (!beliefs.length) {return;}
            const keywords = new Set(content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
            const relevant = beliefs.filter(b => [...keywords].some(kw => String(b).toLowerCase().includes(kw))).slice(0, 5);
            if (relevant.length) {parts.BELIEFS = relevant.map(b => String(b)).join('\n');}
        } catch (e) { Logger.debug('NARS beliefs query failed:', e.message); }
    }

    _buildSlotWM(parts, context) {
        const entries = context.wmEntries ?? [];
        if (!entries.length) {return;}
        parts.WM = entries
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            .map(e => `[${(e.priority ?? 0.5).toFixed(1)}] ${e.content} (TTL: ${e.ttl ?? 0})`)
            .join('\n');
    }

    _buildSlotHistory(parts, context) {
        const history = context.messages.slice(-this.config.maxContextLength).map(m => `${m.from}: ${m.content}`).join('\n');
        if (history) {parts.HISTORY = history;}
    }

    async _buildSlotFeedback(parts) {
        if (!this._auditSpace) {return;}
        try {
            const recentErrors = this._auditSpace.getRecent(3).filter(e => e.type?.includes('error') || e.type?.includes('blocked') || e.type?.includes('failed'));
            if (recentErrors.length) {
                parts.FEEDBACK = recentErrors.map(e => `[${e.type}] ${e.reason ?? e.error ?? e.result ?? ''}`.substring(0, 200)).join('\n');
            }
        } catch (e) { Logger.debug('AuditSpace feedback failed:', e.message); }
    }

    _buildSlotSkills(parts) {
        if (!this._skillDispatcher) {return;}
        const skillDefs = this._skillDispatcher.getActiveSkillDefs();
        if (skillDefs && !skillDefs.startsWith('(no skills')) {parts.SKILLS = skillDefs;}
    }

    _buildSlotStartupOrient(parts, context) {
        const segments = [];
        if (context.startupBeliefs?.length) {segments.push(`[BELIEFS] ${context.startupBeliefs.join('; ')}`);}
        if (context.startupFeedback) {segments.push(`[FEEDBACK] ${context.startupFeedback}`);}
        if (context.startupHistory) {segments.push(`[HISTORY] ${context.startupHistory}`);}
        if (segments.length) {parts.STARTUP_ORIENT = segments.join('\n');}
    }

    _formatContext(parts, inputLabel = 'INPUT', inputContent = '') {
        const sections = SKILL_SLOT_ORDER.filter(s => parts[s]).map(s => `${s}:\n${parts[s]}`);
        if (inputContent) {sections.push(`${inputLabel}:\n${inputContent}`);}
        return sections.join('\n\n');
    }

    _buildSystemPrompt(useSkillDispatch = false) {
        const base = `You are ${this.config.botNick}, a helpful assistant. Be CONCISE and DIRECT. Answer in 1-2 sentences max (under 300 characters). Personality: ${this.config.personality}`;
        if (!useSkillDispatch || !this._skillDispatcher) {return base;}
        const skillDefs = this._skillDispatcher.getActiveSkillDefs();
        return `${base}\n\nRespond with S-expression skill calls when taking actions. Example: (respond "The answer is 4.")\n\nAvailable skills:\n${skillDefs}`;
    }

    _detectSkillDispatchResponse(text) {
        const trimmed = (text ?? '').trim();
        if (!trimmed) {return false;}
        let depth = 0, inStr = false, escaped = false;
        for (const ch of trimmed) {
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') { inStr = !inStr; continue; }
            if (inStr) {continue;}
            if (ch === '(') {depth++;}
            else if (ch === ')') {depth = Math.max(0, depth - 1);}
            if (depth > 0 && !inStr) {return true;}
        }
        return false;
    }

    async _invokeLLM(contextStr, inputContent) {
        const useSkillDispatch = !!this._skillDispatcher;
        const systemPrompt = this._buildSystemPrompt(useSkillDispatch);
        const startTime = Date.now();

        let result;
        try {
            result = await this.agent.ai.generate([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: contextStr ? `${contextStr}\n\n${inputContent}` : inputContent }
            ]);
        } catch (error) {
            Logger.error('LLM invocation failed:', error.message);
            return null;
        }

        const latency = Date.now() - startTime;
        await this._auditEmitLlmCall(this.agent.ai?.defaultModel ?? 'unknown', contextStr.length, result?.text?.length ?? 0, latency, result?.usage ?? {});

        const text = result?.text?.trim() ?? '';
        if (!useSkillDispatch || !this._detectSkillDispatchResponse(text)) {
            return { response: text || null, skillResults: null };
        }

        const { cmds, error } = this._skillDispatcher.parseResponse(text);
        if (!cmds?.length || error) {return { response: text, skillResults: null };}

        const results = await this._skillDispatcher.execute(cmds);
        const respondResult = results.find(r => r.skill === 'respond' && !r.error);
        return { response: respondResult?.result?.text ?? text, skillResults: results };
    }

    async _handleCommand(content, from, channel, context) {
        const cmdContent = content.replace(/^[!/.]\s*/, '').trim();
        const [cmd, ...args] = cmdContent.split(/\s+/);
        const argStr = args.join(' ');

        const builtInCommands = {
            help: () => this._getHelpMessage(),
            ping: () => 'Pong!',
            version: () => `${this.config.botNick} v1.0 - Intelligent Agent`,
            uptime: () => {
                const uptime = Math.floor((Date.now() - this._startedAt) / 1000);
                return isNaN(uptime) || uptime < 0 ? 'Uptime: unknown' : `Uptime: ${Math.floor(uptime / 60)}m ${uptime % 60}s`;
            },
            stats: () => `Messages: ${this.stats.messagesProcessed}, Responses: ${this.stats.responsesGenerated}`,
            whoami: () => `You are ${from}`,
            context: () => this._dumpContextDump(channel, from, context),
            remember: async () => {
                const text = argStr || cmdContent.replace(/^remember\s+(that\s+)?/i, '').trim();
                if (!text) {return 'Remember what? Usage: !remember <text>';}
                if (this.agent.semanticMemory) {
                    await this.agent.semanticMemory.remember({ content: text, type: 'user-taught', source: from });
                    return `I'll remember: "${text.substring(0, 100)}"`;
                }
                return `Noted: "${text.substring(0, 100)}"`;
            },
            think: async () => {
                const text = argStr || cmdContent.replace(/^think\s+(about\s+)?/i, '').trim();
                if (!text) {return 'Think about what? Usage: !think <topic>';}
                if (context.wmEntries) {context.wmEntries.push({ content: text, priority: 0.7, ttl: 5 });}
                return `Thinking about: "${text.substring(0, 100)}"`;
            },
            attend: async () => {
                const text = argStr || cmdContent.replace(/^attend\s+(to\s+)?/i, '').trim();
                if (!text) {return 'Attend to what? Usage: !attend <topic>';}
                if (context.wmEntries) {context.wmEntries.push({ content: text, priority: 0.9, ttl: 3 });}
                return `Attending to: "${text.substring(0, 100)}"`;
            },
        };

        const handler = builtInCommands[cmd.toLowerCase()];
        if (handler) {
            try { return { response: await handler(), action: 'command', skillResults: null }; }
            catch (error) { return { response: `Error: ${error.message}`, action: 'command', skillResults: null }; }
        }

        if (this.agent.commandRegistry?.get(cmd)) {
            try {
                const result = await this.agent.commandRegistry.execute(cmd, this.agent, ...args);
                return { response: result, action: 'command', skillResults: null };
            } catch (error) { return { response: `Command error: ${error.message}`, action: 'command', skillResults: null }; }
        }

        return { response: `Unknown command: ${cmd}. Type !help for available commands.`, action: 'command', skillResults: null };
    }

    async _dumpContextDump(channel, from, context) {
        const ctx = this.contexts.get(`${channel}:${from}`) ?? context;
        const lines = ['=== System State ==='];

        if (ctx.startupBeliefs || ctx.startupFeedback || ctx.startupHistory) {
            lines.push('\nSTARTUP_ORIENT:');
            if (ctx.startupBeliefs) {lines.push(`  BELIEFS: ${ctx.startupBeliefs.join('; ')}`);}
            if (ctx.startupFeedback) {lines.push(`  FEEDBACK: ${ctx.startupFeedback}`);}
            if (ctx.startupHistory) {lines.push(`  HISTORY: ${ctx.startupHistory}`);}
        }

        if (this.agent.semanticMemory) {
            try {
                const recent = await this.agent.semanticMemory.getRecent(10) ?? [];
                lines.push(`\nRECALL (${recent.length} recent):`);
                lines.push(recent.length
                    ? recent.map(m => `  [${m.type ?? '?'}] ${m.content.substring(0, 120)}`).join('\n  ')
                    : '  (empty)');
            } catch (e) { lines.push('\nRECALL: (query failed)'); }
        }

        const beliefs = this.agent.getBeliefs?.() ?? [];
        if (beliefs.length) {lines.push(`\nBELIEFS (${beliefs.length} total):\n  ${beliefs.slice(0, 8).join('\n  ')}`);}

        const wm = ctx.wmEntries ?? [];
        if (wm.length) {lines.push(`\nWM (${wm.length} entries):\n  ${wm.map(e => `[${(e.priority ?? 0.5).toFixed(1)}] ${e.content.substring(0, 100)}`).join('\n  ')}`);}

        if (ctx.messages?.length) {lines.push(`\nHISTORY (${ctx.messages.length} messages):\n  ${ctx.messages.slice(-10).map(m => `${m.from}: ${m.content.substring(0, 100)}`).join('\n  ')}`);}

        if (this._auditSpace) {
            const recentErrors = this._auditSpace.getRecent(5).filter(e => e.type?.includes('error') || e.type?.includes('blocked'));
            if (recentErrors.length) {lines.push(`\nFEEDBACK (${recentErrors.length} recent issues):\n  ${recentErrors.map(e => `[${e.type}] ${e.reason ?? e.error ?? ''}`.substring(0, 120)).join('\n  ')}`);}
        }

        if (this._skillDispatcher) {
            const skillDefs = this._skillDispatcher.getActiveSkillDefs();
            lines.push(`\nSKILLS:\n  ${skillDefs.split('\n').join('\n  ')}`);
        }

        lines.push(`\nLLM: ${this.agent.ai?.defaultProvider ?? '?'}/${this.agent.ai?.defaultModel ?? '?'}`);
        lines.push('\n=== End State ===');
        return lines.join('\n');
    }

    async _handleQuestion(content, context) {
        const structuredContext = await this._buildContext(content, context);
        const contextStr = this._formatContext(structuredContext);
        const result = await this._invokeLLM(contextStr, `Question: ${content}`);
        return { response: result?.response ?? "Not sure about that one.", action: 'answer', skillResults: result?.skillResults ?? null };
    }

    async _handleStatement(content, context) {
        const structuredContext = await this._buildContext(content, context);
        const contextStr = this._formatContext(structuredContext);
        const result = await this._invokeLLM(contextStr, `Message: ${content}`);
        return { response: result?.response ?? null, action: 'response', skillResults: result?.skillResults ?? null };
    }

    _handleGreeting(content, from, context) {
        const lastGreeting = context.messages.filter(m => m.from === this.config.botNick).slice(-1)[0]?.content;
        const idx = GREETINGS.findIndex(g => g.replace('{name}', from) === lastGreeting);
        return GREETINGS[idx >= 0 ? (idx + 1) % GREETINGS.length : Math.floor(Math.random() * GREETINGS.length)].replace('{name}', from);
    }

    _getOrCreateContext(key) {
        if (!this.contexts.has(key)) {
            this.contexts.set(key, { messages: [], lastActivity: Date.now(), topic: null, sentiment: 'neutral', wmEntries: [] });
        }
        return this.contexts.get(key);
    }

    _trimContext(context) {
        const now = Date.now();
        const cutoff = now - this.config.contextWindowMs;
        context.messages = context.messages.filter(m => m.timestamp > cutoff);
        if (context.messages.length > this.config.maxContextLength) {
            const evicted = context.messages.splice(0, context.messages.length - this.config.maxContextLength);
            this._saveEvictedToMeTTa(evicted, context);
        }
        context.lastActivity = now;

        if (context.wmEntries?.length) {
            context.wmEntries = context.wmEntries.map(e => ({ ...e, ttl: (e.ttl ?? 0) - 1 })).filter(e => e.ttl > 0);
        }
    }

    _saveEvictedToMeTTa(evicted, context) {
        if (!this.agent.metta) {return;}
        for (const msg of evicted) {
            if (msg.from === this.config.botNick) {
                const prevMsg = context.messages.find(m => m.from !== this.config.botNick && m.timestamp < msg.timestamp);
                if (prevMsg) {this._storeMeTTaAtom(`(conversation "evicted" "${prevMsg.from}" "${this._safeAtom(prevMsg.content)}" "${this._safeAtom(msg.content)}")`);}
            }
        }
    }

    _isMessageForBot(content, channel) {
        if (!this.config.respondToMentions) {return false;}
        const nick = this.config.botNick;
        return [
            new RegExp(`\\b${nick}\\b`, 'i'),
            new RegExp(`^${nick}[:,\\s]`, 'i'),
            new RegExp(`[:,\\s]${nick}[!?\\.]*$`, 'i')
        ].some(p => p.test(content));
    }

    _stripNickPrefix(content) {
        return content.replace(new RegExp(`^\\s*${this.config.botNick}[,:\\s]+\\s*`, 'i'), '').trim();
    }

    async _classifyMessage(content, isMentioned, isPrivate) {
        const cacheKey = `${content.length}:${content.slice(0, 50)}`;
        if (this.classificationCache.has(cacheKey)) {return this.classificationCache.get(cacheKey);}

        const classification = (isPrivate || isMentioned)
            ? await this._llmClassify(content)
            : this._heuristicClassify(content);

        this.classificationCache.set(cacheKey, classification);
        return classification;
    }

    _heuristicClassify(content) {
        const lower = content.toLowerCase().trim();
        if (lower.startsWith('!') || lower.startsWith('/') || lower.startsWith('.')) {return { type: 'command', confidence: 0.9 };}
        if (lower.endsWith('?') || QUESTION_STARTERS.has(lower.split(' ')[0])) {return { type: 'question', confidence: 0.8 };}
        if (GREETING_KEYWORDS.has(lower.split(' ')[0])) {return { type: 'greeting', confidence: 0.85 };}
        if ([...FAREWELL_KEYWORDS].some(f => lower.includes(f))) {return { type: 'farewell', confidence: 0.8 };}
        return { type: 'statement', confidence: 0.5 };
    }

    async _llmClassify(content) {
        if (!this.agent.ai) {return this._heuristicClassify(content);}
        try {
            const result = await this.agent.ai.generate(`Classify this message into one of: command, question, greeting, farewell, statement.\nMessage: "${content}"\nRespond with just the type name.`);
            return { type: result.text?.toLowerCase().trim() || 'statement', confidence: 0.7 };
        } catch {
            Logger.debug('LLM classification failed, using heuristics');
            return this._heuristicClassify(content);
        }
    }

    _shouldRespond(classification, isMentioned, isPrivate) {
        if (isPrivate || isMentioned) {return true;}
        if (classification.type === 'command' && this.config.respondToCommands) {return true;}
        if (classification.type === 'greeting' && this.config.respondToGreeting) {return true;}
        return classification.type === 'question' && classification.confidence >= this.config.questionThreshold && this.config.respondToQuestions;
    }

    async _learnFromMessage(msg) {
        if (!this.agent.metta) {return;}
        const { from, content, channel } = msg;
        this._storeMeTTaAtom(`(heard "${channel}" "${from}" "${this._safeAtom(content)}")`);
    }

    async _learnFromExchange(msg, response) {
        if (!this.agent.metta) {return;}
        const { from, content, channel } = msg;
        this._storeMeTTaAtom(`(conversation "${channel}" "${from}" "${this._safeAtom(content)}" "${this._safeAtom(response)}")`);
    }

    _safeAtom(str) {
        return String(str).replace(/[()"]/g, '').substring(0, 200);
    }

    _storeMeTTaAtom(atom) {
        try { this.agent.metta?.run(atom); }
        catch (e) { Logger.debug('[IMP] MeTTa atom store failed:', e.message); }
    }

    async _auditEmit(type, data) {
        if (this._auditSpace) {
            try { await this._auditSpace.emit(type, data); }
            catch (e) { Logger.debug('[IMP] Audit emit failed:', e.message); }
        }
    }

    async _auditEmitLlmCall(model, promptChars, responseChars, latencyMs, tokenUsage) {
        if (this._auditSpace) {
            try { await this._auditSpace.emitLlmCall(model, promptChars, responseChars, latencyMs, tokenUsage); }
            catch (e) { Logger.debug('[IMP] LLM audit emit failed:', e.message); }
        }
    }

    _getHelpMessage() {
        return `${this.config.botNick} Commands: !help | !ping | !version | !uptime | !stats | !context | !whoami | !users | !remember <text> | !think <text> | !attend <text> — or just talk naturally!`;
    }

    getStats() { return { ...this.stats, activeContexts: this.contexts.size, cacheSize: this.classificationCache.size }; }
    clearContext(key) { this.contexts.delete(key); }
    clearAllContexts() { this.contexts.clear(); }
}
