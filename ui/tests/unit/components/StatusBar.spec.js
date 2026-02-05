import { StatusBar } from '../../../src/components/StatusBar.js';
import { MODES } from '../../../src/config/constants.js';

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
        expect(container.querySelector('.status-mode').textContent).toContain('Local Mode');
        expect(container.querySelector('#connection-status').textContent).toBe('Ready');
    });

    test('should update mode when updateMode is called', () => {
        statusBar.updateMode(MODES.REMOTE);
        expect(container.querySelector('.status-mode').textContent).toContain('Remote Mode');
    });

    test('should update status when updateStatus is called', () => {
        statusBar.updateStatus('Connected');
        expect(container.querySelector('#connection-status').textContent).toBe('Connected');
    });

    test('should update stats when updateStats is called', () => {
        statusBar.updateStats({ cycles: 100, messages: 50 });
        const textContent = container.textContent;
        expect(textContent).toContain('Cycles: 100');
        expect(textContent).toContain('Msgs: 50');
    });

    test('should trigger onModeSwitch when mode is clicked', () => {
        const modeEl = container.querySelector('.status-mode');
        modeEl.click();
        expect(modeSwitchCalled).toBe(true);
    });

    test('should trigger onThemeToggle when theme is clicked', () => {
        const themeEl = container.querySelector('.status-item.status-interactive');
        themeEl.click();
        expect(themeToggleCalled).toBe(true);
    });

    test('should update UI when state changes directly', () => {
        statusBar.state.status = 'Error';
        expect(container.querySelector('#connection-status').textContent).toBe('Error');
    });
});
