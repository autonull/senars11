/**
 * REPLView - A module that creates and manages the REPL UI elements
 */
import { createElement } from './utils/common.js';
import { createCommandHistoryManager, createInputHandler, createOutputLogger } from './utils/event-handlers.js';
import NarseseSyntaxHighlighter from './utils/narsese-syntax-highlighter.js';

export function init(container, onCommand) {
    // Create the input element with enhanced features
    const input = createElement('input', {
        type: 'text',
        id: 'repl-input',
        placeholder: 'Enter NARS command (e.g., <a --> b>.), use ↑↓ for history, Ctrl+Enter for submission'
    }, {
        width: '100%',
        padding: '8px',
        boxSizing: 'border-box',
        fontFamily: 'monospace'
    });

    // Reference to the new console output element
    const output = document.getElementById('console-output') || createElement('pre', {
        id: 'repl-output'
    }, {
        width: '100%',
        height: '300px',
        overflowY: 'auto',
        border: '1px solid #ccc',
        padding: '10px',
        backgroundColor: '#f9f9f9',
        marginTop: '10px',
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap'
    });

    if (!document.getElementById('console-output')) {
        output.textContent = 'SeNARS REPL - Ready\n';
    }

    // Create command history manager
    const historyManager = createCommandHistoryManager('replCommandHistory', 100);

    // Create output logger
    const logger = createOutputLogger(output);

    // Create syntax highlighter
    const syntaxHighlighter = new NarseseSyntaxHighlighter();

    // Input handler with enhanced features
    const inputHandler = createInputHandler(input, (command) => {
        addFormattedOutput(`> ${command}`, 'console-input');
        onCommand?.(command);
    }, historyManager);

    // Add additional keyboard shortcuts
    input.addEventListener('keydown', (event) => {
        // Ctrl+Enter for submission (alternative to Enter)
        if (event.ctrlKey && event.key === 'Enter') {
            event.preventDefault();
            const command = input.value.trim();
            if (command) {
                historyManager.add(command);
                onCommand?.(command);
                addFormattedOutput(`> ${command}`, 'console-input');
                input.value = '';
            }
        }
    });

    // Input validation with visual feedback
    input.addEventListener('input', () => {
        validateInput(input.value);
    });

    // Input validation function
    function validateInput(value) {
        if (!value) {
            input.style.borderColor = '';
            input.title = '';
            return;
        }

        try {
            // Basic Narsese syntax validation
            const isValid = isValidNarsese(value);
            if (isValid) {
                input.style.borderColor = 'green';
                input.title = 'Valid Narsese';
            } else {
                input.style.borderColor = 'red';
                input.title = 'Invalid Narsese syntax';
            }
        } catch (e) {
            // If validation fails, clear the styling
            input.style.borderColor = '';
            input.title = '';
        }
    }

    // Basic Narsese syntax validation helper
    function isValidNarsese(input) {
        // Check if it looks like a Narsese statement, query, or command
        const trimmed = input.trim();

        // System commands start with *
        if (trimmed.startsWith('*')) {
            return true;
        }

        // Check for basic Narsese patterns
        const narsesePatterns = [
            /<[^>]+>\s*[.?!]/,     // Basic statement: <subject --> predicate>.
            /<[^>]+>\s*[.?!]\s*%[\d.]+;[\d.]+%/,  // With truth values
            /<[^>]+>\s*[.?!]\s*%[\d.]+;[\d.]+%\s*;[\d.]+/  // With budget values
        ];

        return narsesePatterns.some(pattern => pattern.test(trimmed));
    }

    container.appendChild(input);

    // If using the default output area, append it to container
    if (!document.getElementById('console-output')) {
        container.appendChild(output);
    }

    // Return an object with methods to update the view
    return {
        addOutput: function(text, cssClass) {
            addFormattedOutput(text, cssClass);
        },
        clearOutput: function() {
            clearFormattedOutput();
        },
        setInput: function(value) {
            input.value = value;
            // Trigger validation for the new value
            validateInput(value);
        },
        getInput: function() {
            return input.value;
        },
        addToHistory: function(command) {
            historyManager.add(command);
        },
        setCommandHandler: function(handler) {
            // Reinitialize input handler with new command handler
            inputHandler.destroy();
            createInputHandler(input, handler, historyManager);
        },
        destroy: function() {
            inputHandler.destroy();
        },
        // Add method to get syntax highlighter for external use
        getSyntaxHighlighter: function() {
            return syntaxHighlighter;
        }
    };
}

// Helper function for formatted output
function addFormattedOutput(text, cssClass = 'console-output-line console-output') {
    const consoleOutput = document.getElementById('console-output');
    if (!consoleOutput) return;

    // Create a new line element with appropriate styling
    const lineElement = document.createElement('div');
    lineElement.className = cssClass;
    lineElement.classList.add('console-output-line');

    // Add the text content, handling newlines by creating multiple lines if needed
    const lines = text.split('\n');
    if (lines.length > 1) {
        lines.forEach((line, index) => {
            if (index > 0) {
                // Add a line break element for subsequent lines
                const br = document.createElement('br');
                consoleOutput.appendChild(br);
            }
            const span = document.createElement('span');
            span.textContent = line;
            lineElement.appendChild(span);
        });
    } else {
        lineElement.textContent = text;
    }

    consoleOutput.appendChild(lineElement);

    // Auto-scroll to the bottom
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function clearFormattedOutput() {
    const consoleOutput = document.getElementById('console-output');
    if (consoleOutput) {
        consoleOutput.innerHTML = '<div class="console-output-line console-info">SeNARS Console - Ready to receive commands</div>' +
                                  '<div class="console-output-line console-info">Type \'help\' for available commands</div>' +
                                  '<div class="console-output-line console-info">Type Narsese statements like: &lt;cat --&gt; animal&gt;.</div>';
    }
}