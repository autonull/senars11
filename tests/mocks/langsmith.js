export class Client {
    constructor(config) {
        this.config = config;
    }

    async createRun(params) {
        return {id: 'mock-run-id'};
    }

    async updateRun(id, params) {
    }
}

export const traceable = (fn) => fn;
export const getCurrentRunTree = () => null;
