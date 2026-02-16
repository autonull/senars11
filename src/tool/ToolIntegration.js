/**
 * @file src/tools/ToolIntegration.js
 * @description Integration layer between tools and reasoning core
 */

import {ToolEngine} from './ToolEngine.js';
import {ToolRegistry} from './ToolRegistry.js';
import {BaseComponent} from '../util/BaseComponent.js';

/**
 * Integration layer that connects tools to the reasoning core
 */
export class ToolIntegration extends BaseComponent {
    /**
     * @param {object} config - Configuration for tool integration
     */
    constructor(config = {}) {
        super({
            enableRegistry: true,
            enableDiscovery: true,
            ...config
        }, 'ToolIntegration');

        this.engine = new ToolEngine(this.config.engine ?? {});
        this.registry = this.config.enableRegistry ? new ToolRegistry(this.engine) : null;
        this.reasoningCore = null;
        this.toolUsageHistory = [];
    }

    /**
     * Connect to the reasoning core
     * @param {object} reasoner - The reasoning core instance
     */
    connectToReasoningCore(reasoner) {
        this.reasoningCore = reasoner;
        this.logger.info('Connected tools to reasoning core');
        return this;
    }

    /**
     * Register all tools for the NAR system
     */
    async initializeTools() {
        if (!this.registry) throw new Error('Tool registry not enabled');

        try {
            const toolModules = await import('./index.js');
            const toolConfigs = this._getToolConfigs();

            for (const { id, className, category, description } of toolConfigs) {
                const toolClass = toolModules[className];
                if (!toolClass) continue;

                try {
                    const tool = new toolClass();
                    this.registry.registerTool(id, tool, { category, description });
                } catch (toolError) {
                    this.logger.warn(`Failed to instantiate tool ${id}, skipping:`, toolError.message);
                }
            }

            this.logger.info('Tools initialization completed', {
                toolCount: this.engine.getAvailableTools().length
            });
        } catch (error) {
            this.logger.warn('Tool initialization partially failed:', error.message);
        }
        return this;
    }

    _getToolConfigs() {
        return [
            { id: 'file-operations', className: 'FileOperationsTool', category: 'file-operations', description: 'File operations including read, write, append, delete, list, and stat' },
            { id: 'command-executor', className: 'CommandExecutorTool', category: 'command-execution', description: 'Safe command execution in sandboxed environment' },
            { id: 'web-automation', className: 'WebAutomationTool', category: 'web-automation', description: 'Web automation including fetch, scrape, and check operations' },
            { id: 'media-processing', className: 'MediaProcessingTool', category: 'media-processing', description: 'Media processing including PDF, image, and text extraction' },
            { id: 'embedding', className: 'EmbeddingTool', category: 'embedding', description: 'Text embedding, similarity, and comparison operations' }
        ];
    }

    /**
     * Execute a tool as part of reasoning process
     */
    async executeTool(toolId, params, context = {}) {
        const startTime = Date.now();
        try {
            const result = await this.engine.executeTool(toolId, params, { reasoningContext: context });
            const executionTime = this._logToolUsage(toolId, params, result, startTime, context);
            return { ...result, executionTime };
        } catch (error) {
            this.logger.error(`Tool execution failed: ${toolId}`, {
                error: error.message,
                params: JSON.stringify(params).substring(0, 200)
            });
            const errorResult = { success: false, error: error.message, toolId };
            const executionTime = this._logToolUsage(toolId, params, errorResult, startTime, context);
            return { ...errorResult, executionTime };
        }
    }

    _logToolUsage(toolId, params, result, startTime, context) {
        const executionTime = Date.now() - startTime;
        this.toolUsageHistory.push({
            toolId,
            params,
            result,
            executionTime,
            timestamp: Date.now(),
            context
        });

        if (this.toolUsageHistory.length > 1000) {
            this.toolUsageHistory.splice(0, this.toolUsageHistory.length - 500);
        }
    }

    /**
     * Execute multiple tools as part of reasoning
     */
    async executeTools(toolCalls, context = {}, sequential = false) {
        if (sequential) {
            const results = [];
            for (const call of toolCalls) {
                const result = await this.executeTool(call.toolId, call.params, context);
                results.push(result);
                if (!result.success && !call.continueOnError) break;
            }
            return results;
        }
        return Promise.all(toolCalls.map(call => this.executeTool(call.toolId, call.params, context)));
    }

    /**
     * Find tools that match certain criteria
     */
    findTools(criteria = {}) {
        return this.registry ? this.registry.findTools(criteria) : [];
    }

    /**
     * Get all available tools
     */
    getAvailableTools() {
        return this.engine.getAvailableTools();
    }

    /**
     * Get tool usage statistics
     */
    getUsageStats() {
        const { totalCalls, successfulCalls } = this.toolUsageHistory.reduce(
            (acc, item) => ({
                totalCalls: acc.totalCalls + 1,
                successfulCalls: acc.successfulCalls + (item.result.success ? 1 : 0),
            }),
            { totalCalls: 0, successfulCalls: 0 }
        );

        return {
            ...this.engine.getStats(),
            totalToolCalls: totalCalls,
            successfulToolCalls: successfulCalls,
            failedToolCalls: totalCalls - successfulCalls,
            lastToolCalls: this.toolUsageHistory.slice(-10),
        };
    }

    /**
     * Analyze tool usage patterns for intelligent selection
     */
    analyzeUsagePatterns() {
        const toolUsage = this.toolUsageHistory.reduce((acc, usage) => {
            acc[usage.toolId] ??= {
                totalCalls: 0,
                successfulCalls: 0,
                totalExecutionTime: 0,
            };

            acc[usage.toolId].totalCalls++;
            if (usage.result.success) acc[usage.toolId].successfulCalls++;
            acc[usage.toolId].totalExecutionTime += usage.executionTime;

            return acc;
        }, {});

        for (const data of Object.values(toolUsage)) {
            data.avgExecutionTime = data.totalExecutionTime / data.totalCalls;
            data.successRate = data.successfulCalls / data.totalCalls;
        }

        return toolUsage;
    }
}