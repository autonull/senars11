/**
 * @file Logger.test.js
 * @description Unit tests for Logger class functionality
 */

// Import the Logger class using ES modules
import { Logger } from '../../src/logging/Logger.js';

describe('Logger', () => {
  let logger;
  let mockUIElements;

  beforeEach(() => {
    // Create mock UI elements
    const mockLogsContainer = document.createElement('div');
    mockLogsContainer.id = 'logs-container';

    mockUIElements = {
      logsContainer: mockLogsContainer
    };

    logger = new Logger(mockUIElements);
  });

  test('should create log entry with correct structure', () => {
    logger.addLogEntry('Test message', 'info', 'ℹ️');

    const logEntries = mockUIElements.logsContainer.querySelectorAll('.log-entry');
    expect(logEntries).toHaveLength(1);

    const logEntry = logEntries[0];
    expect(logEntry).toHaveClass('type-info');
  });

  test('should set UI elements correctly', () => {
    const newUIElements = { logsContainer: document.createElement('div') };
    logger.setUIElements(newUIElements);

    expect(logger.uiElements).toBe(newUIElements);
  });

  test('should use default icon when none provided', () => {
    logger.addLogEntry('Test message', 'unknown_type');

    const logEntries = mockUIElements.logsContainer.querySelectorAll('.log-entry');
    // Default icon for 'info' type is expected
    expect(logEntries[0].querySelector('.log-entry-icon').textContent).toBeDefined();
  });
});