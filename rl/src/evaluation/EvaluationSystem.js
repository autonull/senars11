/**
 * Evaluation System - Unified Exports
 * Re-exports modular evaluation components
 */

// Statistical tests
export {StatisticalTests, DescriptiveStats, MathUtils} from './StatisticalTests.js';

// Metrics collection
export {MetricsCollector, PerformanceAnalyzer} from './MetricsCollector.js';

// Benchmark runner
export {BenchmarkRunner} from './BenchmarkRunner.js';

// Convenience re-exports
export const Evaluator = BenchmarkRunner;
export const Collector = MetricsCollector;
export const Statistics = StatisticalTests;
