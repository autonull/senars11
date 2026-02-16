import { jest } from '@jest/globals';

// Import module under test
const { AutoLearner } = await import('../../../src/utils/AutoLearner.js');

describe('AutoLearner', () => {
    let learner;
    let setItemSpy;
    let getItemSpy;

    beforeEach(() => {
        // Mock LocalStorage using Object.defineProperty to overwrite the global
        // property because jsdom environment might have it read-only or pre-defined

        const localStorageMock = {
            getItem: jest.fn(),
            setItem: jest.fn(),
            removeItem: jest.fn(),
            clear: jest.fn()
        };

        Object.defineProperty(global, 'localStorage', {
            value: localStorageMock,
            writable: true
        });

        setItemSpy = localStorageMock.setItem;
        getItemSpy = localStorageMock.getItem;

        learner = new AutoLearner();
    });

    test('should initialize with empty preferences if storage is empty', () => {
        expect(learner.getConceptModifier('bird')).toBe(0);
    });

    test('should record interaction and increase weight', () => {
        learner.recordInteraction('bird', 1);
        expect(learner.getConceptModifier('bird')).toBe(1);

        learner.recordInteraction('bird', 5);
        expect(learner.getConceptModifier('bird')).toBe(6);
    });

    test('should persist preferences to localStorage', () => {
        learner.recordInteraction('cat', 2);
        expect(setItemSpy).toHaveBeenCalledWith(
            'senars-ui-learner',
            expect.stringContaining('"cat":2')
        );
    });

    test('should cap weight at 100', () => {
        learner.recordInteraction('dog', 200);
        expect(learner.getConceptModifier('dog')).toBe(100);
    });
});
