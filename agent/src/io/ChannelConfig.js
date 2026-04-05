import { Logger } from '@senars/core';
import fs from 'fs';
import path from 'path';

export class ChannelConfig {
    static load(configPath) {
        let config = { channels: {} };
        if (configPath && fs.existsSync(configPath)) {
            try {
                const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                config = { ...config, ...fileConfig };
                Logger.info(`Loaded channel config from ${configPath}`);
            } catch (error) {
                Logger.error(`Failed to load config file ${configPath}:`, error);
            }
        }
        if (process.env.IRC_HOST) {
            config.channels.irc = config.channels.irc || {};
            config.channels.irc.host = process.env.IRC_HOST;
            if (process.env.IRC_PORT) config.channels.irc.port = parseInt(process.env.IRC_PORT);
            if (process.env.IRC_NICK) config.channels.irc.nick = process.env.IRC_NICK;
            if (process.env.IRC_CHANNELS) config.channels.irc.channels = process.env.IRC_CHANNELS.split(',');
        }
        if (process.env.NOSTR_PRIVATE_KEY) {
            config.channels.nostr = config.channels.nostr || {};
            config.channels.nostr.privateKey = process.env.NOSTR_PRIVATE_KEY;
            if (process.env.NOSTR_RELAYS) config.channels.nostr.relays = process.env.NOSTR_RELAYS.split(',');
        }
        if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_CX) {
            config.tools = config.tools || {};
            config.tools.websearch = { provider: 'google', apiKey: process.env.GOOGLE_API_KEY, cx: process.env.GOOGLE_CX };
        }
        return config;
    }
}
