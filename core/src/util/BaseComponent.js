import {Logger} from '../util/Logger.js';
import {EventBus} from '../util/EventBus.js';
import {createEventPayload} from './IntrospectionEvents.js';

export class BaseComponent {
    constructor(config = {}, name = 'BaseComponent', eventBus = null, validationSchema = null) {
        this._config = config;
        this._name = name;
        this._logger = Logger;  // Logger is a singleton instance
        this._eventBus = eventBus || new EventBus();
        this._metrics = new Map();
        this._validationSchema = validationSchema;
        this._initialized = false;
        this._started = false;
        this._disposed = false;
        this._startTime = null;

        // Validate configuration if schema provided
        this._validationSchema && this._validateConfig(config);

        // Initialize common metrics
        this._initializeMetrics();
    }

    // Getters
    get name() {
        return this._name;
    }

    get config() {
        return this._config;
    }

    get logger() {
        return this._logger;
    }

    get eventBus() {
        return this._eventBus;
    }

    get metrics() {
        return this._metrics;
    }

    get isInitialized() {
        return this._initialized;
    }

    get isStarted() {
        return this._started;
    }

    get isDisposed() {
        return this._disposed;
    }

    get isRunning() {
        return this._started && !this._disposed;
    }

    get uptime() {
        return this._startTime ? Date.now() - this._startTime : 0;
    }

    // Configuration validation
    _validateConfig(config) {
        const schema = typeof this._validationSchema === 'function'
            ? this._validationSchema()
            : this._validationSchema;

        const validationResult = schema.validate(config, {
            stripUnknown: true,
            allowUnknown: false,
            convert: true
        });

        if (validationResult.error) {
            throw new Error(`Configuration validation failed for ${this._name}: ${validationResult.error.message}`);
        }

        return validationResult.value;
    }

    validateConfig(config = this._config) {
        return this._validationSchema ? this._validateConfig(config) : config;
    }

    // Lifecycle operation executor
    async _executeLifecycleOperation(operation, checkCondition, action, metricName = null) {
        if (checkCondition) {
            const error = this._checkLifecycleCondition(operation);
            if (error) {
                this.logWarn(error);
                return operation !== 'start';
            }
        }

        try {
            if (operation === 'start') this._startTime = Date.now();

            await action();

            // Update state after successful operation
            this._updateComponentState(operation);

            // Emit the appropriate event
            this._emitLifecycleEvent(operation);

            // Log and update metrics
            this._logger.info(`${this._name} ${this._getOperationSuffix(operation)}`);
            metricName && this.incrementMetric(metricName);
            return true;
        } catch (error) {
            this._logger.error(`Failed to ${operation} component`, error);
            return false;
        }
    }

    /**
     * Check lifecycle operation conditions
     * @private
     */
    _checkLifecycleCondition(operation) {
        const validations = {
            start: () => !this._initialized && `Cannot start uninitialized component ${this._name}`,
            stop: () => !this._started && `Component ${this._name} not started`,
            initialize: () => this._initialized && `Component ${this._name} already initialized`,
            dispose: () => this._disposed && `Component ${this._name} already disposed`
        };

        return validations[operation]?.() || null;
    }

    /**
     * Update component state based on operation
     * @private
     */
    _updateComponentState(operation) {
        const stateUpdates = {
            initialize: () => this._initialized = true,
            start: () => this._started = true,
            stop: () => this._started = false,
            dispose: () => this._disposed = true
        };
        stateUpdates[operation]?.();
    }

    /**
     * Get operation suffix for logging
     * @private
     */
    _getOperationSuffix(operation) {
        const suffixes = {
            initialize: 'd',
            start: 'ed',
            stop: 'ped'
        };
        return `${operation}${suffixes[operation] || 'd'}`;
    }

    // Lifecycle event emitter
    _emitLifecycleEvent(operation) {
        const eventPayload = {
            timestamp: Date.now(),
            component: this._name,
            ...(operation !== 'initialize' && operation !== 'dispose' && {uptime: this.uptime})
        };
        this._eventBus.emit(`${this._name}.${operation}d`, eventPayload);
    }

    // Lifecycle methods
    async initialize() {
        return await this._executeLifecycleOperation(
            'initialize', true, () => this._initialize(), 'initializeCount'
        );
    }

    async start() {
        return await this._executeLifecycleOperation(
            'start', true, () => this._start(), 'startCount'
        );
    }

    async stop() {
        return await this._executeLifecycleOperation(
            'stop', true, () => this._stop(), 'stopCount'
        );
    }

    async dispose() {
        if (this._disposed) {
            this.logWarn('Component already disposed');
            return true;
        }

        try {
            // Stop if running
            this._started && await this.stop();

            await this._executeLifecycleOperation(
                'dispose',
                false, // no condition check needed for dispose
                () => this._dispose()
            );
            return true;
        } catch (error) {
            this._logger.error('Failed to dispose component', error);
            return false;
        }
    }

    // Default lifecycle implementations (can be overridden)
    async _initialize() {
    }

    async _start() {
    }

    async _stop() {
    }

    async _dispose() {
    }

    // Metrics initialization
    _initializeMetrics() {
        this._metrics.set('initializeCount', 0);
        this._metrics.set('startCount', 0);
        this._metrics.set('stopCount', 0);
        this._metrics.set('errorCount', 0);
        this._metrics.set('uptime', 0);
        this._metrics.set('lastActivity', Date.now());
    }

    // Metric operations
    updateMetric(key, value) {
        this._metrics.set(key, value);
        this._metrics.set('lastActivity', Date.now());
    }

    incrementMetric(key, increment = 1) {
        const currentValue = this._metrics.get(key) || 0;
        this._metrics.set(key, currentValue + increment);
        this._metrics.set('lastActivity', Date.now());
    }

    getMetric(key) {
        return this._metrics.get(key);
    }

    getMetrics() {
        return {
            ...Object.fromEntries(this._metrics),
            uptime: this.uptime,
            isRunning: this.isRunning
        };
    }

    // Logging methods
    logInfo(message, metadata) {
        this._logger.info(message, metadata);
        this._metrics.set('lastActivity', Date.now());
    }

    logWarn(message, metadata) {
        this._logger.warn(message, metadata);
        this._metrics.set('lastActivity', Date.now());
    }

    logError(message, metadata) {
        this._logger.error(message, metadata);
        this.incrementMetric('errorCount');
    }

    logDebug(message, metadata) {
        this._logger.debug(message, metadata);
        this._metrics.set('lastActivity', Date.now());
    }

    // Event emission
    emitEvent(event, dataOrFn, options = {}) {
        if (this._eventBus.hasSubscribers && !this._eventBus.hasSubscribers(event)) {
            return;
        }

        const currentTime = Date.now();
        const data = typeof dataOrFn === 'function' ? dataOrFn() : dataOrFn;
        this._eventBus.emit(event, {
            timestamp: currentTime,
            component: this._name,
            uptime: this._startTime ? currentTime - this._startTime : 0,
            ...data
        }, options);
    }

    _emitIntrospectionEvent(eventName, payloadOrFn) {
        if (!this._config.introspection?.enabled) return;
        const payload = typeof payloadOrFn === 'function' ? payloadOrFn() : payloadOrFn;
        this._eventBus.emit(eventName, createEventPayload(this._name, payload));
    }

    // Event handling
    onEvent(event, handler) {
        this._eventBus.on(event, handler);
    }

    offEvent(event, handler) {
        this._eventBus.off(event, handler);
    }
}