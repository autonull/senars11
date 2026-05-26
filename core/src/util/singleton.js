export function createSingleton(factory) {
    let instance = null;
    const getInstance = (...args) => {
        if (!instance) {
            instance = factory(...args);
        }
        return instance;
    };
    getInstance.reset = () => {
        instance = null;
    };
    getInstance.getInstance = () => instance;
    return getInstance;
}
