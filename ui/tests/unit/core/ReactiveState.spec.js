import { ReactiveState } from '../../../src/core/ReactiveState.js';

describe('ReactiveState', () => {
    test('should initialize with state', () => {
        const state = new ReactiveState({ count: 0, name: 'test' });
        expect(state.count).toBe(0);
        expect(state.name).toBe('test');
    });

    test('should update state and trigger watchers', () => {
        const state = new ReactiveState({ count: 0 });
        let triggered = false;
        let newValue, oldValue;

        state.watch('count', (newVal, oldVal) => {
            triggered = true;
            newValue = newVal;
            oldValue = oldVal;
        });

        state.count = 1;

        expect(triggered).toBe(true);
        expect(newValue).toBe(1);
        expect(oldValue).toBe(0);
        expect(state.count).toBe(1);
    });

    test('should handle computed properties', () => {
        const state = new ReactiveState({ count: 1 });

        state.computed('doubled', function() {
            return this.count * 2;
        });

        expect(state.doubled).toBe(2);

        state.count = 2;
        expect(state.doubled).toBe(4);
    });

    test('should handle computed properties depending on other computed properties', () => {
        const state = new ReactiveState({ count: 1 });

        state.computed('doubled', function() {
            return this.count * 2;
        });

        state.computed('quadrupled', function() {
            return this.doubled * 2;
        });

        expect(state.quadrupled).toBe(4);

        state.count = 3;
        expect(state.doubled).toBe(6);
        expect(state.quadrupled).toBe(12);
    });

    test('should access other properties in computed', () => {
        const state = new ReactiveState({
            firstName: 'John',
            lastName: 'Doe'
        });

        state.computed('fullName', function() {
            return `${this.firstName} ${this.lastName}`;
        });

        expect(state.fullName).toBe('John Doe');

        state.lastName = 'Smith';
        expect(state.fullName).toBe('John Smith');
    });
});
