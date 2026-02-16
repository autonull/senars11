import { jest } from '@jest/globals';

// Mock Logger
const mockLogger = { log: jest.fn() };

// Mock WebSocketManager & CommandProcessor
const mockWS = { sendMessage: jest.fn() };
const mockCP = { webSocketManager: mockWS };

// Mock DemoManager
const mockDemoManager = {
    logger: mockLogger,
    commandProcessor: mockCP
};

// Import module under test
const { InteractiveDemoManager } = await import('../../../src/demo/InteractiveDemoManager.js');

describe('InteractiveDemoManager', () => {
    let manager;

    beforeEach(() => {
        manager = new InteractiveDemoManager(mockDemoManager);
        mockLogger.log.mockClear();
        mockWS.sendMessage.mockClear();
    });

    test('should handle widget input request', () => {
        const payload = {
            requestId: 'req_1',
            type: 'widget_input',
            widgetType: 'slider',
            config: { max: 10 }
        };

        manager.handleDemoRequest(payload);

        // Should log the prompt
        expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('Input required'), 'input', '❓');

        // Should log the widget request (which renders it)
        expect(mockLogger.log).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'widget',
                widgetType: 'slider',
                config: expect.objectContaining({ max: 10 })
            }),
            'input',
            '🎮'
        );
    });

    test('should send response back to backend', () => {
        // Simulate widget callback
        manager._handleWidgetResponse('req_1', { value: 5 });

        expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('User provided input'), 'info', '✅');
        expect(mockWS.sendMessage).toHaveBeenCalledWith('demo.response', {
            requestId: 'req_1',
            value: { value: 5 }
        });
    });
});
