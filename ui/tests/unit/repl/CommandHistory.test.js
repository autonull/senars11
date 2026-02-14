import { jest } from '@jest/globals';
import { CommandHistory } from '../../../src/repl/CommandHistory.js';

describe('CommandHistory', () => {
    let history;

    // We must ensure the module sees our mock localStorage.
    // The issue might be that CommandHistory is imported ONCE, and if it captured a reference to localStorage (unlikely)
    // or if the test environment setup is tricky.

    // In JSDOM, localStorage exists on window and global.

    beforeEach(() => {
        // Reset localStorage for each test
        const store = {};
        const mockStorage = {
            getItem: jest.fn((key) => store[key] || null),
            setItem: jest.fn((key, value) => { store[key] = value.toString(); }),
            clear: jest.fn(() => { for (const k in store) delete store[k]; })
        };

        Object.defineProperty(global, 'localStorage', {
            value: mockStorage,
            writable: true
        });

        history = new CommandHistory();
    });

    test('adds commands', () => {
        history.add('cmd1');
        history.add('cmd2');
        expect(history.history).toEqual(['cmd1', 'cmd2']);
    });

    test('ignores duplicates if sequential', () => {
        expect(history.history.length).toBe(0);
        history.add('cmd1');
        history.add('cmd1');
        expect(history.history).toEqual(['cmd1']);
    });

    test('navigates history', () => {
        history.add('1');
        history.add('2');
        history.add('3');
        // Pointer is at end (3)

        // Arrow Up
        expect(history.getPrevious('current')).toBe('3');
        expect(history.getPrevious('3')).toBe('2');
        expect(history.getPrevious('2')).toBe('1');
        // After this pointer is 0

        // Arrow Down
        expect(history.getNext()).toBe('2');
        expect(history.getNext()).toBe('3');
        expect(history.getNext()).toBe('current'); // Restore temp input
    });
});
