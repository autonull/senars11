/**
 * @file AgentToolsBridge.js
 * @description Bridge for agent tools in browser environment
 */

import { NAR } from '@senars/nar';
import { MeTTaInterpreter } from '@senars/metta';
import { SeNARSBridge } from '@senars/metta-bridge';

export class AgentToolsBridge {
    constructor() {
        this.nar = null;
        this.metta = null;
        this.bridge = null;
        this.tools = new Map();
    }

    async initialize() {
        // Create minimal NAR instance for tool demonstrations
        this.nar = new NAR({
            memory: { capacity: 100 },
            cycle: { delay: 100, maxTasksPerCycle: 5 },
            logging: { level: 'info' }
        });

        // Initialize NAR (registers rules, etc.)
        await this.nar.initialize();

        // Enable tracing for visualization
        this.nar.traceEnabled = true;

        // Initialize MeTTa
        this.metta = new MeTTaInterpreter(this.nar);
        this.bridge = new SeNARSBridge(this.nar, this.metta);
        this.metta.reasoner = { bridge: this.bridge }; // Link bridge back to metta
        this.metta._initializeBridge();

        // Register tools
        this.registerTools();
    }

    registerTools() {
        // MeTTa Execution Tool
        this.tools.set('run_metta', {
            name: 'run_metta',
            description: 'Execute MeTTa code',
            parameters: {
                code: 'string - MeTTa code to execute'
            },
            execute: async (args) => {
                if (!this.metta) {
                    return { success: false, error: 'MeTTa not initialized' };
                }
                try {
                    const result = await this.metta.run(args.code);
                    return {
                        success: true,
                        data: result.toString()
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message
                    };
                }
            }
        });

        // Weather tool (demo/example)
        this.tools.set('get_weather', {
            name: 'get_weather',
            description: 'Get current weather for a location',
            parameters: {
                location: 'string - City name'
            },
            execute: async (args) => {
                const location = args.location || 'Unknown';
                // Simulate weather API
                return {
                    success: true,
                    data: `Sunny, 22°C in ${location}`
                };
            }
        });

        // NAR Control Tool - Get Beliefs
        this.tools.set('get_beliefs', {
            name: 'get_beliefs',
            description: 'Query current beliefs in the NAR system',
            parameters: {},
            execute: async (args) => {
                if (!this.nar) {
                    return { success: false, error: 'NAR not initialized' };
                }

                const beliefs = this.nar.memory.getBeliefs().slice(0, 10);
                return {
                    success: true,
                    data: beliefs.map(b => ({
                        content: b.content?.toString() || 'Unknown',
                        truth: b.truth,
                        priority: b.priority
                    }))
                };
            }
        });

        // NAR Control Tool - Add Belief
        this.tools.set('add_belief', {
            name: 'add_belief',
            description: 'Add a belief to the NAR system in Narsese format',
            parameters: {
                content: 'string - Narsese statement (e.g., "<A --> B>.")'
            },
            execute: async (args) => {
                if (!this.nar) {
                    return { success: false, error: 'NAR not initialized' };
                }

                try {
                    const content = args.content;
                    if (!content) {
                        return { success: false, error: 'No content provided' };
                    }

                    this.nar.input(content);
                    return {
                        success: true,
                        data: `Belief added: ${content}`
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message
                    };
                }
            }
        });

        // NAR Control Tool - Add Goal
        this.tools.set('add_goal', {
            name: 'add_goal',
            description: 'Add a goal to the NAR system in Narsese format',
            parameters: {
                content: 'string - Narsese goal statement (e.g., "<A --> B>!")'
            },
            execute: async (args) => {
                if (!this.nar) {
                    return { success: false, error: 'NAR not initialized' };
                }

                try {
                    const content = args.content;
                    if (!content) {
                        return { success: false, error: 'No content provided' };
                    }

                    this.nar.input(content);
                    return {
                        success: true,
                        data: `Goal added: ${content}`
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message
                    };
                }
            }
        });

        // NAR Control Tool - Query
        this.tools.set('query_nar', {
            name: 'query_nar',
            description: 'Query the NAR system with a question in Narsese format',
            parameters: {
                content: 'string - Narsese query (e.g., "<?x --> A>?")'
            },
            execute: async (args) => {
                if (!this.nar) {
                    return { success: false, error: 'NAR not initialized' };
                }

                try {
                    const content = args.content;
                    if (!content) {
                        return { success: false, error: 'No content provided' };
                    }

                    this.nar.input(content);
                    // In a real implementation, we'd capture query results
                    return {
                        success: true,
                        data: `Query submitted: ${content}`
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message
                    };
                }
            }
        });

        // NAR Control Tool - Run Cycles
        this.tools.set('run_cycles', {
            name: 'run_cycles',
            description: 'Run inference cycles in the NAR system',
            parameters: {
                count: 'number - Number of cycles to run (default: 1)'
            },
            execute: async (args) => {
                if (!this.nar) {
                    return { success: false, error: 'NAR not initialized' };
                }

                const count = args.count || 1;
                for (let i = 0; i < count; i++) {
                    await this.nar.step();
                }

                return {
                    success: true,
                    data: `Ran ${count} inference cycle(s)`
                };
            }
        });
    }

    /**
     * Get tool descriptions for LM context
     */
    getToolDescriptions() {
        return Array.from(this.tools.values()).map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }));
    }

    /**
     * Execute a tool by name
     */
    async executeTool(toolName, args = {}) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            return {
                success: false,
                error: `Tool '${toolName}' not found`
            };
        }

        try {
            return await tool.execute(args);
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check if a tool exists
     */
    hasTool(toolName) {
        return this.tools.has(toolName);
    }

    /**
     * Get NAR instance for direct access if needed
     */
    getNAR() {
        return this.nar;
    }
}
