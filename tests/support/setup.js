import {NAR} from '@senars/nar';

/**
 * Base test setup for NAR integration tests
 * Provides consistent initialization and cleanup for NAR instances
 */
export class NARTestSetup {
    constructor(config = {}) {
        this.config = {
            debug: {enabled: false},
            cycle: {delay: 10, maxTasksPerCycle: 5},
            ...config
        };
        this.nar = null;
    }

    async setup() {
        this.nar = new NAR(this.config);
        return this.nar;
    }

    async teardown() {
        if (this.nar && typeof this.nar.dispose === 'function') {
            await this.nar.dispose();
        } else if (this.nar && this.nar.isRunning) {
            this.nar.stop();
        }
        this.nar = null;
    }

    async reset() {
        if (this.nar) {
            this.nar.reset();
        }
    }
}

/**
 * Base test setup for component unit tests
 * Provides common initialization and utility methods
 */
export class ComponentTestSetup {
    constructor(ComponentClass, defaultConfig = {}) {
        this.ComponentClass = ComponentClass;
        this.defaultConfig = defaultConfig;
        this.instance = null;
    }

    setup(config = {}) {
        const finalConfig = {...this.defaultConfig, ...config};
        this.instance = new this.ComponentClass(finalConfig);
        return this.instance;
    }

    async teardown() {
        if (this.instance && typeof this.instance.dispose === 'function') {
            await this.instance.dispose();
        }
        this.instance = null;
    }
}
