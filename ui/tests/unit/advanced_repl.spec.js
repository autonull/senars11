import { jest } from '@jest/globals';
import { MessageFilter, VIEW_MODES } from '../../src/notebook/MessageFilter.js';
import { ReactiveState } from '../../src/core/ReactiveState.js';

describe('MessageFilter Reactivity', () => {
    let filter;

    beforeEach(() => {
        filter = new MessageFilter();
        // Clear local storage logic for clean test
        filter.state.modeMap = {};
        filter.state.searchTerm = '';
    });

    test('updates state on cycleCategoryMode', () => {
        filter.state.modeMap = { 'reasoning': VIEW_MODES.FULL };

        filter.cycleCategoryMode('reasoning');
        expect(filter.getCategoryMode('reasoning')).toBe(VIEW_MODES.COMPACT);

        filter.cycleCategoryMode('reasoning');
        expect(filter.getCategoryMode('reasoning')).toBe(VIEW_MODES.HIDDEN);
    });

    test('updates state on search', () => {
        filter.setSearchTerm('hello');
        expect(filter.state.searchTerm).toBe('hello');
        expect(filter.searchTerm).toBe('hello');
    });

    test('getMessageViewMode honors search', () => {
        filter.state.modeMap = { 'result': VIEW_MODES.FULL };
        filter.setSearchTerm('found');

        const msg1 = { type: 'result', content: 'This is found' };
        const msg2 = { type: 'result', content: 'This is lost' };

        expect(filter.getMessageViewMode(msg1)).not.toBe(VIEW_MODES.HIDDEN);
        expect(filter.getMessageViewMode(msg2)).toBe(VIEW_MODES.HIDDEN);
    });
});
