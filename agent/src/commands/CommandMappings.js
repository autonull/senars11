export const COMMAND_ALIASES = Object.freeze({
    next: 'n', n: 'n',
    stop: 'st', st: 'st',
    quit: 'exit', exit: 'exit', q: 'exit',
    run: 'go', go: 'go',
    start: 'run',
    step: 'next'
});

export const INTERNAL_COMMANDS = Object.freeze({
    n: '_next', next: '_next',
    go: '_run', run: '_run',
    st: '_stop', stop: '_stop',
    quit: 'shutdown', q: 'shutdown', exit: 'shutdown'
});

export const CONTROL_CMD_MAP = Object.freeze({
    start: 'run', stop: 'stop', step: 'next'
});

export const resolveCommand = (cmd) => COMMAND_ALIASES[cmd] ?? cmd;
export const resolveInternalMethod = (cmd) => INTERNAL_COMMANDS[cmd] ?? null;
export const resolveControlCommand = (cmd) => CONTROL_CMD_MAP[cmd] ?? cmd;
