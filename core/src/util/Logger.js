class Logger {
    constructor() {
        this.isTestEnv = this._detectTestEnvironment();
        this.silent = this.isTestEnv;
        this.levels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3
        };
        this.currentLevel = this.levels.INFO;
    }

    _detectTestEnvironment() {
        if (typeof process !== 'undefined' && (
            process.env.NODE_ENV === 'test' ||
            process.env.JEST_WORKER_ID !== undefined ||
            process.env.VITEST === 'true'
        )) return true;

        if (typeof window !== 'undefined' && (window.__JEST__ || window.__VITEST__)) return true;
        if (typeof globalThis !== 'undefined' && (globalThis.__JEST__ || globalThis.__VITEST__)) return true;

        return (typeof jest !== 'undefined' && !!jest.version) || (typeof vi !== 'undefined' && !!vi.version);
    }

    log(level, message, data = {}) {
        if (this.silent) return;

        const consoleMethod = console[level] || console.log;
        const prefixedMsg = `[${level.toUpperCase()}] ${message}`;

        // Improved mock detection
        if (this.isTestEnv) {
            const hasMock = consoleMethod._isMockFunction ||
                (consoleMethod.mock && Array.isArray(consoleMethod.mock.calls)) ||
                consoleMethod.__isMockFunction;

            if (hasMock) {
                consoleMethod(prefixedMsg, data);
            }
            // In test env, we still want to see logs in console if not mocked
            else if (process.env.SHOW_LOGS_IN_TESTS) {
                consoleMethod(prefixedMsg, data);
            }
        } else {
            consoleMethod(prefixedMsg, data);
        }
    }

    shouldLog(level) {
        const levelValue = this.levels[level.toUpperCase()] ?? this.levels.INFO;
        const isDebugAllowed = level !== 'debug' || this._isDebugMode();
        const isInfoAllowed = level !== 'info' || this._isInfoMode();

        return !this.silent && levelValue <= this.currentLevel && isDebugAllowed && isInfoAllowed;
    }

    _isDebugMode() {
        return typeof process !== 'undefined' && process.env &&
            (process.env.NODE_ENV === 'development' || process.env.DEBUG);
    }

    _isInfoMode() {
        return !this.isTestEnv || (typeof process !== 'undefined' && process.env && process.env.SHOW_INFO_IN_TESTS);
    }

    debug(msg, data) {
        if (this.shouldLog('debug')) {
            const message = typeof msg === 'function' ? msg() : msg;
            const logData = typeof data === 'function' ? data() : data;
            this.log('debug', message, logData);
        }
    }

    info(msg, data) {
        if (this.shouldLog('info')) {
            const message = typeof msg === 'function' ? msg() : msg;
            const logData = typeof data === 'function' ? data() : data;
            this.log('info', message, logData);
        }
    }

    warn(msg, data) {
        if (this.shouldLog('warn')) {
            const message = typeof msg === 'function' ? msg() : msg;
            const logData = typeof data === 'function' ? data() : data;
            this.log('warn', message, logData);
        }
    }

    error(msg, data) {
        if (this.shouldLog('error')) {
            const message = typeof msg === 'function' ? msg() : msg;
            let logData = typeof data === 'function' ? data() : data;
            logData = this.isTestEnv ? { message: logData?.message || message } : logData;
            this.log('error', message, logData);
        }
    }

    setSilent(silent) {
        this.silent = silent;
    }

    setLevel(level) {
        const levelValue = this.levels[level.toUpperCase()];
        if (levelValue !== undefined) {
            this.currentLevel = levelValue;
        }
    }

    getIsTestEnv() {
        return this.isTestEnv;
    }

    getLevel() {
        return Object.keys(this.levels).find(key => this.levels[key] === this.currentLevel);
    }

    // Added utility methods for better control
    enable() {
        this.silent = false;
    }

    disable() {
        this.silent = true;
    }
}

const logger = new Logger();
export { logger as Logger };