import { jest } from '@jest/globals';
import { MemoryInspector } from '../../../src/components/MemoryInspector.js';
import { ReactiveState } from '../../../src/core/ReactiveState.js';

describe('MemoryInspector Component', () => {
    let container;
    let inspector;
    let mockApp;

    beforeEach(() => {
        jest.clearAllMocks();
        container = document.createElement('div');
        inspector = new MemoryInspector(container);
        // MemoryInspector.initialize() is usually called by the app or manually
        inspector.initialize();
    });

    test('should render structure', () => {
        expect(container.classList.contains('mi-container')).toBe(true);
        expect(container.querySelector('.mi-toolbar')).toBeTruthy();
        expect(container.querySelector('#mi-content')).toBeTruthy();
    });

    test('should have initial state', () => {
        expect(inspector.state.filterText).toBe('');
        expect(inspector.state.viewMode).toBe('list');
        expect(inspector.state.listMode).toBe('compact');
    });

    test('should filter data', () => {
        const data = [
            { term: 'concept1', budget: { priority: 0.9 } },
            { term: 'concept2', budget: { priority: 0.5 } }
        ];

        inspector.update({ concepts: data });
        expect(inspector.state.filteredData.length).toBe(2);

        inspector.state.filterText = 'concept1';
        expect(inspector.state.filteredData.length).toBe(1);
        expect(inspector.state.filteredData[0].term).toBe('concept1');
    });

    test('should sort data by priority desc by default', () => {
        const data = [
            { term: 'A', budget: { priority: 0.2 } },
            { term: 'B', budget: { priority: 0.8 } }
        ];
        inspector.update({ concepts: data });

        const sorted = inspector.state.filteredData;
        expect(sorted[0].term).toBe('B');
        expect(sorted[1].term).toBe('A');
    });

    test('should render list items', () => {
        const data = [
            { term: 'C1', budget: { priority: 0.8 } },
            { term: 'C2', budget: { priority: 0.6 } }
        ];
        inspector.update({ concepts: data });

        // Wait for reactivity (synchronous in current implementation but good to be safe)
        const list = container.querySelector('.mi-list');
        expect(list).toBeTruthy();
        // ConceptCards render into list. Assuming they create some elements.
        // ConceptCard implementation might need to be checked, usually creates a card div.
        // We can check if list has children.
        expect(list.children.length).toBe(2);
    });

    test('should update viewMode when concept selected', () => {
        inspector.selectConcept({ term: 'C1', id: '1' });
        expect(inspector.state.viewMode).toBe('details');

        // Check if details view rendered
        const details = container.querySelector('.mi-details');
        expect(details).toBeTruthy();
    });

    test('toolbar filter input should update state', () => {
        const input = container.querySelector('#mi-filter-text');
        expect(input).toBeTruthy();

        input.value = 'test';
        input.dispatchEvent(new Event('input'));

        expect(inspector.state.filterText).toBe('test');
    });
});
