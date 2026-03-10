export const trace = {
    getTracer: () => ({
        startSpan: () => ({
            end: () => {},
            setAttribute: () => {},
            recordException: () => {},
            setStatus: () => {},
            isRecording: () => false,
        }),
        startActiveSpan: (name, fn) => fn({
            end: () => {},
            setAttribute: () => {},
            recordException: () => {},
            setStatus: () => {},
            isRecording: () => false,
        })
    })
};
export const context = {
    active: () => {},
    with: (ctx, fn) => fn(),
};
export const propagation = {
    inject: () => {},
    extract: () => {},
};
export const diag = {
    debug: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
};
export const SpanStatusCode = {
    UNSET: 0,
    OK: 1,
    ERROR: 2,
};
export const SpanKind = {
    INTERNAL: 0,
    SERVER: 1,
    CLIENT: 2,
    PRODUCER: 3,
    CONSUMER: 4,
};
