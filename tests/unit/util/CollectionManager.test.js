import {batchUpdate, createCollectionManager, createObjectManager} from '../../../ui-react-legacy/src/utils/CollectionManager.js';

describe('CollectionManager', () => {
    describe('createCollectionManager', () => {
        test('add method works for new items', () => {
            const manager = createCollectionManager('items');
            const state = {items: []};
            const newItem = {id: 1, name: 'Test Item'};

            const newState = manager.add(newItem, 'id')(state);

            expect(newState.items).toHaveLength(1);
            expect(newState.items[0]).toEqual(newItem);
        });

        test('add method updates existing items by ID', () => {
            const manager = createCollectionManager('items');
            const existingItem = {id: 1, name: 'Original', value: 'old'};
            const state = {items: [existingItem]};
            const updatedItem = {id: 1, name: 'Updated', newValue: 'new'};

            const newState = manager.add(updatedItem, 'id')(state);

            expect(newState.items).toHaveLength(1);
            expect(newState.items[0].id).toBe(1);
            expect(newState.items[0].name).toBe('Updated');
            expect(newState.items[0].value).toBe('old'); // Should preserve old value
            expect(newState.items[0].newValue).toBe('new');
        });

        test('update method modifies specific item', () => {
            const manager = createCollectionManager('items');
            const existingItem = {id: 1, name: 'Original', status: 'active'};
            const state = {items: [existingItem]};
            const updates = {name: 'Updated', status: 'inactive'};

            const newState = manager.update(1, 'id', updates)(state);

            expect(newState.items[0].name).toBe('Updated');
            expect(newState.items[0].status).toBe('inactive');
            expect(newState.items[0].id).toBe(1); // ID should be preserved
        });

        test('remove method removes item properly', () => {
            const manager = createCollectionManager('items');
            const item1 = {id: 1, name: 'Item 1'};
            const item2 = {id: 2, name: 'Item 2'};
            const state = {items: [item1, item2]};

            const newState = manager.remove(1, 'id')(state);

            expect(newState.items).toHaveLength(1);
            expect(newState.items[0].id).toBe(2);
        });

        test('addLimited method enforces collection size limits', () => {
            const manager = createCollectionManager('items');
            const state = {items: [{id: 1}, {id: 2}]};
            const newItem = {id: 3, name: 'New Item'};

            const newState = manager.addLimited(newItem, 2, 'id')(state);

            expect(newState.items).toHaveLength(2);
            expect(newState.items[0].id).toBe(2); // First item removed due to limit
            expect(newState.items[1].id).toBe(3); // New item added
        });

        test('clear method removes all items', () => {
            const manager = createCollectionManager('items');
            const state = {items: [{id: 1}, {id: 2}]};

            const newState = manager.clear()(state);

            expect(newState.items).toHaveLength(0);
        });
    });

    describe('createObjectManager', () => {
        test('set method adds key-value pairs', () => {
            const manager = createObjectManager('config');
            const state = {config: {}};

            const newState = manager.set('key1', 'value1')(state);

            expect(newState.config.key1).toBe('value1');
        });

        test('set method updates existing key-value pairs', () => {
            const manager = createObjectManager('config');
            const state = {config: {key1: 'oldValue'}};

            const newState = manager.set('key1', 'newValue')(state);

            expect(newState.config.key1).toBe('newValue');
        });

        test('update method updates specific key properties', () => {
            const manager = createObjectManager('config');
            const state = {config: {key1: {prop1: 'old', prop2: 'unchanged'}}};
            const updates = {prop1: 'new', prop3: 'added'};

            const newState = manager.update('key1', updates)(state);

            expect(newState.config.key1.prop1).toBe('new');
            expect(newState.config.key1.prop2).toBe('unchanged');
            expect(newState.config.key1.prop3).toBe('added');
        });

        test('clear method empties object', () => {
            const manager = createObjectManager('config');
            const state = {config: {key1: 'value1', key2: 'value2'}};

            const newState = manager.clear()(state);

            expect(newState.config).toEqual({});
        });
    });

    describe('batchUpdate', () => {
        test('batchUpdate applies multiple updates at once', () => {
            let resultState = null;
            const mockSet = (updateFn) => {
                resultState = updateFn({items: [], config: {}, other: 'data'});
            };

            const updates = {
                items: [{id: 1, name: 'Updated'}],
                config: {showDetails: true}
            };

            batchUpdate(mockSet, updates);

            expect(resultState.items).toEqual([{id: 1, name: 'Updated'}]);
            expect(resultState.config.showDetails).toBe(true);
            expect(resultState.other).toBe('data'); // Should preserve unmodified properties
        });

        test('batchUpdate handles function updates', () => {
            let resultState = null;
            const mockSet = (updateFn) => {
                resultState = updateFn({items: [{id: 1, name: 'Existing'}]});
            };

            const updates = {
                items: (prevState) => [...prevState.items, {id: 2, name: 'Added'}]
            };

            batchUpdate(mockSet, updates);

            expect(resultState.items).toHaveLength(2);
            expect(resultState.items[0].id).toBe(1);
            expect(resultState.items[1].id).toBe(2);
        });
    });
});