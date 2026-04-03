/**
 * @file src/tools/analysis/ToolBasedSeNARSSelfAnalyzer.js
 * @description Tool-based implementation of SeNARS Self Analyzer
 */

// Local imports - alphabetically sorted
import {AnalyzerError, ConfigurationError} from '../../errors/index.js';
import {ArchitectureAnalysisTool} from './ArchitectureAnalysisTool.js';
import {CoverageAnalysisTool} from './CoverageAnalysisTool.js';
import {Logger} from '../../util/Logger.js';
import {MultiAnalysisTool} from './MultiAnalysisTool.js';
import {ResultDisplay} from './analyzers/ResultDisplay.js';
import {SoftwareAnalyzerConfig} from './analyzers/SoftwareAnalyzerConfig.js';
import {StaticAnalysisTool} from './StaticAnalysisTool.js';
import {TechnicalDebtAnalysisTool} from './TechnicalDebtAnalysisTool.js';
import {TestAnalysisTool} from './TestAnalysisTool.js';
import {TestCoverageAnalysisTool} from './TestCoverageAnalysisTool.js';
import {ToolIntegration} from '../ToolIntegration.js';
import {ToolRegistry} from '../ToolRegistry.js';

/**
 * Tool-based implementation of SeNARS Self Analyzer
 * Uses the system's tool infrastructure for all analysis operations
 */
export class ToolSoftwareAnalyzer {
    constructor(options = {}) {
        try {
            this.config = new SoftwareAnalyzerConfig(options);

            // Initialize tool integration with proper configuration
            this.toolIntegration = new ToolIntegration({
                enableRegistry: true,
                engine: {
                    enableHistory: true,
                    enableMetrics: true,
                    maxConcurrent: this.config.get('analyzeConcurrency') || 4
                }
            });

            this.toolEngine = this.toolIntegration.engine;
            this.toolRegistry = new ToolRegistry(this.toolEngine);

            // Register analysis tools
            this._registerAnalysisTools();

            this.display = new ResultDisplay(this.config.getAll());

            // NAR integration properties
            this.nar = null;
            this.integrationEnabled = false;

            // Result caching
            this.resultCache = new Map();
            this.cacheTimestamps = new Map();

            // Track tool usage for performance monitoring
            this.toolUsageStats = new Map();
        } catch (error) {
            throw new ConfigurationError('Failed to initialize ToolBasedSeNARSSelfAnalyzer', error);
        }
    }

    /**
     * Register all analysis tools with the tool engine through the registry
     * @private
     */
    _registerAnalysisTools() {
        // Register all analysis tools using the registry for better integration
        const toolsToRegister = [
            ['test-analysis', new TestAnalysisTool()],
            ['coverage-analysis', new CoverageAnalysisTool()],
            ['static-analysis', new StaticAnalysisTool()],
            ['technical-debt-analysis', new TechnicalDebtAnalysisTool()],
            ['architecture-analysis', new ArchitectureAnalysisTool()],
            ['test-coverage-analysis', new TestCoverageAnalysisTool()]
        ];

        for (const [id, tool] of toolsToRegister) {
            this.toolEngine.registerTool(id, tool);
        }

        // Register the coordination tool with proper dependency injection
        const multiAnalysisTool = new MultiAnalysisTool(this.toolEngine);
        const multiToolRegistrationResult = this.toolEngine.registerTool('multi-analysis', multiAnalysisTool);

        Logger.info(`🔧 Registered ${toolsToRegister.length + 1} analysis tools with Tool Engine`);
        Logger.info(`📋 MultiAnalysisTool registered: ${!!multiAnalysisTool}, execute method: ${typeof multiAnalysisTool.execute}`);
        Logger.info(`📋 Tool engine has multi-analysis: ${!!this.toolEngine.getTool('multi-analysis')}`);
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
     * Get cache key for the current configuration
     * @private
     */
    _getCacheKey() {
        // Get active analyses based on configuration
        const allAnalyses = ['tests', 'coverage', 'testcoverage', 'static', 'technicaldebt', 'architecture', 'requirements', 'featurespecs', 'project', 'planning'];
        const activeAnalyses = allAnalyses
            .filter(category => this.config.get('all') || this.config.get(category))
            .sort()
            .join(',');

        return `tool_analysis_${activeAnalyses}_v1`;
    }

    /**
     * Check if results are cached and valid
     * @private
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
     * @private
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

    /**
     * Run analysis using the tool infrastructure
     */
    async runAnalysis() {
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
            Logger.info('🔍 SeNARS Self-Analysis (Tool-Based)');
        }

        // Determine which analyses to run based on configuration
        const allAnalyses = ['tests', 'coverage', 'testcoverage', 'static', 'technicaldebt', 'architecture', 'requirements', 'featurespecs', 'project', 'planning'];

        // Determine which analyses to run based on configuration

        // If 'all' is set (default), or no specific analysis is requested but 'all' is true, include all analyses
        let requestedAnalyses = [];
        if (this.config.get('all')) {
            // Check if any specific analysis was requested; if not, use all, otherwise use only the specified ones
            const specificAnalyses = allAnalyses.filter(category => this.config.get(category));
            requestedAnalyses = specificAnalyses.length > 0 ? specificAnalyses : allAnalyses;
        } else {
            // Only include explicitly requested analyses
            requestedAnalyses = allAnalyses.filter(category => this.config.get(category));
        }

        // Make sure we have at least one analysis to run
        if (requestedAnalyses.length === 0) {
            requestedAnalyses = allAnalyses; // fallback to all if none specified
        }

        // Use the multi-analysis tool to coordinate
        const multiAnalysisToolData = this.toolEngine.getTool('multi-analysis');
        if (!multiAnalysisToolData) {
            Logger.error('❌ MultiAnalysisTool not found in tool engine');
            Logger.error('Available tools:', {tools: this.toolEngine.listTools ? this.toolEngine.listTools() : 'listTools method not available'});
            throw new AnalyzerError('MultiAnalysisTool not available', 'tool_not_found');
        }

        // Get the actual tool instance from the tool data
        const multiAnalysisTool = multiAnalysisToolData.instance;
        if (!multiAnalysisTool) {
            Logger.error('❌ MultiAnalysisTool instance not found in tool data');
            throw new AnalyzerError('MultiAnalysisTool instance not available', 'tool_instance_not_found');
        }

        if (typeof multiAnalysisTool.execute !== 'function') {
            Logger.error('❌ MultiAnalysisTool does not have execute method');
            Logger.error('Tool object:', {type: typeof multiAnalysisTool, name: multiAnalysisTool.constructor?.name});
            throw new AnalyzerError('MultiAnalysisTool execute method not found', 'execute_not_found');
        }

        const toolParams = {
            analyses: requestedAnalyses,
            verbose: this.config.get('verbose'),
            concurrency: this.config.get('analyzeConcurrency') || 2
        };

        let results;
        try {
            // Execute with proper context and tool integration
            results = await multiAnalysisTool.execute(toolParams, {
                config: this.config.getAll(),
                analyzer: this,
                startTime: Date.now()
            });

            // Update tool usage stats
            this._updateToolUsageStats(toolParams.analyses, Date.now());
        } catch (error) {
            Logger.error('❌ Error executing MultiAnalysisTool:', {message: error.message});
            throw new AnalyzerError('Failed to execute analysis via tools', 'tool_execution', error);
        }

        // Display results based on requested analyses
        this.display.display(results);

        // Show additional tables if requested or in default mode
        await this._displayAdditionalResults(results);

        // If NAR integration is enabled, send results to NAR for reasoning
        if (this.integrationEnabled && this.nar) {
            await this._integrateWithNAR(results);
        }

        // Cache the results
        this._cacheResults(results);

        return results;
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
            Logger.error('❌ Error integrating with NAR:', {message: error.message});
        }
    }

    /**
     * Convert analysis results to Narsese statements
     * @private
     */
    _convertToNarsese(results) {
        const statements = [];

        // Convert test results
        if (results.tests && !results.tests.error) {
            const passRate = results.tests.passedTests / Math.max(results.tests.totalTests, 1);
            const qualityLevel = passRate > 0.95 ? 'high' : passRate > 0.8 ? 'medium' : 'low';
            statements.push(`<test_quality --> ${qualityLevel}>. %${passRate.toFixed(2)};0.90%`);

            // System stability
            const stability = results.tests.failedTests === 0 ? 'stable' : 'unstable';
            statements.push(`<system_stability --> ${stability}>. %${(1 - results.tests.failedTests / results.tests.totalTests).toFixed(2)};0.90%`);
        }

        // Convert coverage results
        if (results.coverage && !results.coverage.error && results.coverage.available !== false) {
            const coverageLevel = results.coverage.lines > 80 ? 'high' :
                results.coverage.lines > 50 ? 'medium' : 'low';
            statements.push(`<test_coverage --> ${coverageLevel}>. %${(results.coverage.lines / 100).toFixed(2)};0.90%`);
        }

        // Convert static analysis results
        if (results.static && !results.static.error) {
            // Code complexity
            if (results.static.avgComplexity !== undefined) {
                const complexityLevel = results.static.avgComplexity > 30 ? 'high' :
                    results.static.avgComplexity > 15 ? 'medium' : 'low';
                statements.push(`<code_complexity --> ${complexityLevel}>. %${Math.min(1.0, results.static.avgComplexity / 50).toFixed(2)};0.90%`);
            }

            // Code size
            if (results.static.totalLines !== undefined) {
                const sizeLevel = results.static.totalLines > 50000 ? 'large' :
                    results.static.totalLines > 20000 ? 'medium' : 'small';
                statements.push(`<code_size --> ${sizeLevel}>. %${Math.min(1.0, results.static.totalLines / 50000).toFixed(2)};0.90%`);
            }
        }

        // Convert technical debt results
        if (results.technicaldebt && !results.technicaldebt.error) {
            const debtLevel = results.technicaldebt.totalDebtScore > 2000 ? 'high' :
                results.technicaldebt.totalDebtScore > 1000 ? 'medium' : 'low';
            statements.push(`<technical_debt --> ${debtLevel}>. %${Math.min(1.0, results.technicaldebt.totalDebtScore / 3000).toFixed(2)};0.90%`);
        }

        // Convert architecture results
        if (results.architecture && !results.architecture.error) {
            const dependencyQuality = results.architecture.cyclicDependencies === 0 ? 'good' : 'poor';
            statements.push(`<architecture_quality --> ${dependencyQuality}>. %${(1 - results.architecture.cyclicDependencies / 10).toFixed(2)};0.90%`);
        }

        return statements;
    }

    /**
     * Convert actionable insights from results to goals
     * @private
     */
    _convertInsightsToGoals(results) {
        const goals = [];

        // Add improvement goals based on analysis results
        if (results.tests && results.tests.failedTests > 0) {
            goals.push(`(improve_test_stability)! %0.9;0.9%`);
        }

        if (results.coverage && results.coverage.lines < 80) {
            goals.push(`(increase_test_coverage)! %0.8;0.9%`);
        }

        if (results.static && results.static.avgComplexity > 20) {
            goals.push(`(reduce_code_complexity)! %0.7;0.9%`);
        }

        if (results.technicaldebt && results.technicaldebt.totalDebtScore > 1000) {
            goals.push(`(reduce_technical_debt)! %0.9;0.9%`);
        }

        if (results.architecture && results.architecture.cyclicDependencies?.length > 0) {
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
                type: 'tool-based-self-analysis',
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
        const {tests, coverage, static: staticResults, technicaldebt, architecture} = results;

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

        if (this.config.get('all') && results.testcoverage) {
            this._displayTestCoverageAnalysis(results.testcoverage);
        }
    }

    /**
     * Update tool usage statistics
     * @private
     */
    _updateToolUsageStats(analyses, startTime) {
        const executionTime = Date.now() - startTime;

        for (const analysis of analyses) {
            const toolName = `${analysis}-analysis`;
            if (!this.toolUsageStats.has(toolName)) {
                this.toolUsageStats.set(toolName, {count: 0, totalExecutionTime: 0});
            }

            const stats = this.toolUsageStats.get(toolName);
            stats.count += 1;
            stats.totalExecutionTime += executionTime;
        }
    }

    /**
     * Display test coverage analysis results
     * @private
     */
    _displayTestCoverageAnalysis(testCoverageResults) {
        if (!testCoverageResults || testCoverageResults.error) return;

        Logger.info('\n🔍 TEST COVERAGE ANALYSIS:');

        if (testCoverageResults.summary) {
            const {totalTests, passedTests, failedTests, coveragePercentage} = testCoverageResults.summary;
            Logger.info(`  Total Tests: ${totalTests}`);
            Logger.info(`  Passed: ${passedTests}`);
            Logger.info(`  Failed: ${failedTests}`);
            Logger.info(`  Coverage: ${coveragePercentage ? coveragePercentage.toFixed(2) + '%' : 'N/A'}`);
        }

        // Display culprits of failing tests
        if (testCoverageResults.failingTestCulprits && testCoverageResults.failingTestCulprits.length > 0) {
            Logger.info('\n❌ CULPRITS OF FAILING TESTS (Top 5):');
            testCoverageResults.failingTestCulprits.slice(0, 5).forEach((culprit, index) => {
                Logger.info(`  ${index + 1}. ${culprit.sourceFile} (${culprit.failingTestCount} failing tests)`);
            });
        }

        // Display supports of passing tests (top)
        if (testCoverageResults.passingTestSupports?.topSupports && testCoverageResults.passingTestSupports.topSupports.length > 0) {
            Logger.info('\n✅ SUPPORTS OF PASSING TESTS (Top 5):');
            testCoverageResults.passingTestSupports.topSupports.slice(0, 5).forEach((support, index) => {
                Logger.info(`  ${index + 1}. ${support.sourceFile} (${support.passingTestCount} passing tests)`);
            });
        }

        // Display supports of passing tests (bottom)
        if (testCoverageResults.passingTestSupports?.bottomSupports && testCoverageResults.passingTestSupports.bottomSupports.length > 0) {
            Logger.info('\n📉 LEAST TESTED FILES (Bottom 5):');
            testCoverageResults.passingTestSupports.bottomSupports.slice(0, 5).forEach((support, index) => {
                Logger.info(`  ${index + 1}. ${support.sourceFile} (${support.passingTestCount} passing tests)`);
            });
        }

        // Display causal analysis
        if (testCoverageResults.causalAnalysis) {
            const {highCausalFiles, lowCausalFiles} = testCoverageResults.causalAnalysis;

            if (highCausalFiles && highCausalFiles.length > 0) {
                Logger.info('\n🔗 HIGH COVERAGE FILES (Most tested, Top 5):');
                highCausalFiles.slice(0, 5).forEach((file, index) => {
                    Logger.info(`  ${index + 1}. ${file.sourceFile} (${file.testCount} tests)`);
                });
            }

            if (lowCausalFiles && lowCausalFiles.length > 0) {
                Logger.info('\n⚠️  LOW COVERAGE FILES (Least tested, Bottom 5):');
                lowCausalFiles.slice(0, 5).forEach((file, index) => {
                    Logger.info(`  ${index + 1}. ${file.sourceFile} (${file.testCount} tests)`);
                });
            }
        }
    }

    /**
     * Get tool usage statistics
     * @returns {Map} - Tool usage statistics
     */
    getToolUsageStats() {
        return this.toolUsageStats;
    }
}