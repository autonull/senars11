import {SeNARSSelfAnalyzer} from './SeNARSSelfAnalyzer.js';
import {Logger} from '@senars/core/src/util/Logger.js';

/**
 * SelfAnalysisKnowledgeBaseConnector
 * Connects the self-analysis results to the KnowledgeBaseConnector architecture
 * This allows the system's self-analysis to be treated as a knowledge source for reasoning
 */
class SoftwareKnowledgeBaseConnector {
    constructor(config = {}) {
        this.config = config;
        this.analyzer = new SeNARSSelfAnalyzer(config.analyzer || {});
        this.cache = new Map(); // Cache analysis results
        this.cacheTTL = config.cacheTTL || 600000; // 10 minutes default for analysis
        this.lastAnalysis = null;
        this.lastAnalysisTime = 0;
    }

    /**
     * Perform the self-analysis and return results
     * @param {Object} query - Query parameters for analysis
     * @param {Array} categories - Categories to analyze (tests, coverage, static, etc.)
     * @returns {Object} Analysis results
     */
    async query(query, options = {}) {
        // Check cache first
        const cacheKey = this._buildCacheKey(query);
        const cachedResult = this._getCachedResult(cacheKey);
        if (cachedResult) return cachedResult;

        // Perform analysis based on query parameters
        const analysisQuery = query.categories || ['all'];
        const results = await this._performAnalysis(analysisQuery, options);

        // Cache the result
        this._cacheResult(cacheKey, results);
        this.lastAnalysis = results;
        this.lastAnalysisTime = Date.now();

        return results;
    }

    /**
     * Perform the actual analysis using the self-analyzer
     */
    async _performAnalysis(categories, options = {}) {
        const analysisOptions = {
            verbose: false,
            summaryOnly: false,
            slowest: false,
            ...options
        };

        // Add specific categories to options
        for (const category of categories) {
            if (category === 'all') {
                analysisOptions.all = true;
                break;
            }
            analysisOptions[category] = true;
        }

        // Run the analysis
        const analyzer = new SeNARSSelfAnalyzer(analysisOptions);
        return await analyzer.runAnalysis();
    }

    _buildCacheKey(query) {
        return `self-analysis:${JSON.stringify(query)}`;
    }

    _getCachedResult(cacheKey) {
        const cachedResult = this.cache.get(cacheKey);
        return cachedResult && this._isCacheValid(cachedResult) ? cachedResult.data : null;
    }

    _isCacheValid(cachedResult) {
        return Date.now() - cachedResult.timestamp < this.cacheTTL;
    }

    _cacheResult(cacheKey, result) {
        this.cache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });
    }

    /**
     * Get the last analysis results without re-running
     */
    getLastAnalysis() {
        if (this.lastAnalysis &&
            Date.now() - this.lastAnalysisTime < this.cacheTTL) {
            return this.lastAnalysis;
        }
        return null;
    }

    /**
     * Clear the analysis cache
     */
    clearCache() {
        this.cache.clear();
        this.lastAnalysis = null;
        this.lastAnalysisTime = 0;
    }

    /**
     * Convert analysis results to normalized knowledge format
     */
    normalizeResults(results) {
        const normalized = [];

        // Convert test results
        if (results.tests) {
            normalized.push({
                id: 'test-results',
                category: 'testing',
                metrics: {
                    total: results.tests.totalTests,
                    passed: results.tests.passedTests,
                    failed: results.tests.failedTests,
                    passRate: results.tests.passedTests / Math.max(results.tests.totalTests, 1),
                    status: results.tests.status
                },
                summary: `Tests: ${results.tests.passedTests}/${results.tests.totalTests} passed (${Math.round((results.tests.passedTests / results.tests.totalTests) * 100)}%)`,
                timestamp: Date.now()
            });
        }

        // Convert coverage results
        if (results.coverage) {
            normalized.push({
                id: 'coverage-results',
                category: 'coverage',
                metrics: {
                    lines: results.coverage.lines,
                    functions: results.coverage.functions,
                    branches: results.coverage.branches,
                    statements: results.coverage.statements
                },
                summary: `Coverage: ${results.coverage.lines}% lines`,
                timestamp: Date.now()
            });
        }

        // Convert static analysis results
        if (results.static) {
            normalized.push({
                id: 'static-results',
                category: 'static',
                metrics: {
                    jsFiles: results.static.jsFiles,
                    totalLines: results.static.totalLines,
                    directories: results.static.directories,
                    avgLinesPerFile: results.static.avgLinesPerFile,
                    avgComplexity: results.static.avgComplexity
                },
                summary: `Code: ${results.static.jsFiles} files, ~${results.static.totalLines} lines`,
                timestamp: Date.now()
            });
        }

        // Convert technical debt results
        if (results.technicaldebt) {
            normalized.push({
                id: 'technical-debt',
                category: 'quality',
                metrics: {
                    totalDebtScore: results.technicaldebt.totalDebtScore,
                    avgDebtPerFile: results.technicaldebt.avgDebtScore,
                    highRiskFiles: results.technicaldebt.highRiskFiles?.length || 0
                },
                summary: `Technical Debt: ${results.technicaldebt.totalDebtScore.toFixed(1)} total score`,
                timestamp: Date.now()
            });
        }

        // Convert architecture results
        if (results.architecture) {
            normalized.push({
                id: 'architecture',
                category: 'architecture',
                metrics: {
                    filesInGraph: Object.keys(results.architecture.dependencyGraph || {}).length,
                    cyclicDependencies: results.architecture.cyclicDependencies?.length || 0,
                    layers: Object.keys(results.architecture.architecturalLayers || {}).length,
                    entryPoints: results.architecture.apiEntryPoints?.length || 0
                },
                summary: `Architecture: ${Object.keys(results.architecture.architecturalLayers || {}).length} layers`,
                timestamp: Date.now()
            });
        }

        return normalized;
    }

    /**
     * Get a summary of the analysis results
     */
    getSummary() {
        const lastAnalysis = this.getLastAnalysis();
        if (!lastAnalysis) return null;

        const summary = {
            timestamp: this.lastAnalysisTime,
            categories: []
        };

        if (lastAnalysis.tests) summary.categories.push('tests');
        if (lastAnalysis.coverage) summary.categories.push('coverage');
        if (lastAnalysis.static) summary.categories.push('static');
        if (lastAnalysis.technicaldebt) summary.categories.push('technicaldebt');
        if (lastAnalysis.architecture) summary.categories.push('architecture');
        if (lastAnalysis.planning) summary.categories.push('planning');

        return summary;
    }

    /**
     * Run analysis and return structured data suitable for knowledge integration
     */
    async getAnalysisData(query, options = {}) {
        const results = await this.query(query, options);

        // Structure the data for knowledge integration
        const structuredData = {
            metadata: {
                timestamp: Date.now(),
                type: 'system-analysis',
                source: 'self-analyze'
            },
            results: this.normalizeResults(results),
            raw: results
        };

        return structuredData;
    }
}

// SelfAnalysisManager that integrates with the ExternalKnowledgeManager
class SelfAnalysisManager {
    constructor(config = {}) {
        this.config = config;
        this.connector = new SoftwareKnowledgeBaseConnector(config.connector || {});
        this.nar = null; // Will be set when connected to NAR
        this.normalizer = new SelfAnalysisNormalizer();
    }

    // Connect to NAR for integration
    connectToNAR(nar) {
        this.nar = nar;
    }

    // Run analysis and integrate with NAR
    async runAnalysisAndIntegrate(query, options = {}) {
        if (!this.nar) {
            throw new Error('SelfAnalysisManager not connected to NAR');
        }

        // Get analysis data
        const analysisData = await this.connector.getAnalysisData(query, options);

        // Normalize the data
        const normalizedData = this.normalizer.normalize(analysisData);

        // Integrate with NAR
        await this.integrateWithNAR(normalizedData);

        // Generate insights and recommendations based on the analysis
        const insights = await this.generateInsights(analysisData);

        // Integrate insights as well
        await this.integrateInsights(insights);

        return {
            ...analysisData,
            normalized: normalizedData,
            integrated: true,
            insights: insights,
            timestamp: Date.now()
        };
    }

    // Generate insights from analysis data
    async generateInsights(analysisData) {
        const insights = [];
        const results = analysisData.raw;

        // Test-related insights
        if (results.tests) {
            if (results.tests.failedTests > 0) {
                insights.push({
                    id: 'test-failures-identified',
                    category: 'testing',
                    priority: 'high',
                    description: `Identified ${results.tests.failedTests} failed tests requiring immediate attention`,
                    recommendation: 'Fix failing tests to ensure system stability'
                });
            }

            if (results.tests.passedTests > 0 && results.tests.failedTests === 0) {
                insights.push({
                    id: 'test-stability-good',
                    category: 'testing',
                    priority: 'low',
                    description: 'All tests are passing, system appears stable',
                    recommendation: 'Maintain current testing practices'
                });
            }
        }

        // Coverage-related insights
        if (results.coverage && results.coverage.lines !== undefined) {
            if (results.coverage.lines < 80) {
                insights.push({
                    id: 'low-coverage-identified',
                    category: 'coverage',
                    priority: 'high',
                    description: `Test coverage is ${results.coverage.lines}%, below recommended 80%`,
                    recommendation: 'Increase test coverage to improve reliability'
                });
            } else {
                insights.push({
                    id: 'good-coverage-maintained',
                    category: 'coverage',
                    priority: 'low',
                    description: `Test coverage is ${results.coverage.lines}%, meeting quality standards`,
                    recommendation: 'Maintain current coverage levels'
                });
            }
        }

        // Complexity-related insights
        if (results.static && results.static.avgComplexity !== undefined) {
            if (results.static.avgComplexity > 20) {
                insights.push({
                    id: 'high-complexity-identified',
                    category: 'complexity',
                    priority: 'medium',
                    description: `Average complexity is ${results.static.avgComplexity.toFixed(2)}, indicating potentially complex code`,
                    recommendation: 'Consider refactoring complex functions and modules'
                });
            }
        }

        // Technical debt insights
        if (results.technicaldebt) {
            if (results.technicaldebt.totalDebtScore > 1000) {
                insights.push({
                    id: 'high-technical-debt-identified',
                    category: 'quality',
                    priority: 'high',
                    description: `Total technical debt score is ${results.technicaldebt.totalDebtScore.toFixed(1)}`,
                    recommendation: 'Address technical debt to improve maintainability'
                });
            }
        }

        // Architecture insights
        if (results.architecture && results.architecture.cyclicDependencies) {
            if (results.architecture.cyclicDependencies.length > 0) {
                insights.push({
                    id: 'cyclic-dependencies-identified',
                    category: 'architecture',
                    priority: 'high',
                    description: `Found ${results.architecture.cyclicDependencies.length} cyclic dependencies`,
                    recommendation: 'Resolve cyclic dependencies to improve modularity'
                });
            }
        }

        return insights;
    }

    // Integrate insights as goals for the NAR system
    async integrateInsights(insights) {
        if (!this.nar || !insights || insights.length === 0) return;

        for (const insight of insights) {
            try {
                // Convert insight to a goal for the NAR to work on
                const goalStatement = this.insightToGoal(insight);
                if (goalStatement) {
                    await this.nar.input(goalStatement);
                }
            } catch (error) {
                Logger.warn(`Failed to convert insight to goal:`, error);
            }
        }
    }

    // Convert an insight to a Narsese goal
    insightToGoal(insight) {
        if (!insight.recommendation) return null;

        // Extract key entities from the recommendation
        const entities = this.extractEntities(insight.recommendation);

        // Create a goal statement
        const action = this.mapRecommendationToAction(insight.recommendation);
        if (!action) return null;

        // Format as a Narsese goal
        return `(${action})! %1.00;0.90%`;
    }

    // Extract entities from text
    extractEntities(text) {
        // Simple entity extraction - could be enhanced with more sophisticated NLP
        const entities = [];

        // Look for specific terms
        const terms = ['tests', 'coverage', 'complexity', 'refactoring', 'dependencies', 'documentation'];
        for (const term of terms) {
            if (text.toLowerCase().includes(term)) {
                entities.push(term);
            }
        }

        return entities;
    }

    // Map recommendations to actions
    mapRecommendationToAction(recommendation) {
        const rec = recommendation.toLowerCase();

        if (rec.includes('fix') || rec.includes('resolve')) {
            return 'fix_problems';
        } else if (rec.includes('add') || rec.includes('increase')) {
            return 'add_improvements';
        } else if (rec.includes('refactor') || rec.includes('consider')) {
            return 'refactor_code';
        } else if (rec.includes('maintain')) {
            return 'maintain_quality';
        } else {
            // Extract the main verb phrase
            const match = recommendation.match(/\b(\w+)\b/);
            return match ? match[1] : 'improve_system';
        }
    }

    // Integrate analysis results with NAR
    async integrateWithNAR(data) {
        if (!this.nar) return;

        // Convert each analysis result to Narsese and add to NAR
        for (const item of data) {
            try {
                const narseseStatements = this.convertToNarsese(item);
                if (narseseStatements) {
                    if (Array.isArray(narseseStatements)) {
                        // If multiple statements are generated from one item
                        for (const statement of narseseStatements) {
                            await this.nar.input(statement);
                        }
                    } else {
                        // If single statement is generated
                        await this.nar.input(narseseStatements);
                    }
                }
            } catch (error) {
                Logger.warn(`Failed to convert analysis item to Narsese:`, error);
            }
        }
    }

    // Convert analysis item to Narsese
    convertToNarsese(item) {
        if (!item.category || !item.metrics) return null;

        // Convert analysis results to Narsese statements
        const statements = [];

        // Handle different categories with more detailed Narsese generation
        switch (item.category) {
            case 'testing':
                // Quality assessment based on pass rate
                if (item.metrics.passRate !== undefined) {
                    const qualityLevel = item.metrics.passRate > 0.95 ? 'excellent' :
                        item.metrics.passRate > 0.85 ? 'good' :
                            item.metrics.passRate > 0.7 ? 'fair' : 'poor';
                    statements.push(`<test_quality --> ${qualityLevel}>. %1.00;0.90%`);
                }

                // Test stability assessment
                if (item.metrics.failed !== undefined && item.metrics.total !== undefined) {
                    const stability = item.metrics.failed === 0 ? 'stable' : 'unstable';
                    statements.push(`<system_stability --> ${stability}>. %1.00;0.90%`);
                }
                break;

            case 'coverage':
                // Coverage assessment
                if (item.metrics.lines !== undefined) {
                    const coverageLevel = item.metrics.lines > 80 ? 'high' :
                        item.metrics.lines > 60 ? 'medium' :
                            item.metrics.lines > 40 ? 'low' : 'very_low';
                    statements.push(`<test_coverage --> ${coverageLevel}>. %1.00;0.90%`);

                    // Reliability assessment based on coverage
                    const reliability = item.metrics.lines > 80 ? 'reliable' :
                        item.metrics.lines > 50 ? 'moderately_reliable' :
                            'unreliable';
                    statements.push(`<system_reliability --> ${reliability}>. %1.00;0.90%`);
                }
                break;

            case 'static':
                // Code complexity assessment
                if (item.metrics.avgComplexity !== undefined) {
                    const complexityLevel = item.metrics.avgComplexity > 30 ? 'highly_complex' :
                        item.metrics.avgComplexity > 20 ? 'complex' :
                            item.metrics.avgComplexity > 10 ? 'moderately_complex' : 'simple';
                    statements.push(`<code_complexity --> ${complexityLevel}>. %1.00;0.90%`);

                    // Maintainability assessment
                    const maintainability = item.metrics.avgComplexity < 15 ? 'maintainable' :
                        item.metrics.avgComplexity < 25 ? 'moderately_maintainable' : 'difficult_to_maintain';
                    statements.push(`<code_maintainability --> ${maintainability}>. %1.00;0.90%`);
                }

                // Code size assessment
                if (item.metrics.totalLines !== undefined) {
                    const sizeLevel = item.metrics.totalLines > 50000 ? 'large' :
                        item.metrics.totalLines > 10000 ? 'medium' : 'small';
                    statements.push(`<code_size --> ${sizeLevel}>. %1.00;0.90%`);
                }

                // File count assessment
                if (item.metrics.jsFiles !== undefined) {
                    const fileCount = item.metrics.jsFiles > 100 ? 'many_files' :
                        item.metrics.jsFiles > 50 ? 'moderate_files' : 'few_files';
                    statements.push(`<file_count --> ${fileCount}>. %1.00;0.90%`);
                }
                break;

            case 'quality': // technical debt
                            // Technical debt assessment
                if (item.metrics.totalDebtScore !== undefined) {
                    const debtLevel = item.metrics.totalDebtScore > 2000 ? 'high_debt' :
                        item.metrics.totalDebtScore > 1000 ? 'moderate_debt' :
                            item.metrics.totalDebtScore > 500 ? 'low_debt' : 'minimal_debt';
                    statements.push(`<technical_debt --> ${debtLevel}>. %1.00;0.90%`);

                    // Refactoring priority
                    const refactoringPriority = item.metrics.totalDebtScore > 1500 ? 'high_priority' :
                        item.metrics.totalDebtScore > 750 ? 'medium_priority' : 'low_priority';
                    statements.push(`<refactoring_priority --> ${refactoringPriority}>. %1.00;0.90%`);
                }

                // Risk assessment based on debt
                if (item.metrics.highRiskFiles !== undefined) {
                    const riskLevel = item.metrics.highRiskFiles > 10 ? 'high_risk' :
                        item.metrics.highRiskFiles > 5 ? 'medium_risk' : 'low_risk';
                    statements.push(`<development_risk --> ${riskLevel}>. %1.00;0.90%`);
                }
                break;

            case 'architecture':
                // Architecture quality
                if (item.metrics.cyclicDependencies !== undefined) {
                    const architectureQuality = item.metrics.cyclicDependencies === 0 ? 'well_architected' : 'poorly_architected';
                    statements.push(`<architecture_quality --> ${architectureQuality}>. %1.00;0.90%`);

                    // Modularity assessment
                    const modularity = item.metrics.cyclicDependencies === 0 ? 'highly_modular' :
                        item.metrics.cyclicDependencies < 5 ? 'modular' : 'tightly_coupled';
                    statements.push(`<code_modularity --> ${modularity}>. %1.00;0.90%`);
                }

                // Layer count assessment
                if (item.metrics.layers !== undefined) {
                    const layerCount = item.metrics.layers > 10 ? 'many_layers' :
                        item.metrics.layers > 5 ? 'moderate_layers' : 'few_layers';
                    statements.push(`<architectural_layers --> ${layerCount}>. %1.00;0.90%`);
                }
                break;

            case 'planning':
                // Development pace assessment
                if (item.metrics.developmentPace !== undefined) {
                    const pace = item.metrics.developmentPace === 'high' ? 'fast_paced' :
                        item.metrics.developmentPace === 'medium' ? 'moderate_paced' : 'slow_paced';
                    statements.push(`<development_pace --> ${pace}>. %1.00;0.90%`);
                }
                break;
        }

        // Add a general assessment combining metrics
        if (item.metrics.passRate !== undefined && item.metrics.lines !== undefined) {
            // Overall quality assessment based on multiple factors
            const overallQuality = (item.metrics.passRate * item.metrics.lines / 100) > 70 ?
                'high_quality' : 'low_quality';
            statements.push(`<overall_system_quality --> ${overallQuality}>. %1.00;0.90%`);
        }

        return statements.length > 0 ? statements : null; // Return all statements
    }

    // Get the last analysis results
    getLastAnalysis() {
        return this.connector.getLastAnalysis();
    }

    // Get summary of the analysis
    getSummary() {
        return this.connector.getSummary();
    }

    // Clear cache
    clearCache() {
        this.connector.clearCache();
    }

    // Perform specific analysis without integration
    async runAnalysis(query, options = {}) {
        return await this.connector.getAnalysisData(query, options);
    }
}

// Normalizer for self-analysis data
class SelfAnalysisNormalizer {
    normalize(analysisData) {
        if (!analysisData || !analysisData.results) return [];

        return analysisData.results.map(item => ({
            ...item,
            normalized: true,
            confidence: 1.0,
            source: 'self-analysis'
        }));
    }
}

// Export the classes
const createSelfAnalysisManager = (config = {}) => new SelfAnalysisManager(config);

export {
    SoftwareKnowledgeBaseConnector,
    SelfAnalysisManager,
    createSelfAnalysisManager
};