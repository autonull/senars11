
export const process = {
    cwd: () => '/',
    env: { NODE_ENV: 'production', TERM: 'xterm' },
    platform: 'browser',
    argv: [],
    stdout: { write: () => { } },
    stderr: { write: () => { } },
    versions: {},
    on: () => { },
    exit: () => { },
    nextTick: (cb) => setTimeout(cb, 0),
};
globalThis.process = process;
export default process;
