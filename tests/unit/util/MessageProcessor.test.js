import {
    createMessageProcessor,
    MessageProcessor,
    messageProcessorUtils
} from '../../../ui-react-legacy/src/utils/messageProcessor.js';
import {validateMessage} from '../../../ui-react-legacy/src/schemas/messages.js';

describe('Message Processor', () => {
    describe('MessageProcessor class', () => {
        test('initializes with empty middleware array', () => {
            const processor = new MessageProcessor();
            expect(Array.isArray(processor.middleware)).toBe(true);
            expect(processor.middleware).toHaveLength(0);
            expect(Array.isArray(processor.errorHandlers)).toBe(true);
            expect(processor.errorHandlers).toHaveLength(0);
        });

        test('use method adds middleware to pipeline', () => {
            const processor = new MessageProcessor();
            let middlewareCalled = false;
            const testMessage = {type: 'test', payload: {data: 'value'}};
            const middleware = (msg) => {
                middlewareCalled = true;
                return msg;
            };

            processor.use(middleware);

            expect(processor.middleware).toHaveLength(1);
            expect(processor.middleware[0]).toBe(middleware);

            // Verify it can be executed
            const result = processor.middleware[0](testMessage, {});
            expect(middlewareCalled).toBe(true);
            expect(result).toEqual(testMessage);
        });

        test('onError method adds error handler', () => {
            const processor = new MessageProcessor();
            let errorHandlerCalled = false;
            const testError = new Error('Test error');
            const errorHandler = (error) => {
                errorHandlerCalled = true;
                expect(error).toBe(testError);
            };

            processor.onError(errorHandler);

            expect(processor.errorHandlers).toHaveLength(1);
            expect(processor.errorHandlers[0]).toBe(errorHandler);

            // Execute error handler
            processor.errorHandlers[0](testError);
            expect(errorHandlerCalled).toBe(true);
        });

        test('process validates message and applies middleware', async () => {
            const processor = new MessageProcessor();
            const testMessage = {type: 'test', payload: {data: 'value'}};

            // Add a simple transformation middleware
            processor.use((message) => {
                return {...message, processed: true};
            });

            const result = await processor.process(testMessage);

            expect(result.success).toBe(true);
            expect(result.data).toHaveProperty('processed');
            expect(result.data.processed).toBe(true);
        });

        test('process handles validation errors', async () => {
            const processor = new MessageProcessor();
            const invalidMessage = {invalid: 'message'}; // Missing required type field

            const result = await processor.process(invalidMessage);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('process handles middleware errors', async () => {
            const processor = new MessageProcessor();
            const testMessage = {type: 'test', payload: {data: 'value'}};

            // Add a middleware that throws error
            processor.use(() => {
                throw new Error('Middleware error');
            });

            const result = await processor.process(testMessage);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Middleware error');
        });
    });

    describe('createMessageProcessor', () => {
        test('creates new MessageProcessor instance', () => {
            const processor = createMessageProcessor();
            expect(processor).toBeInstanceOf(MessageProcessor);
            expect(Array.isArray(processor.middleware)).toBe(true);
        });
    });

    describe('messageProcessorUtils', () => {
        describe('createValidationMiddleware', () => {
            test('validates message using provided validator', () => {
                const middleware = messageProcessorUtils.createValidationMiddleware(validateMessage);
                const validMessage = {type: 'test', payload: {data: 'value'}};

                const result = middleware(validMessage, {});
                expect(result).toEqual(validMessage);
            });
        });

        describe('createLoggingMiddleware', () => {
            test('logs message with provided logger', () => {
                const loggedMessages = [];
                let loggedArgs = null;
                const mockLogger = (...args) => {
                    loggedArgs = args;
                    loggedMessages.push(args);
                };
                const middleware = messageProcessorUtils.createLoggingMiddleware(mockLogger);
                const message = {type: 'test', payload: {data: 'value'}};

                const result = middleware(message, {});

                expect(result).toEqual(message);
                expect(loggedMessages).toHaveLength(1);
                expect(loggedArgs[0]).toBe('Processing message: test');
                expect(loggedArgs[1]).toHaveProperty('timestamp');
            });
        });

        describe('createTransformMiddleware', () => {
            test('applies transformation to message', () => {
                const transformer = (message) => ({...message, transformed: true});
                const middleware = messageProcessorUtils.createTransformMiddleware(transformer);
                const message = {type: 'test', payload: {data: 'value'}};

                const result = middleware(message, {});

                expect(result).toEqual({...message, transformed: true});
            });
        });

        describe('createRateLimitMiddleware', () => {
            test('allows messages within rate limit', () => {
                const middleware = messageProcessorUtils.createRateLimitMiddleware(5, 1000); // 5 per second
                const message = {type: 'test', payload: {data: 'value'}};

                // Should allow multiple calls within limit
                for (let i = 0; i < 4; i++) {
                    const result = middleware(message, {});
                    expect(result).toEqual(message);
                }
            });

            test('throws error when rate limit exceeded', () => {
                const middleware = messageProcessorUtils.createRateLimitMiddleware(2, 5000); // 2 per 5 seconds
                const message = {type: 'test', payload: {data: 'value'}};

                // First 2 calls should succeed
                middleware(message, {});
                middleware(message, {});

                // Third call should fail
                expect(() => middleware(message, {})).toThrow('Rate limit exceeded');
            });
        });

        describe('createDuplicateDetectionMiddleware', () => {
            test('allows unique messages', () => {
                const middleware = messageProcessorUtils.createDuplicateDetectionMiddleware(5000); // 5 second window
                const message1 = {type: 'test1', payload: {data: 'value1'}};
                const message2 = {type: 'test2', payload: {data: 'value2'}};

                const result1 = middleware(message1, {});
                const result2 = middleware(message2, {});

                expect(result1).toEqual(message1);
                expect(result2).toEqual(message2);
            });

            test('blocks duplicate messages within time window', () => {
                const middleware = messageProcessorUtils.createDuplicateDetectionMiddleware(5000); // 5 second window
                const message = {type: 'test', payload: {data: 'value'}};

                // First call should succeed
                const result1 = middleware(message, {});
                expect(result1).toEqual(message);

                // Second call should be blocked (duplicate)
                const result2 = middleware(message, {});
                expect(result2).toBeNull(); // Should return null for duplicates
            });
        });
    });
});