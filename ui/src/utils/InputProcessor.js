/**
 * Input processing utilities for SeNARS UI
 * Provides validation and error handling for user input
 */

/**
 * Process NAL input lines with proper error handling
 * @param {string} content - Input content to process
 * @param {Object} nar - NAR instance to process input
 * @param {Function} logFn - Logging function
 * @returns {Object} Processing results
 */
export function processNalInput(content, nar, logFn) {
    const lines = content.split('\n');
    let validCount = 0;
    const errors = [];

    for (const line of lines) {
        const trim = line.trim();
        if (!trim || trim.startsWith('//') || trim.startsWith(';')) {
            continue;
        }

        try {
            nar?.input(trim);
            validCount++;
        } catch (error) {
            errors.push({ line: trim, error: error.message });
            logFn?.(`Invalid NAL expression: ${trim}`, 'warning');
        }
    }

    return {
        processed: lines.length,
        valid: validCount,
        errors
    };
}

/**
 * Validate and sanitize user input
 * @param {string} input - Raw user input
 * @returns {Object} Validation result
 */
export function validateInput(input) {
    if (typeof input !== 'string') {
        return { valid: false, error: 'Input must be a string' };
    }

    const trimmed = input.trim();
    if (!trimmed) {
        return { valid: false, error: 'Input cannot be empty' };
    }

    if (trimmed.length > 10000) {
        return { valid: false, error: 'Input exceeds maximum length of 10000 characters' };
    }

    return { valid: true, value: trimmed };
}
