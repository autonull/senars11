/**
 * EnhancedErrors Tests
 */
import {
    EnhancedError,
    LifecycleError,
    EnvironmentError,
    AgentError,
    ConfigError,
    TensorError,
    TrainingError,
    NeuroSymbolicError,
    Errors,
    validateConfig
} from '../../src/utils/EnhancedErrors.js';

describe('EnhancedError', () => {
    describe('base class', () => {
        it('should create error with suggestions', () => {
            const error = new EnhancedError('Test error', ['Suggestion 1', 'Suggestion 2']);

            expect(error.name).toBe('EnhancedError');
            expect(error.suggestions).toHaveLength(2);
            expect(error.formatMessage()).toContain('💡 Suggestions');
        });

        it('should create error with docs link', () => {
            const error = new EnhancedError('Test error', [], 'https://example.com');

            expect(error.docsLink).toBe('https://example.com');
            expect(error.formatMessage()).toContain('📖 Documentation');
        });

        it('should format message correctly', () => {
            const error = new EnhancedError('Base message', ['Fix it'], 'https://example.com');
            const formatted = error.toString();

            expect(formatted).toContain('EnhancedError: Base message');
            expect(formatted).toContain('Fix it');
            expect(formatted).toContain('https://example.com');
        });
    });

    describe('LifecycleError', () => {
        it('should create error for not initialized component', () => {
            const error = new LifecycleError('not_initialized', {
                component: 'TestAgent',
                method: 'act',
                state: 'not_initialized'
            });

            expect(error.message).toContain('not initialized');
            expect(error.suggestions).toContainEqual(expect.stringContaining('initialize()'));
        });

        it('should create error for already shutdown component', () => {
            const error = new LifecycleError('already_shutdown', {
                component: 'TestAgent',
                method: 'shutdown',
                state: 'already_shutdown'
            });

            expect(error.message).toContain('already shutdown');
        });
    });

    describe('EnvironmentError', () => {
        it('should create error for not reset environment', () => {
            const error = new EnvironmentError('not_reset', { env: 'CartPole' });

            expect(error.message).toContain('not reset');
            expect(error.suggestions).toContainEqual(expect.stringContaining('reset()'));
        });

        it('should create error for invalid action', () => {
            const error = new EnvironmentError('invalid_action', {
                env: 'CartPole',
                action: 5
            });

            expect(error.message).toContain('Invalid action');
            expect(error.suggestions).toContainEqual(expect.stringContaining('actionSpace'));
        });
    });

    describe('AgentError', () => {
        it('should create error for untrained agent', () => {
            const error = new AgentError('not_trained', { agent: 'DQNAgent' });

            expect(error.message).toContain('without training');
            expect(error.suggestions).toContainEqual(expect.stringContaining('train'));
        });

        it('should create error for observation mismatch', () => {
            const error = new AgentError('observation_shape_mismatch', {
                agent: 'PPOAgent',
                observation: { expected: '[4]' }
            });

            expect(error.message).toContain('shape mismatch');
        });
    });

    describe('ConfigError', () => {
        it('should create error for missing required config', () => {
            const error = new ConfigError('missing_required', {
                key: 'learningRate',
                expected: 0.001
            });

            expect(error.message).toContain('Missing required');
            expect(error.suggestions).toContainEqual(expect.stringContaining('learningRate'));
        });

        it('should create error for invalid type', () => {
            const error = new ConfigError('invalid_type', {
                key: 'episodes',
                value: '100',
                expected: 'number'
            });

            expect(error.message).toContain('Invalid type');
            expect(error.message).toContain('number');
        });

        it('should create error for invalid range', () => {
            const error = new ConfigError('invalid_range', {
                key: 'epsilon',
                value: 1.5,
                expected: '[0, 1]'
            });

            expect(error.message).toContain('out of range');
        });
    });

    describe('TensorError', () => {
        it('should create error for shape mismatch', () => {
            const error = new TensorError('shape_mismatch', {
                operation: 'matrix multiply',
                expected: '4,8',
                actual: '4,16'
            });

            expect(error.message).toContain('Shape mismatch');
            expect(error.suggestions).toContainEqual(expect.stringContaining('reshape'));
        });
    });

    describe('TrainingError', () => {
        it('should create error for NaN loss', () => {
            const error = new TrainingError('nan_loss', { episode: 42 });

            expect(error.message).toContain('NaN loss');
            expect(error.suggestions).toContainEqual(expect.stringContaining('learning rate'));
            expect(error.suggestions).toContainEqual(expect.stringContaining('gradient clipping'));
        });

        it('should create error for divergence', () => {
            const error = new TrainingError('divergence', {
                metric: 'reward',
                value: -500
            });

            expect(error.message).toContain('divergence');
        });
    });

    describe('NeuroSymbolicError', () => {
        it('should create error for grounding failure', () => {
            const error = new NeuroSymbolicError('grounding_failed', {});

            expect(error.message).toContain('ground symbolic term');
            expect(error.suggestions.length).toBeGreaterThan(0);
        });

        it('should create error for lift failure', () => {
            const error = new NeuroSymbolicError('lift_failed', {});

            expect(error.message).toContain('lift tensor');
        });
    });

    describe('Errors factory', () => {
        it('should create lifecycle error', () => {
            const error = Errors.lifecycle('not_initialized', { component: 'Test' });
            expect(error).toBeInstanceOf(LifecycleError);
        });

        it('should create environment error', () => {
            const error = Errors.environment('not_reset', { env: 'Test' });
            expect(error).toBeInstanceOf(EnvironmentError);
        });

        it('should create agent error', () => {
            const error = Errors.agent('not_trained', { agent: 'Test' });
            expect(error).toBeInstanceOf(AgentError);
        });

        it('should create config error', () => {
            const error = Errors.config('missing_required', { key: 'test' });
            expect(error).toBeInstanceOf(ConfigError);
        });

        it('should create tensor error', () => {
            const error = Errors.tensor('shape_mismatch', { operation: 'test' });
            expect(error).toBeInstanceOf(TensorError);
        });

        it('should create training error', () => {
            const error = Errors.training('nan_loss', { episode: 1 });
            expect(error).toBeInstanceOf(TrainingError);
        });

        it('should create neuro-symbolic error', () => {
            const error = Errors.neuroSymbolic('grounding_failed', {});
            expect(error).toBeInstanceOf(NeuroSymbolicError);
        });
    });

    describe('validateConfig', () => {
        it('should throw for missing required field', () => {
            const schema = {
                learningRate: { required: true, type: 'number', default: 0.001 }
            };

            expect(() => validateConfig({}, schema)).toThrow(ConfigError);
        });

        it('should throw for invalid type', () => {
            const schema = {
                episodes: { required: true, type: 'number' }
            };

            expect(() => validateConfig({ episodes: '100' }, schema)).toThrow(ConfigError);
        });

        it('should throw for out of range value', () => {
            const schema = {
                epsilon: { required: true, type: 'number', range: [0, 1] }
            };

            expect(() => validateConfig({ epsilon: 1.5 }, schema)).toThrow(ConfigError);
        });

        it('should pass valid config', () => {
            const schema = {
                learningRate: { required: true, type: 'number', range: [0, 1] }
            };

            expect(() => validateConfig({ learningRate: 0.01 }, schema)).not.toThrow();
        });
    });
});
