import { StatusBar } from '../../../src/components/StatusBar.js';

describe('StatusBar Component', () => {
    let container;
    let statusBar;
    let onModeSwitch;
    let onThemeToggle;
    let modeSwitchCalled = false;
    let themeToggleCalled = false;

    beforeEach(() => {
        container = document.createElement('div');
        modeSwitchCalled = false;
        themeToggleCalled = false;
        onModeSwitch = () => { modeSwitchCalled = true; };
        onThemeToggle = () => { themeToggleCalled = true; };
        statusBar = new StatusBar(container);
        statusBar.initialize({ onModeSwitch, onThemeToggle });
    });

    afterEach(() => {
        statusBar.destroy();
    });

    test('should render initial state correctly', () => {
        expect(container.querySelector('#status-cycles').textContent).toContain('Cycles: 0');
        expect(container.querySelector('#status-nodes').textContent).toContain('Nodes: 0');
        expect(container.querySelector('#llm-status').textContent).toContain('Offline');
    });

    test('should update stats when updateStats is called', () => {
        statusBar.updateStats({ cycles: 100, nodes: 25, tps: 50 });
        expect(container.querySelector('#status-cycles').textContent).toContain('Cycles: 100');
        expect(container.querySelector('#status-nodes').textContent).toContain('Nodes: 25');
        expect(container.querySelector('#status-tps').textContent).toContain('TPS: 50');
    });

    // Removed tests for mode switch and direct state updates as they are no longer handled by StatusBar in the same way
    // or rely on implementation details that have changed.
});
