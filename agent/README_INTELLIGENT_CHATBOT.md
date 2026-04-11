# SeNARS Intelligent IRC ChatBot

A fully-featured, intelligent IRC chatbot built on the SeNARS cognitive architecture with MeTTa language integration and
LLM-powered responses.

## Features

### Core Capabilities

- **Intelligent Message Processing**: Classifies messages as questions, commands, greetings, or statements
- **LLM-Powered Responses**: Uses Ollama with configurable models (default: Qwen3-8B)
- **MeTTa Integration**: Cognitive architecture for reasoning and memory
- **SeNARS Memory**: Belief storage and conversation learning
- **Per-Channel Rate Limiting**: Prevents spam with configurable rate limits
- **Context-Aware Conversations**: Maintains conversation history per user/channel

### IRC Features

- Channel messages and private messages
- CTCP support (VERSION, PING, TIME, INFO)
- User tracking (joins, parts, quits, nick changes)
- Action messages (/me)
- Notice messages
- Channel topic management
- Auto-reconnect with exponential backoff

### Multi-Channel Architecture (Prototype)

- **IRC**: Full implementation (irc-framework)
- **Matrix**: Prototype implementation (matrix-js-sdk)
- **CLI**: Terminal-based interaction
- **Nostr**: Decentralized network support

### Built-in Commands

```
!help     - Show available commands
!ping     - Check bot responsiveness
!version  - Show bot version
!uptime   - Show bot uptime
!stats    - Show message statistics
!whoami   - Show your nickname
!users    - List users in channel
```

## Quick Start

### Prerequisites

1. Node.js 18+
2. Ollama running locally with desired model
3. IRC server access

### Installation

```bash
cd agent
npm install
```

### Running the ChatBot

```bash
# Default: Connect to irc.quakenet.org ##metta
node examples/chatbot/run-intelligent-chatbot.js

# Custom server and channel
node examples/chatbot/run-intelligent-chatbot.js \
  --host irc.libera.chat \
  --channel #test \
  --nick my-bot

# Use different Ollama model
node examples/chatbot/run-intelligent-chatbot.js \
  --model llama3.2

# Enable debug logging
node examples/chatbot/run-intelligent-chatbot.js --debug

# Show all options
node examples/chatbot/run-intelligent-chatbot.js --help
```

### Command Line Options

| Option          | Short | Default                                   | Description                 |
|-----------------|-------|-------------------------------------------|-----------------------------|
| `--host`        | `-h`  | `irc.quakenet.org`                        | IRC server hostname         |
| `--port`        | `-p`  | `6667`                                    | IRC server port             |
| `--nick`        | `-n`  | `senars-bot`                              | Bot nickname                |
| `--channel`     | `-c`  | `##metta`                                 | Channel to join             |
| `--model`       | `-m`  | `hf.co/bartowski/Qwen_Qwen3-8B-GGUF:Q6_K` | Ollama model                |
| `--ollama-url`  |       | `http://localhost:11434`                  | Ollama API URL              |
| `--tls`         |       | `false`                                   | Enable TLS                  |
| `--debug`       |       | `false`                                   | Enable debug logging        |
| `--personality` |       | (default)                                 | Bot personality description |

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Intelligent ChatBot                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ IRCChannel      │  │ MatrixChannel   │  │ CLIChannel  │ │
│  │ (irc-framework) │  │ (matrix-js-sdk) │  │ (readline)  │ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │
│           │                    │                   │        │
│           └────────────────────┼───────────────────┘        │
│                                │                            │
│                    ┌───────────▼───────────┐                │
│                    │   ChannelManager      │                │
│                    │   - Rate Limiting     │                │
│                    │   - Event Routing     │                │
│                    └───────────┬───────────┘                │
│                                │                            │
│                    ┌───────────▼───────────┐                │
│                    │ IntelligentMessage    │                │
│                    │ Processor             │                │
│                    │ - Classification      │                │
│                    │ - Context Management  │                │
│                    │ - Response Generation │                │
│                    └───────────┬───────────┘                │
│                                │                            │
│           ┌────────────────────┼───────────────────┐        │
│           │                    │                   │        │
│  ┌────────▼────────┐  ┌───────▼───────┐  ┌───────▼──────┐ │
│  │ AIClient        │  │ MeTTa         │  │ SeNARS NAR   │ │
│  │ (Ollama/LLM)    │  │ (Cognitive)   │  │ (Reasoning)  │ │
│  └─────────────────┘  └───────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Message Flow

1. **Incoming Message** → IRCChannel receives message
2. **Event Routing** → ChannelManager routes to agent
3. **Classification** → IntelligentMessageProcessor classifies type
4. **Context** → Retrieves conversation context
5. **Response Generation** → LLM generates appropriate response
6. **Rate Limiting** → PerChannelRateLimiter ensures no spam
7. **Outgoing Message** → IRCChannel sends response

## Configuration

### Rate Limiting

Default settings prevent spam while allowing natural conversation:

```javascript
rateLimit: {
    perChannelMax: 5,        // Messages per channel
    perChannelInterval: 10000, // Refill interval (ms)
    globalMax: 20,           // Global message limit
    globalInterval: 10000    // Global refill interval
}
```

### Personality

Customize bot behavior:

```javascript
personality: 'helpful, knowledgeable, and concise. ' +
             'You are an intelligent assistant focused on ' +
             'reasoning and learning.'
```

### Ollama Models

Tested models:

- `hf.co/bartowski/Qwen_Qwen3-8B-GGUF:Q6_K` (default)
- `llama3.2`
- `mistral`
- `gemma2`

## Testing

### Run All Tests

```bash
# Unit tests only
node tests/e2e/test-chatbot.js

# With integration tests (requires network)
node tests/e2e/test-chatbot.js --integration
```

### Test Coverage

- ✅ Message classification (question, command, greeting, statement)
- ✅ Response logic (mentions, private messages)
- ✅ Command handling (!help, !ping, !version, etc.)
- ✅ Context management
- ✅ Rate limiting
- ✅ IRC connection
- ✅ CTCP handling
- ✅ Full message processing pipeline

## MeTTa Integration

The chatbot integrates with MeTTa for cognitive operations:

```metta
; Get conversation history
!(get-history "##metta" "username")

; Clear conversation context
!(clear-context "##metta" "username")

; Get bot statistics
!(get-stats)

; Store belief from conversation
!(heard "##metta" "user" "message content")
```

## Programmatic Usage

### Using the ChatBot Class

```javascript
import { IntelligentChatBot } from './examples/chatbot/run-intelligent-chatbot.js';

const bot = new IntelligentChatBot({
    host: 'irc.quakenet.org',
    port: 6667,
    nick: 'my-bot',
    channel: '##metta',
    model: 'llama3.2',
    debug: true
});

await bot.initialize();
await bot.start();

// Graceful shutdown
process.on('SIGINT', () => bot.shutdown());
```

### Using Components Individually

```javascript
import { IRCChannel } from './src/io/channels/IRCChannel.js';
import { IntelligentMessageProcessor } from './src/ai/IntelligentMessageProcessor.js';

// Create IRC channel
const irc = new IRCChannel({
    id: 'my-bot',
    host: 'irc.quakenet.org',
    nick: 'my-bot',
    channels: ['##metta']
});

// Create message processor
const processor = new IntelligentMessageProcessor(agent, {
    botNick: 'my-bot',
    respondToQuestions: true
});

// Handle messages
irc.on('message', async (msg) => {
    const result = await processor.processMessage(msg);
    if (result.shouldRespond) {
        await irc.sendMessage(msg.metadata.channel, result.response);
    }
});

await irc.connect();
```

## Extending

### Adding New Commands

```javascript
// In IntelligentMessageProcessor.js
const builtInCommands = {
    'custom': async () => {
        return 'Custom command response';
    }
};
```

### Adding New Channels

```javascript
// Create new channel class
import { Channel } from './Channel.js';

export class CustomChannel extends Channel {
    constructor(config = {}) {
        super(config);
        this.type = 'custom';
    }
    
    async connect() { /* ... */ }
    async disconnect() { /* ... */ }
    async sendMessage(target, content, metadata = {}) { /* ... */ }
}
```

### Custom Message Classification

```javascript
const processor = new IntelligentMessageProcessor(agent, {
    questionThreshold: 0.8,  // Higher = more confident
    commandThreshold: 0.9
});
```

## Troubleshooting

### Connection Issues

```bash
# Check IRC server accessibility
telnet irc.quakenet.org 6667

# Test with TLS
node examples/chatbot/run-intelligent-chatbot.js --tls
```

### Ollama Issues

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Pull model if missing
ollama pull hf.co/bartowski/Qwen_Qwen3-8B-GGUF:Q6_K
```

### Rate Limiting

If messages are being throttled:

- Increase `perChannelMax`
- Decrease `perChannelInterval`
- Check `getRateLimitStats()` for current state

## Performance

- **Message Classification**: <10ms (heuristic), <100ms (LLM)
- **Response Generation**: 500-2000ms (depends on LLM)
- **Rate Limiting**: <1ms overhead
- **Memory**: ~50MB base, +1KB per active conversation context

## Security Considerations

- Never commit API keys or credentials
- Use environment variables for sensitive config
- Rate limiting prevents abuse
- Input sanitization for MeTTa expressions
- CTCP auto-responses are safe and limited

## Future Enhancements

- [ ] Matrix channel full implementation
- [ ] Nostr channel integration
- [ ] Web interface for monitoring
- [ ] Plugin system for custom commands
- [ ] Multi-language support
- [ ] Voice message support
- [ ] Image/file sharing
- [ ] Advanced moderation tools

## License

Part of the SeNARS project. See main LICENSE file.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test`
4. Submit a pull request

## Support

For issues and questions:

- GitHub Issues
- IRC: `##metta` on irc.quakenet.org
- Documentation: See `README_CHATBOT.md`
