/**
 * MettaParser.js - Unified MeTTa S-expression parser
 * Consolidates parsing logic from SemanticMemory and AuditSpace.
 */

export class MettaParser {
    constructor() {
        this._handlers = new Map();
    }

    registerHandler(prefix, handler) {
        this._handlers.set(prefix, handler);
    }

    parse(content) {
        const results = [];
        let current = null, currentKey = null, inMultiline = false, multilineBuffer = [];

        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }

            const startMatch = trimmed.match(/^\((\w+)/);
            if (startMatch) {
                const prefix = startMatch[1];
                current = {_type: prefix};
                currentKey = null;
                inMultiline = false;
                multilineBuffer = [];
                continue;
            }

            if (trimmed === ')') {
                if (current) {
                    if (inMultiline && multilineBuffer.length > 0) {
                        current[currentKey] = multilineBuffer.join(' ').trim();
                    }
                    const handler = this._handlers.get(current._type);
                    results.push(handler ? handler(current) : current);
                }
                current = null;
                continue;
            }

            if (!current) {
                continue;
            }

            const match = trimmed.match(/^:(\w+)\s*(.*)$/);
            if (match) {
                if (inMultiline && multilineBuffer.length > 0) {
                    current[currentKey] = multilineBuffer.join(' ').trim();
                }
                currentKey = match[1];
                const value = match[2].trim();
                if (value.startsWith('(') && !value.includes(')')) {
                    inMultiline = true;
                    multilineBuffer = [value];
                } else {
                    inMultiline = false;
                    current[currentKey] = this._parseValue(currentKey, value);
                }
            } else if (inMultiline) {
                multilineBuffer.push(trimmed);
            } else if (currentKey) {
                current[currentKey] = this._parseValue(currentKey, trimmed);
            }
        }

        return results;
    }

    _parseValue(key, value) {
        if (key === 'tags' && value.startsWith('(')) {
            return value.slice(1, -1).split('"').filter(s => s.trim()).map(s => s.trim());
        }
        if (key === 'truth') {
            const stvMatch = value.match(/\(stv\s+([\d.]+)\s+([\d.]+)\)/);
            if (stvMatch) {
                return {frequency: parseFloat(stvMatch[1]), confidence: parseFloat(stvMatch[2])};
            }
        }
        if (['timestamp', 'id', 'cycle'].includes(key)) {
            const num = parseInt(value, 10);
            if (!isNaN(num)) {
                return num;
            }
        }
        return value.replace(/^"|"$/g, '').replace(/^:/, '');
    }
}

export function stripQuotes(str) {
    return str?.replace(/^"|"$/g, '') ?? '';
}

export function escapeQuotes(str) {
    return str?.replace(/"/g, '\\"') ?? '';
}

export function toMettaAtom(type, fields) {
    const lines = [`(${type}`];
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null) {
            continue;
        }
        let formatted;
        if (typeof value === 'number') {
            formatted = String(value);
        } else if (key === 'truth' || key === 'skill') {
            formatted = value;
        } else if (key === 'type') {
            formatted = value;
        } else if (key === 'tags') {
            formatted = `(${value.split(' ').map(t => `"${t}"`).join(' ')})`;
        } else {
            formatted = `"${escapeQuotes(value)}"`;
        }
        lines.push(`  :${key.padEnd(9)} ${formatted}`);
    }
    lines.push(')');
    return lines.join('\n');
}
