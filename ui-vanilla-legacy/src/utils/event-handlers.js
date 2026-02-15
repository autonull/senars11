/**
 * Shared event handler utilities for the SeNARS UI
 */

import { selectElement } from './common.js';

/**
 * Add event listener with error handling
 * @param {EventTarget} element - Element to attach listener to
 * @param {string} event - Event name
 * @param {Function} handler - Event handler function
 * @param {Object} [options] - Event listener options
 */
export function addSafeEventListener(element, event, handler, options) {
  if (!element || typeof handler !== 'function') {
    console.warn('Invalid element or handler for event listener', { element, event });
    return;
  }
  
  try {
    element.addEventListener(event, handler, options);
  } catch (error) {
    console.error(`Failed to add event listener for ${event}`, error);
  }
}

/**
 * Create command history manager
 * @param {string} storageKey - LocalStorage key for command history
 * @param {number} maxLength - Maximum history length
 * @returns {Object} Command history manager with add, get, navigate methods
 */
export function createCommandHistoryManager(storageKey = 'replCommandHistory', maxLength = 100) {
  let history = [];
  
  // Load history from storage
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        history = parsed.slice(-maxLength);
      }
    }
  } catch (e) {
    console.warn(`Could not load command history from localStorage: ${storageKey}`, e);
  }
  
  return {
    /**
     * Add command to history
     * @param {string} command - Command to add
     */
    add(command) {
      if (command && (history.length === 0 || history[history.length - 1] !== command)) {
        history.push(command);
        history = history.slice(-maxLength);
        this.save();
      }
    },
    
    /**
     * Get command history
     * @returns {string[]} Command history array
     */
    get() {
      return [...history]; // Return copy
    },
    
    /**
     * Navigate through history
     * @param {number} direction - 1 for forward, -1 for backward
     * @param {number} currentIndex - Current history index
     * @returns {{command: string, newIndex: number}} Command and new index
     */
    navigate(direction, currentIndex) {
      if (history.length === 0) {
        return { command: '', newIndex: -1 };
      }
      
      let newIndex = currentIndex + direction;
      
      // Clamp to valid range [-1, history.length - 1]
      newIndex = Math.max(-1, Math.min(newIndex, history.length - 1));
      
      const command = newIndex < 0 ? '' : history[history.length - 1 - newIndex];
      return { command, newIndex };
    },
    
    /**
     * Save history to storage
     */
    save() {
      try {
        localStorage.setItem(storageKey, JSON.stringify(history));
      } catch (e) {
        console.warn(`Could not save command history to localStorage: ${storageKey}`, e);
      }
    },
    
    /**
     * Clear history
     */
    clear() {
      history = [];
      this.save();
    }
  };
}

/**
 * Create input handler with command history support
 * @param {HTMLInputElement} inputElement - Input element
 * @param {Function} commandHandler - Function to handle commands
 * @param {Object} historyManager - Command history manager
 * @returns {Object} Input handler object
 */
export function createInputHandler(inputElement, commandHandler, historyManager) {
  let historyIndex = -1;
  
  const handleEnter = (event) => {
    if (event.key === 'Enter') {
      const command = inputElement.value.trim();
      if (command) {
        historyManager.add(command);
        commandHandler(command);
        inputElement.value = '';
        historyIndex = -1; // Reset history index after command
      }
    }
  };
  
  const handleArrowKeys = (event) => {
    if (event.key === 'ArrowUp') {
      const result = historyManager.navigate(-1, historyIndex);
      historyIndex = result.newIndex;
      inputElement.value = result.command;
      event.preventDefault();
    } else if (event.key === 'ArrowDown') {
      const result = historyManager.navigate(1, historyIndex);
      historyIndex = result.newIndex;
      inputElement.value = result.command;
      event.preventDefault();
    }
  };
  
  // Attach event listeners
  addSafeEventListener(inputElement, 'keypress', handleEnter);
  addSafeEventListener(inputElement, 'keydown', handleArrowKeys);
  
  return {
    destroy() {
      // Remove event listeners if needed
      inputElement.removeEventListener('keypress', handleEnter);
      inputElement.removeEventListener('keydown', handleArrowKeys);
    }
  };
}

/**
 * Create output logger with scroll management
 * @param {HTMLElement} outputElement - Output element
 * @returns {Object} Logger object with add, clear methods
 */
export function createOutputLogger(outputElement) {
  if (!outputElement) {
    console.warn('Invalid output element for logger');
    return {
      add: () => {},
      clear: () => {},
      scrollToBottom: () => {}
    };
  }
  
  const add = (text) => {
    outputElement.textContent += text + '\n';
    outputElement.scrollTop = outputElement.scrollHeight;
  };
  
  const clear = () => {
    outputElement.textContent = '';
  };
  
  const scrollToBottom = () => {
    outputElement.scrollTop = outputElement.scrollHeight;
  };
  
  return { add, clear, scrollToBottom };
}

/**
 * Create state change handler
 * @param {Function} dispatch - Store dispatch function
 * @param {string} actionType - Action type to dispatch
 * @param {Function} [selector] - Optional function to extract payload from state
 * @returns {Function} State change handler
 */
export function createStateChangeHandler(dispatch, actionType, selector) {
  return (state) => {
    const payload = selector ? selector(state) : state;
    dispatch({ type: actionType, payload });
  };
}