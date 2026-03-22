import {validateWithSchema} from './ObjectUtils.js';

export class ConfigurableComponent {
    constructor(defaultConfig = {}, validationSchema = null) {
        this._defaultConfig = defaultConfig;
        this._config = {...defaultConfig};
        this._validationSchema = validationSchema;
    }

    get config() {
        return {...this._config};
    }

    get defaultConfig() {
        return {...this._defaultConfig};
    }

    configure(cfg) {
        this._config = {...this._config, ...this._validate(cfg)};
        return this;
    }

    getConfigValue(key, defaultVal) {
        return this._config[key] ?? defaultVal;
    }

    setConfigValue(key, val) {
        const newConfig = {...this._config, [key]: val};
        this._config = this._validate(newConfig);
        return this;
    }

    validateConfig(config = this._config) {
        return this._validate(config);
    }

    resetConfig() {
        this._config = {...this._defaultConfig};
        return this;
    }

    _validate(config) {
        return validateWithSchema(config, this._validationSchema);
    }

    hasConfig(key) {
        return key in this._config;
    }
}