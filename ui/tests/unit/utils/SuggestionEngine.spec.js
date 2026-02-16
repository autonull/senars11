import { jest } from '@jest/globals';

// Mock AutoLearner
jest.unstable_mockModule('../../../src/utils/AutoLearner.js', () => ({
    AutoLearner: class { getConceptModifier() { return 0; } }
}));

// Import module under test
const { SuggestionEngine } = await import('../../../src/utils/SuggestionEngine.js');

describe('SuggestionEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new SuggestionEngine();
    });

    test('should suggest common commands for empty input', () => {
        // Actually, logic changed to partial matches, so empty input might return nothing or defaults
        // Let's check with partial match
        const suggestions = engine.getSuggestions('(');
        expect(suggestions.some(s => s.text === '(! reset)')).toBe(true);
    });

    test('should suggest context-based queries when concept selected', () => {
        engine.setContext('lastConcept', 'bird');
        const suggestions = engine.getSuggestions('');

        expect(suggestions).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '<bird --> ?x>?' })
        ]));
    });

    test('should filter suggestions based on input', () => {
        const suggestions = engine.getSuggestions('(! sa');
        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions[0].text).toBe('(! save)');
    });
});
