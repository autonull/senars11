# Chatbot Interface & Channels

This extension provides a unified interface for connecting the Agent to external communication channels like IRC and
Nostr, as well as providing web search capabilities. It replicates the functionality of `mettaclaw` within the SeNARS JS
environment.

## Supported Channels

### IRC

Connects to IRC servers.

- **Protocol**: `irc`
- **Config**:
    - `host`: Server hostname (default: `irc.libera.chat`)
    - `port`: Server port (default: `6667`)
    - `nick`: Bot nickname
    - `username`: Username
    - `password`: Optional password
    - `tls`: Enable TLS (default: `true`)
    - `channels`: List of channels to auto-join

### Nostr

Connects to the Nostr decentralized network.

- **Protocol**: `nostr`
- **Config**:
    - `privateKey`: Hex private key (nsec). If omitted, an ephemeral key is generated.
    - `relays`: List of relay URLs.
    - `filters`: Custom subscription filters.

### Web Search

Provides web search functionality.

- **Tool**: `web-search`
- **Config**:
    - `provider`: `google` or `mock` (default).
    - `apiKey`: Google Custom Search API Key.
    - `cx`: Google Custom Search Context ID.

## MeTTa API

The `channels.metta` library provides a high-level API:

```metta
!(import! &self (library channels))

; Connect to IRC
!(irc-connect "irc.libera.chat" "my-bot")

; Connect to Nostr
!(nostr-connect "nsec1...")

; Send a message
!(send "channel_id" "Hello world!")

; Perform a search
!(search "metta language")
```

## JS Architecture

- `agent/src/io/ChannelManager.js`: Central router.
- `agent/src/io/channels/`: Protocol implementations.
- `metta/src/extensions/ChannelExtension.js`: MeTTa primitive bindings.

## Setup

Install dependencies:

```bash
npm install irc-framework nostr-tools ws
```
