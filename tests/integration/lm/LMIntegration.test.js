import {NAR} from '@senars/nar';
import {DummyProvider} from '@senars/core';
import {AdvancedNarseseTranslator, HuggingFaceProvider, LangChainProvider} from '@senars/core/src/lm/index';

describe('LM Integration Tests', () => {
    let nar;

    afterEach(async () => {
        await nar?.dispose();
        nar = null;
    });

    describe.each([
        ['DummyProvider', DummyProvider, {id: 'test-dummy', latency: 0}, 'dummy', null],
        ['LangChainProvider', LangChainProvider, {
            provider: 'ollama',
            modelName: 'llama2',
            baseURL: 'http://localhost:11434'
        }, null, {providerType: 'ollama', modelName: 'llama2'}],
        ['HuggingFaceProvider', HuggingFaceProvider, {
            modelName: 'sshleifer/distilbart-cnn-12-6',
            temperature: 0.7,
            maxTokens: 100
        }, null, {modelName: 'sshleifer/distilbart-cnn-12-6', temperature: 0.7}]
    ])('%s registration and configuration', (name, ProviderClass, config, registryKey, expectedProps) => {
        test('should initialize with correct config', () => {
            const provider = new ProviderClass(config);

            if (expectedProps) {
                Object.entries(expectedProps).forEach(([key, value]) => {
                    expect(provider[key]).toBe(value);
                });
            }

            expect(provider).toBeDefined();
        });

        if (registryKey) {
            test('should register with NAR', () => {
                nar = new NAR({lm: {enabled: true}});
                const provider = new ProviderClass(config);

                expect(() => {
                    nar.registerLMProvider(registryKey, provider);
                }).not.toThrow();

                expect(nar.lm.providers.get(registryKey)).toBeDefined();
            });
        }
    });

    test('should use AdvancedNarseseTranslator for quality improvements', () => {
        const translator = new AdvancedNarseseTranslator();

        const toNarseseResult = translator.toNarsese('cat is an animal');
        expect(typeof toNarseseResult).toBe('object');
        expect(typeof toNarseseResult.confidence).toBe('number');

        const fromNarseseResult = translator.fromNarsese('<cat --> animal>.');
        expect(typeof fromNarseseResult).toBe('object');
        expect(typeof fromNarseseResult.confidence).toBe('number');
    });

    test('should add context to translator for improved quality', () => {
        const translator = new AdvancedNarseseTranslator();
        expect(() => {
            translator.addContext('This is about animals and their properties');
        }).not.toThrow();
    });

    test('should track translation quality metrics', () => {
        const translator = new AdvancedNarseseTranslator();

        translator.toNarsese('test 1');
        translator.fromNarsese('<test --> example>.');

        const metrics = translator.getQualityMetrics();
        expect(typeof metrics.totalTranslations).toBe('number');
        expect(typeof metrics.averageConfidence).toBe('number');
        expect(Array.isArray(metrics.lastTranslations)).toBe(true);
    });

    test('should validate semantic preservation', () => {
        const translator = new AdvancedNarseseTranslator();

        const validation = translator.validateSemanticPreservation(
            'cats are animals',
            '<cats --> animals>.',
            'cats are animals'
        );

        expect(typeof validation.similar).toBe('boolean');
        expect(typeof validation.similarity).toBe('number');
        expect(typeof validation.preserved).toBe('boolean');
    });

    test('should work with NAR system for symbolic-mode only with DummyLM', () => {
        nar = new NAR({lm: {enabled: true}});
        const dummyProvider = new DummyProvider();
        nar.registerLMProvider('dummy', dummyProvider);

        expect(nar.lm).toBeDefined();
        expect(nar.lm.providers.get('dummy')).toBeDefined();
    });

    test('should handle quality scoring for translations', async () => {
        const translator = new AdvancedNarseseTranslator();

        expect(typeof translator.iterativeTranslate).toBe('function');

        const result = await translator.iterativeTranslate('a valid statement');
        expect(result).toBeDefined();
    });

    test('should apply error correction to translations', () => {
        const translator = new AdvancedNarseseTranslator();

        const result = {
            narsese: '(test --> example)',
            confidence: 0.9
        };

        expect(() => {
            const corrected = translator.applyErrorCorrection(result);
            expect(corrected).toBeDefined();
        }).not.toThrow();
    });
});
