class Logger {
    constructor() {
        this.isTestEnv = this._detectTestEnvironment();
        this.silent = this.isTestEnv;
        this.levels = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
        this.currentLevel = this.levels.INFO;
    }

    _detectTestEnvironment() {
        if (typeof process !== 'undefined') {
            if (process.env.NODE_ENV === 'test' ||
                process.env.JEST_WORKER_ID !== undefined ||
                process.env.VITEST === 'true') return true;
        }

        const g = typeof globalThis !== 'undefined' ? globalThis :
                  typeof window !== 'undefined' ? window : {};

        return !!(g.__JEST__ || g.__VITEST__);
    }

    _isDebugMode() {
        if (typeof process !== 'undefined' && process.env) {
             return process.env.NODE_ENV === 'development' || process.env.DEBUG;
        }
        return false;
    }

    shouldLog(level) {
        if (this.silent) return false;
        const levelValue = this.levels[level.toUpperCase()] ?? this.levels.INFO;

        if (level === 'debug' && !this._isDebugMode()) return false;

        return levelValue <= this.currentLevel;
    }

    log(level, msg, data) {
        if (!this.shouldLog(level)) return;

        const message = typeof msg === 'function' ? msg() : msg;
        const logData = typeof data === 'function' ? data() : data;

        const consoleMethod = console[level] || console.log;
        const prefix = `[${level.toUpperCase()}]`;

        if (logData !== undefined) {
            consoleMethod(prefix, message, logData);
        } else {
            consoleMethod(prefix, message);
        }
    }

    debug(msg, data) { this.log('debug', msg, data); }
    info(msg, data) { this.log('info', msg, data); }
    warn(msg, data) { this.log('warn', msg, data); }
    error(msg, data) { this.log('error', msg, data); }

    setSilent(silent) { this.silent = silent; }

    setLevel(level) {
        const levelValue = this.levels[level.toUpperCase()];
        if (levelValue !== undefined) {
            this.currentLevel = levelValue;
        }
    }

    getIsTestEnv() { return this.isTestEnv; }

    getLevel() {
        return Object.keys(this.levels).find(key => this.levels[key] === this.currentLevel);
    }
}

const logger = new Logger();
export { logger as Logger };
