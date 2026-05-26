/**
 * Safety layer for unified validation and PII protection across MCP operations.
 * Implements specifications from docs/plan/mcp.md.
 */
export class Safety {
    constructor(config = {}) {
        this.config = {
            piiDetection: config.piiDetection === true, // Disabled by default
            ...config
        };
    }

    /**
     * Detects and redacts PII from input.
     * Note: Does NOT sanitize HTML entities to preserve Narsese syntax (<term --> term>).
     */
    detectAndTokenizePII(input) {
        if (!this.config.piiDetection) {
            return input;
        }

        if (typeof input === 'string') {
            const patterns = [
                {regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, type: 'EMAIL'},
                {regex: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, type: 'PHONE'},
                {regex: /\d{3}-\d{2}-\d{4}/g, type: 'SSN'}
            ];

            let result = input;
            for (const {regex, type} of patterns) {
                result = result.replace(regex, `[${type}_REDACTED]`);
            }
            return result;
        } else if (typeof input === 'object' && input !== null) {
            if (Array.isArray(input)) {
                return input.map(item => this.detectAndTokenizePII(item));
            }
            return Object.fromEntries(
                Object.entries(input).map(([key, value]) => [key, this.detectAndTokenizePII(value)])
            );
        }
        return input;
    }

    validateInput(input) {
        return this.detectAndTokenizePII(input);
    }
}
