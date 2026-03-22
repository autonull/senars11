/**
 * Formatting utilities for enhanced REPL output
 */
import {ANSI_COLORS} from '@senars/core';
import {DisplayUtils} from '@senars/core/src/util/DisplayUtils.js';

// Alias for backward compatibility
const COLORS = {
    reset: ANSI_COLORS.reset,
    bright: ANSI_COLORS.bright,
    dim: ANSI_COLORS.dim,
    fg: ANSI_COLORS.fg,
    bg: ANSI_COLORS.bg
};


export class ReplFormattingUtils {
    static colorize(text, color) {
        if (process.env.NODE_DISABLE_COLORS === '1') return text;
        const [cat, key] = color.split('.');
        const code = key ? COLORS[cat]?.[key] : COLORS[color] || COLORS.fg[color];
        return `${code || ''}${text}${COLORS.reset}`;
    }

    static formatTable(data, headers) {
        if (!data?.length) return 'No data to display';

        // Use DisplayUtils.createTable for the base table structure
        const table = DisplayUtils.createTable(headers || [], data);

        // Apply REPL-specific colorization to the header if present
        if (headers) {
            const lines = table.split('\n');
            // The header row is typically the second line (after the top border)
            lines[1] = this.colorize(lines[1], 'bright');
            return lines.join('\n');
        }

        return table;
    }

    static formatBanner(text, {width, bgColor} = {}) {
        width = width || Math.max(text.length + 4, 50);
        const line = '═'.repeat(width);
        const padding = ' '.repeat(Math.floor((width - text.length) / 2));
        const center = padding + text;

        const middle = bgColor ? this.colorize(center, `bg.${bgColor}`) : center;
        return `${this.colorize(line, 'bright')}\n${middle}\n${this.colorize(line, 'bright')}`;
    }

    static _formatList(items, limit, headers, mapper) {
        if (!items?.length) return 'No data to display';
        const data = items.slice(0, limit).map(mapper);
        let result = this.formatTable(data, headers);
        if (items.length > limit) result += `\n  ... and ${items.length - limit} more`;
        return result;
    }

    static formatBeliefs(beliefs) {
        return this._formatList(beliefs, 20, ['Term', 'Freq', 'Conf'], b => [
            b.term?.toString?.() ?? b.term ?? 'Unknown',
            b.truth?.frequency?.toFixed(3) ?? '1.000',
            b.truth?.confidence?.toFixed(3) ?? '0.900'
        ]);
    }

    static formatGoals(goals) {
        return this._formatList(goals, 20, ['Term', 'Freq', 'Conf'], g => [
            g.term?.toString?.() ?? g.term ?? 'Unknown',
            g.truth?.frequency?.toFixed(3) ?? '1.000',
            g.truth?.confidence?.toFixed(3) ?? '0.900'
        ]);
    }

    static formatConcepts(concepts, term = null) {
        const filtered = term
            ? concepts.filter(c => c.term?.toString?.().toLowerCase().includes(term.toLowerCase()))
            : concepts;

        if (!filtered.length) return term ? `No concepts found containing: ${term}` : 'No concepts to display';

        return this._formatList(filtered, 20, ['Term', 'Beliefs', 'Goals', 'Questions', 'Activation'], c => [
            c.term?.toString?.() ?? c.term ?? 'Unknown',
            c.getBeliefs ? c.getBeliefs().length : 0,
            c.getGoals ? c.getGoals().length : 0,
            c.getQuestions ? c.getQuestions().length : 0,
            c.activation?.toFixed(3) ?? '0.000'
        ]);
    }

    static stylizeOutput(output, type = 'info') {
        const styles = {
            answer: 'fg.brightCyan',
            event: 'fg.brightCyan',
            derivation: 'fg.green',
            error: 'fg.red'
        };
        if (type === 'banner') return this.colorize(output, 'bg.blue') + this.colorize(' ', 'reset') + output;
        return styles[type] ? this.colorize(output, styles[type]) : output;
    }
}
