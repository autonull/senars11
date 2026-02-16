import { jest } from '@jest/globals';
import { EVENTS, STORAGE_KEYS } from '../../../src/config/constants.js';

// Import module under test
let ThemeManager;

beforeAll(async () => {
    const module = await import('../../../src/components/ThemeManager.js');
    ThemeManager = module.ThemeManager;
});

describe('ThemeManager', () => {
    let themeManager;
    let setItemSpy;

    beforeEach(() => {
        // Mock LocalStorage
        const localStorageMock = {
            getItem: jest.fn(() => null),
            setItem: jest.fn(),
        };
        Object.defineProperty(global, 'localStorage', {
            value: localStorageMock,
            writable: true
        });
        setItemSpy = localStorageMock.setItem;

        // Mock document.body.classList
        document.body.className = '';

        themeManager = new ThemeManager();
    });

    test('should load default theme if storage empty', () => {
        expect(themeManager.getTheme()).toBe('default');
    });

    test('should apply theme classes', () => {
        themeManager.setTheme('light');
        expect(document.body.classList.contains('theme-light')).toBe(true);
        expect(document.body.classList.contains('theme-contrast')).toBe(false);

        themeManager.setTheme('contrast');
        expect(document.body.classList.contains('theme-light')).toBe(false);
        expect(document.body.classList.contains('theme-contrast')).toBe(true);

        themeManager.setTheme('default');
        expect(document.body.classList.contains('theme-light')).toBe(false);
        expect(document.body.classList.contains('theme-contrast')).toBe(false);
    });

    test('should persist theme selection', () => {
        themeManager.setTheme('contrast');
        expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEYS.THEME, 'contrast');
    });

    test('should dispatch event on update', () => {
        const spy = jest.spyOn(document, 'dispatchEvent');
        themeManager.setTheme('light');
        expect(spy).toHaveBeenCalledWith(expect.any(CustomEvent));
        const event = spy.mock.calls[0][0];
        expect(event.type).toBe(EVENTS.SETTINGS_UPDATED);
        expect(event.detail.theme).toBe('light');
    });
});
