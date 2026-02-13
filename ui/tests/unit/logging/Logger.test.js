/**
 * @file Logger.test.js
 * @description Unit tests for Logger class functionality
 */

import { jest } from '@jest/globals';

// Mock @senars/core to avoid uuid issues
jest.unstable_mockModule('@senars/core', () => ({
    UI_CONSTANTS: {
        LOG_ICONS: { INFO: 'ℹ️' },
        LOG_TYPES: { INFO: 'info' }
    }
}));

// Dynamic import to use mock
const { Logger } = await import('../../../src/logging/Logger.js');

describe('Logger', () => {
    let logger;
    let mockLogViewer;

    beforeEach(() => {
        logger = new Logger();
        mockLogViewer = {
            addLog: jest.fn(),
            logMarkdown: jest.fn(),
            logWidget: jest.fn(),
            clear: jest.fn()
        };
        logger.logViewer = mockLogViewer;
    });

    test('should delegate log entry to logViewer', () => {
        logger.addLogEntry('Test message', 'info');
        expect(mockLogViewer.addLog).toHaveBeenCalledWith('Test message', 'info', null);
    });

    test('should delegate clear logs to logViewer', () => {
        logger.clearLogs();
        expect(mockLogViewer.clear).toHaveBeenCalled();
    });

    test('should delegate logMarkdown to logViewer', () => {
        logger.logMarkdown('# Title');
        expect(mockLogViewer.logMarkdown).toHaveBeenCalledWith('# Title');
    });

    test('should delegate logWidget to logViewer', () => {
        const data = { foo: 'bar' };
        logger.logWidget('testWidget', data);
        expect(mockLogViewer.logWidget).toHaveBeenCalledWith('testWidget', data);
    });

    test('should handle notification display', () => {
        const mockContainer = document.createElement('div');
        mockContainer.id = 'notification-container';
        document.body.appendChild(mockContainer);

        logger.showNotification('Test notification', 'info');

        const notification = mockContainer.querySelector('.notification');
        expect(notification).toBeTruthy();
        expect(notification.textContent).toBe('Test notification');
        expect(notification.classList.contains('notification-info')).toBe(true);

        document.body.removeChild(mockContainer);
    });
});
