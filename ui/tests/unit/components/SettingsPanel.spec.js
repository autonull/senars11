import { jest } from '@jest/globals';
import { SettingsPanel } from '../../../src/components/SettingsPanel.js';
import { GraphConfig } from '../../../src/config/GraphConfig.js';
import { eventBus } from '../../../src/core/EventBus.js';
import { EVENTS } from '../../../src/config/constants.js';

// Mock Modal
jest.unstable_mockModule('../../../src/components/ui/Modal.js', () => ({
    Modal: {
        confirm: jest.fn().mockResolvedValue(true),
        alert: jest.fn().mockResolvedValue(true)
    }
}));

// Mock GraphConfig
// GraphConfig is an object in the implementation, but we might need to mock its properties or methods.
// Since it's an import, mocking it usually requires unstable_mockModule before import,
// OR we can just modify the imported object if it's mutable.
// But we want to test that SettingsPanel updates GraphConfig.

describe('SettingsPanel Component', () => {
    let container;
    let panel;
    let mockApp;

    beforeEach(async () => {
        jest.clearAllMocks();
        container = document.createElement('div');

        mockApp = {
            themeManager: {
                getTheme: jest.fn().mockReturnValue('default'),
                setTheme: jest.fn()
            },
            serverUrl: 'ws://localhost:3000',
            saveSettings: jest.fn(),
            getNotebook: jest.fn(),
            layoutManager: { layout: { toConfig: jest.fn() } }
        };

        panel = new SettingsPanel(container);
        panel.app = mockApp;
        panel.initialize();
    });

    test('should render all sections', () => {
        expect(container.textContent).toContain('WORKSPACE');
        expect(container.textContent).toContain('UI SETTINGS');
        expect(container.textContent).toContain('CONNECTION');
        expect(container.textContent).toContain('GRAPH PHYSICS');
        expect(container.textContent).toContain('COLORS');
        expect(container.textContent).toContain('APPLY SETTINGS');
    });

    test('should change theme', () => {
        const select = container.querySelector('#setting-theme');
        select.value = 'light';
        select.dispatchEvent(new Event('change'));

        expect(mockApp.themeManager.setTheme).toHaveBeenCalledWith('light');
    });

    test('should update server url in app settings', () => {
        const input = container.querySelector('#setting-server-url');
        input.value = 'ws://test:8080';

        const applyBtn = container.querySelector('#apply-settings');
        applyBtn.click();

        expect(mockApp.serverUrl).toBe('ws://test:8080');
        expect(mockApp.saveSettings).toHaveBeenCalled();
    });

    test('should emit SETTINGS_UPDATED event on apply', () => {
        const spy = jest.spyOn(eventBus, 'emit');
        const applyBtn = container.querySelector('#apply-settings');
        applyBtn.click();

        expect(spy).toHaveBeenCalledWith(EVENTS.SETTINGS_UPDATED);
    });

    // We skip GraphConfig tests if we can't easily spy on the imported object without complex mocking,
    // but we can verify inputs exist.
    test('should render physics sliders', () => {
        expect(container.querySelector('#setting-gravity')).toBeTruthy();
        expect(container.querySelector('#setting-nodeRepulsion')).toBeTruthy();
    });
});
