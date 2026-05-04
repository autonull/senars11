/**
 * irc-channel.test.js — Unit tests for IRCChannel message filtering.
 */

import { IRCChannel } from '@senars/agent/io/channels/IRCChannel.js';

function makeChannel() {
    const ch = new IRCChannel({
        id: 'test-irc',
        host: '127.0.0.1',
        port: 6667,
        nick: 'TestBot',
        username: 'testbot',
        realname: 'Test Bot',
        channels: ['##test'],
    });
    ch.client.user = { nick: 'TestBot' };
    return ch;
}

describe('IRCChannel', () => {
    test('has correct type', () => {
        expect(makeChannel().type).toBe('irc');
    });

    describe('_containsNickMention', () => {
        test('matches nick at start with colon', () => {
            expect(makeChannel()._containsNickMention('TestBot: hello there', 'TestBot')).toBe(true);
        });

        test('matches nick at start with comma', () => {
            expect(makeChannel()._containsNickMention('TestBot, are you there?', 'TestBot')).toBe(true);
        });

        test('matches nick with @ prefix', () => {
            expect(makeChannel()._containsNickMention('Hey @TestBot, help me', 'TestBot')).toBe(true);
        });

        test('matches nick as standalone word', () => {
            expect(makeChannel()._containsNickMention('hello TestBot!', 'TestBot')).toBe(true);
        });

        test('does NOT match nick embedded in URL', () => {
            expect(makeChannel()._containsNickMention('check out https://example.com/TestBot/page', 'TestBot')).toBe(false);
        });

        test('does NOT match nick as substring', () => {
            expect(makeChannel()._containsNickMention('TestBotter is a great player', 'TestBot')).toBe(false);
        });

        test('does NOT match partial nick at end', () => {
            expect(makeChannel()._containsNickMention('I said TestBots not TestBot', 'Test')).toBe(false);
        });

        test('handles nick with regex special chars', () => {
            const ch = makeChannel();
            ch.client.user = { nick: 'Test.Bot' };
            expect(ch._containsNickMention('TestXBot hello', 'Test.Bot')).toBe(false);
        });

        test('case insensitive', () => {
            const ch = makeChannel();
            expect(ch._containsNickMention('testbot: hi', 'TestBot')).toBe(true);
            expect(ch._containsNickMention('TESTBOT, ping', 'TestBot')).toBe(true);
        });

        test('returns false for empty nick', () => {
            expect(makeChannel()._containsNickMention('hello', '')).toBe(false);
        });
    });
});
