import {AnalyzerFactory} from './AnalyzerFactory.js';
import {SoftwareAnalyzerConfig} from './SoftwareAnalyzerConfig.js';
import {ResultDisplay} from './ResultDisplay.js';
import {AnalysisError, ConfigurationError} from '../../../errors/index.js';
import {Logger} from '../../../util/Logger.js';

// For integration with NAR system
let NAR = null;

// Try to import NAR if available (for integration scenarios)
try {
    // This import is optional and only used when integrated with the full system
} catch (e) {
    // NAR not available, which fine for standalone operation
}

export class SoftwareAnalyzer {
    constructor(options = {}) {
        try {
            this.config = new SoftwareAnalyzerConfig(options);

            // If any specific analysis is requested, turn off 'all' mode
            if (AnalyzerFactory.getAllAnalyzerTypes().some(category => this.config.get(category))) {
                this.config.set('all', false);
            }

            // Create analyzers using Object.fromEntries for better modern syntax
            this.analyzers = Object.fromEntries(
                AnalyzerFactory.getAllAnalyzerTypes().map(type => [
                    type,
                    AnalyzerFactory.createAnalyzer(type, this.config.getAll(), this.config.get('verbose'))
                ])
            );

            this.display = new ResultDisplay(this.config.getAll());

            // NAR integration properties
            this.nar = null;
            this.integrationEnabled = false;

            // Result caching
            this.resultCache = new Map();
            this.cacheTimestamps = new Map();
        } catch (error) {
            throw new ConfigurationError('Failed to initialize SeNARSSelfAnalyzer', error);
        }
    }

    /**
     * Connect to a NAR instance for reasoning integration
     * @param {Object} narInstance - The NAR instance to connect to
     */
    connectToNAR(narInstance) {
        this.nar = narInstance;
        this.integrationEnabled = !!narInstance;
    }

    /**
     * Enable or disable NAR integration
     * @param {boolean} enabled - Whether to enable integration
     */
    setIntegrationEnabled(enabled) {
        this.integrationEnabled = enabled;
    }

    /**
     * Get cache key for the current configuration
     */
    _getCacheKey() {
        const activeAnalyses = Object.keys(this.analyzers)
            .filter(category => this.config.get('all') || this.config.get(category))
            .sort()
            .join(',');

        return `analysis_${activeAnalyses}_v1`;
    }

    /**
     * Check if results are cached and valid
     */
    _getCachedResults() {
        if (!this.config.get('cacheEnabled')) {
            return null;
        }

        const cacheKey = this._getCacheKey();
        const cachedResults = this.resultCache.get(cacheKey);
        const cachedTime = this.cacheTimestamps.get(cacheKey);

        if (cachedResults && cachedTime) {
            const age = Date.now() - cachedTime;
            if (age < this.config.get('cacheTTL')) {
                if (this.config.get('verbose')) {
                    Logger.info(`📊 Using cached results (age: ${(age / 1000).toFixed(1)}s)`);
                }
                return cachedResults;
            } else {
                // Remove expired cache
                this.resultCache.delete(cacheKey);
                this.cacheTimestamps.delete(cacheKey);
            }
        }

        return null;
    }

    /**
     * Cache the results
     */
    _cacheResults(results) {
        if (!this.config.get('cacheEnabled')) {
            return;
        }

        const cacheKey = this._getCacheKey();
        this.resultCache.set(cacheKey, results);
        this.cacheTimestamps.set(cacheKey, Date.now());

        // Limit cache size
        if (this.resultCache.size > 10) { // Keep only recent 10 caches
            const keys = Array.from(this.resultCache.keys());
            for (let i = 0; i < keys.length - 10; i++) {
                this.resultCache.delete(keys[i]);
                this.cacheTimestamps.delete(keys[i]);
            }
        }
    }

    async runAnalysis() {
        try {
            // Check cache first
            const cachedResults = this._getCachedResults();
            if (cachedResults) {
                const results = cachedResults;

                // Display results based on requested analyses
                this.display.display(results);

                // Show additional tables if requested or in default mode
                if (this.config.get('slowest') || (this.config.get('all') && !this.config.get('summaryOnly'))) {
                    this.display.printSlowestTests(results);
                }

                if (this.config.get('all') && !this.config.get('summaryOnly') && results.static) {
                    this.display.printLargestFiles(results);
                    this.display.printLargestDirectories(results);
                    this.display.printMostFilesDirectories(results);
                    this.display.printComplexityByDirectory(results);
                }

                if (this.config.get('all') && !this.config.get('summaryOnly') && results.coverage) {
                    this.display.printLowestCoverageFiles(results);
                    this.display.printCoverageByDirectory(results);
                }

                // If NAR integration is enabled, send results to NAR for reasoning
                if (this.integrationEnabled && this.nar) {
                    await this._integrateWithNAR(results);
                }

                return results;
            }

            // Run analysis if not cached
            if (!this.config.get('summaryOnly') && !this.config.get('verbose')) {
                Logger.info('🔍 SeNARS Self-Analysis');
            }

            const results = {};

            // Run only the analyses requested via flags
            // Use concurrency setting to determine if analyses run in parallel or sequence
            await this._runAnalyses(results);

            // Display results based on requested analyses
            this.display.display(results);
            await this._displayAdditionalResults(results);

            // If NAR integration is enabled, send results to NAR for reasoning
            if (this.integrationEnabled && this.nar) {
                await this._integrateWithNAR(results);
            }

            // Cache the results
            this._cacheResults(results);

            return results;
        } catch (error) {
            throw new AnalysisError('Failed to run analysis', 'general', error);
        }
    }

    /**
     * Clear the result cache
     */
    clearCache() {
        this.resultCache.clear();
        this.cacheTimestamps.clear();
    }

    /**
     * Get configuration instance
     */
    getConfig() {
        return this.config;
    }

    /**
     * Integrate analysis results with the NAR system
     * @private
     */
    async _integrateWithNAR(results) {
        if (!this.nar) return;

        try {
            // Convert key metrics to Narsese statements
            const narseseStatements = this._convertToNarsese(results);

            // Input each statement to the NAR
            for (const statement of narseseStatements) {
                await this.nar.input(statement);
            }

            Logger.info(`📊 Integrated ${narseseStatements.length} analysis facts with NAR`);

            // Additionally, convert actionable insights to goals
            const goalStatements = this._convertInsightsToGoals(results);
            for (const goal of goalStatements) {
                await this.nar.input(goal);
            }

            if (goalStatements.length > 0) {
                Logger.info(`🎯 Added ${goalStatements.length} improvement goals to NAR`);
            }
        } catch (error) {
            const analysisError = new AnalysisError('Failed to integrate with NAR', 'integration', error);
            Logger.error('Error integrating with NAR:', {message: analysisError.message});
            if (this.config.get('verbose')) {
                Logger.error('Stack trace:', {stack: analysisError.stack});
            }
            // Don't throw here as integration failure shouldn't break the main analysis
        }
    }

    /**
     * Convert analysis results to Narsese statements
     * @private
     */
    _convertToNarsese(results) {
        const statements = [];
        const {tests, coverage, static: staticResults, technicaldebt, architecture} = results;

        // Convert test results
        if (tests && !tests.error) {
            const passRate = tests.passedTests / Math.max(tests.totalTests, 1);
            const qualityLevel = passRate > 0.95 ? 'high' : passRate > 0.8 ? 'medium' : 'low';
            statements.push(`<test_quality --> ${qualityLevel}>. %${passRate.toFixed(2)};0.90%`);

            // System stability
            const stability = tests.failedTests === 0 ? 'stable' : 'unstable';
            const stabilityRate = tests.totalTests ? 1 - (tests.failedTests / tests.totalTests) : 0;
            statements.push(`<system_stability --> ${stability}>. %${stabilityRate.toFixed(2)};0.90%`);
        }

        // Convert coverage results
        if (coverage && !coverage.error && coverage.available !== false) {
            const coverageLevel = coverage.lines > 80 ? 'high' :
                coverage.lines > 50 ? 'medium' : 'low';
            statements.push(`<test_coverage --> ${coverageLevel}>. %${(coverage.lines / 100).toFixed(2)};0.90%`);
        }

        // Convert static analysis results
        if (staticResults && !staticResults.error) {
            // Code complexity
            if (staticResults.avgComplexity !== undefined) {
                const complexityLevel = staticResults.avgComplexity > 30 ? 'high' :
                    staticResults.avgComplexity > 15 ? 'medium' : 'low';
                statements.push(`<code_complexity --> ${complexityLevel}>. %${Math.min(1.0, staticResults.avgComplexity / 50).toFixed(2)};0.90%`);
            }

            // Code size
            if (staticResults.totalLines !== undefined) {
                const sizeLevel = staticResults.totalLines > 50000 ? 'large' :
                    staticResults.totalLines > 20000 ? 'medium' : 'small';
                statements.push(`<code_size --> ${sizeLevel}>. %${Math.min(1.0, staticResults.totalLines / 50000).toFixed(2)};0.90%`);
            }
        }

        // Convert technical debt results
        if (technicaldebt && !technicaldebt.error) {
            const debtLevel = technicaldebt.totalDebtScore > 2000 ? 'high' :
                technicaldebt.totalDebtScore > 1000 ? 'medium' : 'low';
            statements.push(`<technical_debt --> ${debtLevel}>. %${Math.min(1.0, technicaldebt.totalDebtScore / 3000).toFixed(2)};0.90%`);
        }

        // Convert architecture results
        if (architecture && !architecture.error) {
            const dependencyQuality = architecture.cyclicDependencies === 0 ? 'good' : 'poor';
            statements.push(`<architecture_quality --> ${dependencyQuality}>. %${(1 - architecture.cyclicDependencies / 10).toFixed(2)};0.90%`);
        }

        return statements;
    }

    /**
     * Convert actionable insights from results to goals
     * @private
     */
    _convertInsightsToGoals(results) {
        const {tests, coverage, static: staticResults, technicaldebt, architecture} = results;

        // Use array of condition-action pairs to make the code more functional
        const goals = [];

        // Add improvement goals based on analysis results
        if (tests?.failedTests > 0) {
            goals.push(`(improve_test_stability)! %0.9;0.9%`);
        }

        if (coverage?.lines < 80) {
            goals.push(`(increase_test_coverage)! %0.8;0.9%`);
        }

        if (staticResults?.avgComplexity > 20) {
            goals.push(`(reduce_code_complexity)! %0.7;0.9%`);
        }

        if (technicaldebt?.totalDebtScore > 1000) {
            goals.push(`(reduce_technical_debt)! %0.9;0.9%`);
        }

        if (architecture?.cyclicDependencies?.length > 0) {
            goals.push(`(resolve_cyclic_dependencies)! %0.8;0.9%`);
        }

        return goals;
    }

    /**
     * Get structured analysis results for external consumption
     */
    async getStructuredResults() {
        const results = await this.runAnalysis();

        return {
            metadata: {
                timestamp: Date.now(),
                type: 'self-analysis',
                version: '1.0'
            },
            results: results,
            summary: this._createSummary(results)
        };
    }

    /**
     * Create a summary of the analysis results
     * @private
     */
    _createSummary(results) {
        // Use object destructuring and nullish coalescing for cleaner code
        const {tests, coverage, static: staticResults, technicaldebt} = results;

        return {
            ...(tests && !tests.error && {
                tests: {
                    passed: tests.passedTests,
                    total: tests.totalTests,
                    passRate: tests.totalTests ? Math.round((tests.passedTests / tests.totalTests) * 100) : 0,
                    status: tests.status
                }
            }),
            ...(coverage && !coverage.error && coverage.available !== false && {
                coverage: {
                    lines: coverage.lines,
                    functions: coverage.functions,
                    branches: coverage.branches
                }
            }),
            ...(staticResults && !staticResults.error && {
                code: {
                    files: staticResults.jsFiles,
                    lines: staticResults.totalLines,
                    avgLinesPerFile: staticResults.avgLinesPerFile,
                    avgComplexity: staticResults.avgComplexity
                }
            }),
            ...(technicaldebt && !technicaldebt.error && {
                debt: {
                    totalScore: technicaldebt.totalDebtScore,
                    avgPerFile: technicaldebt.avgDebtScore,
                    highRisk: technicaldebt.highRiskFiles?.length ?? 0
                }
            })
        };
    }

    /**
     * Run analyses based on configuration (parallel or sequential)
     * @private
     */
    async _runAnalyses(results) {
        const categoriesToRun = Object.entries(this.analyzers)
            .filter(([category, analyzer]) => this.config.get('all') || this.config.get(category))
            .map(([category, analyzer]) => ({category, analyzer}));

        if (this.config.get('analyzeConcurrency') > 1) {
            // Run analyses in parallel (up to the concurrency limit)
            // Split into batches based on concurrency
            for (let i = 0; i < categoriesToRun.length; i += this.config.get('analyzeConcurrency')) {
                const batch = categoriesToRun.slice(i, i + this.config.get('analyzeConcurrency'));
                const batchPromises = batch.map(async ({category, analyzer}) => {
                    try {
                        const result = await analyzer.analyze();
                        results[category] = result;
                    } catch (error) {
                        results[category] = {error: `Analysis failed: ${error.message}`, details: error};
                    }
                });

                await Promise.allSettled(batchPromises); // Use Promise.allSettled to avoid failing all if one fails
            }
        } else {
            // Run analyses sequentially
            for (const [category, analyzer] of Object.entries(this.analyzers)) {
                if (this.config.get('all') || this.config.get(category)) {
                    try {
                        results[category] = await analyzer.analyze();
                    } catch (error) {
                        results[category] = {error: `Analysis failed: ${error.message}`, details: error};
                    }
                }
            }
        }
    }

    /**
     * Display additional results based on configuration
     * @private
     */
    async _displayAdditionalResults(results) {
        // Show additional tables if requested or in default mode
        if (this.config.get('slowest') || (this.config.get('all') && !this.config.get('summaryOnly'))) {
            this.display.printSlowestTests(results);
        }

        if (this.config.get('all') && !this.config.get('summaryOnly') && results.static) {
            this.display.printLargestFiles(results);
            this.display.printLargestDirectories(results);
            this.display.printMostFilesDirectories(results);
            this.display.printComplexityByDirectory(results);
        }

        if (this.config.get('all') && !this.config.get('summaryOnly') && results.coverage) {
            this.display.printLowestCoverageFiles(results);
            this.display.printCoverageByDirectory(results);
        }
    }
}