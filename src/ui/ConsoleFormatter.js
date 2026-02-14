import {UI_CONSTANTS} from '../util/UIConstants.js';

const COLORS = {
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    MAGENTA: '\x1b[35m',
    CYAN: '\x1b[36m',
    WHITE: '\x1b[37m',
    GRAY: '\x1b[90m',
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m'
};

export class ConsoleFormatter {
    static format(logEntry) {
        const {type, icon, content, timestamp} = logEntry;
        const color = this.getColorForType(type);
        const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString() : '';

        let formattedContent = content;
        if (typeof content === 'object') {
            formattedContent = JSON.stringify(content, null, 2);
        }

        return `${COLORS.GRAY}[${timeStr}]${COLORS.RESET} ${color}${icon || ''} ${formattedContent}${COLORS.RESET}`;
    }

    static getColorForType(type) {
        switch (type) {
            case 'error': return COLORS.RED;
            case 'success': return COLORS.GREEN;
            case 'warning': return COLORS.YELLOW;
            case 'info': return COLORS.BLUE;
            case 'debug': return COLORS.GRAY;
            case 'input': return COLORS.CYAN;
            case 'reasoning': return COLORS.MAGENTA;
            case 'task': return COLORS.GREEN;
            case 'concept': return COLORS.YELLOW;
            case 'control': return COLORS.BOLD + COLORS.WHITE;
            default: return COLORS.WHITE;
        }
    }
}
