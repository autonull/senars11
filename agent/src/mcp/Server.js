import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {z} from "zod";
import vm from "node:vm";
import {Safety} from "./Safety.js";

/**
 * MCP Server for exposing SeNARS services as MCP tools.
 */
export class Server {
    constructor({nar = null, mettaInterpreter = null, ...options} = {}) {
        this.options = options;
        this.nar = nar;
        this.mettaInterpreter = mettaInterpreter;
        this.safety = new Safety(options.safety);

        this.server = new McpServer({
            name: "SeNARS-MCP-Server",
            version: "1.0.0"
        });

        this.registerTools();
    }

    registerTools() {
        this.server.tool("ping", {}, async () => ({content: [{type: "text", text: "pong"}]}));

        this.server.tool(
            "reason",
            {
                premises: z.array(z.string()).describe("A list of premises in Narsese or natural language"),
                goal: z.string().optional().describe("A goal to achieve or question to answer")
            },
            async ({premises, goal}) => {
                if (!this.nar) return this._error("NAR instance not available.");

                try {
                    // Safety: Scrub PII
                    const safePremises = this.safety.validateInput(premises);
                    const safeGoal = goal ? this.safety.validateInput(goal) : undefined;

                    for (const premise of safePremises) await this.nar.input(premise);
                    if (safeGoal) await this.nar.input(safeGoal);

                    const derivations = await this.nar.runCycles(10);
                    const uniqueDerivations = this._deduplicateTasks(derivations.flat());
                    return this._formatReasoningReport(safePremises, safeGoal, uniqueDerivations);
                } catch (error) {
                    return this._error(`Reasoning error: ${error.message}`);
                }
            }
        );

        this.server.tool(
            "memory-query",
            {
                query: z.string().describe("Concept to query"),
                limit: z.number().default(10).describe("Max results")
            },
            async ({query, limit}) => {
                if (!this.nar) return this._error("NAR instance not available.");

                try {
                    const safeQuery = this.safety.validateInput(query);
                    const results = (this.nar.query(safeQuery) || []).slice(0, limit);
                    return this._formatMemoryReport(safeQuery, results, limit);
                } catch (error) {
                    return this._error(`Memory query error: ${error.message}`);
                }
            }
        );

        this.server.tool(
            "execute-tool",
            {
                toolName: z.string().describe("Tool name"),
                parameters: z.record(z.any()).describe("Parameters")
            },
            async ({toolName, parameters}) => {
                if (!this.nar) return this._error("NAR instance not available.");

                try {
                    // Supports MCR functionality (NARTool) via tool integration
                    const result = await this.nar.executeTool(toolName, this.safety.validateInput(parameters));
                    return this._formatToolReport(toolName, result);
                } catch (error) {
                    return this._error(`Tool execution error: ${error.message}`);
                }
            }
        );

        this.server.tool(
            "evaluate_js",
            {code: z.string().describe("JavaScript code to evaluate (sandboxed)")},
            async ({code}) => {
                try {
                    const context = vm.createContext({console, JSON, Math});
                    const result = vm.runInContext(code, context, {timeout: 1000});
                    return {
                        content: [{
                            type: "text",
                            text: `### Code Execution Result\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
                        }]
                    };
                } catch (error) {
                    return this._error(`Code execution error: ${error.message}`);
                }
            }
        );

        this.server.tool(
            "get-focus",
            {limit: z.number().default(10).describe("Max items")},
            async ({limit}) => {
                if (!this.nar) return this._error("NAR instance not available.");
                try {
                    const tasks = this.nar.focus ? this.nar.focus.getTasks(limit) : [];
                    return this._formatFocusReport(tasks, limit);
                } catch (error) {
                    return this._error(`Focus query error: ${error.message}`);
                }
            }
        );

        this.server.tool(
            "sync-beliefs",
            {
                since: z.number().default(0).describe("Timestamp to get modified beliefs since"),
                incoming: z.array(z.object({
                    term: z.string(),
                    truth: z.object({
                        frequency: z.number(),
                        confidence: z.number()
                    }),
                    source: z.string().optional()
                })).optional().describe("Incoming belief deltas to reconcile")
            },
            async ({since, incoming}) => {
                if (!this.nar) return this._error("NAR instance not available.");
                try {
                    const stats = {reconciled: 0, outgoing: 0};

                    // 1. Process Incoming
                    if (incoming && incoming.length > 0) {
                        for (const beliefData of incoming) {
                            const success = await this.nar.reconcile(beliefData);
                            if (success) stats.reconciled++;
                        }
                    }

                    // 2. Prepare Outgoing
                    const outgoing = this.nar.memory.getBeliefDeltas(since);
                    stats.outgoing = outgoing.length;

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                status: "success",
                                stats,
                                deltas: outgoing
                            }, null, 2)
                        }]
                    };
                } catch (error) {
                    return this._error(`Sync error: ${error.message}`);
                }
            }
        );

        this.server.tool(
            "metta-eval",
            {
                code: z.string().describe('MeTTa expression(s) to evaluate'),
                mode: z.enum(['run', 'load', 'query']).default('run'),
                pattern: z.string().optional().describe('Query pattern (for query mode)'),
                template: z.string().optional().describe('Result template (for query mode)')
            },
            async ({ code, mode, pattern, template }) => {
                const interp = this.mettaInterpreter;
                if (!interp) return this._error('MeTTa interpreter not attached. Pass {mettaInterpreter} to Server constructor.');
                try {
                    let result;
                    if (mode === 'load') {
                        interp.load(code);
                        result = 'loaded';
                    } else if (mode === 'query') {
                        const p = pattern || code;
                        const t = template || code;
                        result = interp.query(p, t);
                    } else {
                        result = interp.run(code);
                    }
                    return { content: [{ type: 'text', text: String(result) }] };
                } catch (e) {
                    return this._error(`MeTTa error: ${e.message}`);
                }
            }
        );
    }

    async start() {
        await this.server.connect(new StdioServerTransport());
        console.error("SeNARS MCP Server started on Stdio");
    }

    async stop() {
        await this.server.close();
    }

    _deduplicateTasks(tasks) {
        const unique = new Map();
        for (const task of tasks) {
            if (!task?.term) continue;
            const termStr = task.term.toString();
            // Retain highest confidence task for same term
            if (!unique.has(termStr) || (task.truth?.confidence > unique.get(termStr).truth?.confidence)) {
                unique.set(termStr, task);
            }
        }
        return Array.from(unique.values());
    }

    _formatReasoningReport(premises, goal, tasks) {
        const lines = ["### SeNARS Reasoning Trace"];
        lines.push(`**Input**: ${premises.length} premises${goal ? `, Goal: \`${goal}\`` : ""}`);
        lines.push("**Cycles Executed**: 10\n");

        if (tasks.length > 0) {
            lines.push("**Derived Conclusions**:");
            tasks.forEach((task, i) => lines.push(this._formatTaskLine(task, i + 1)));
        } else {
            lines.push("_No new conclusions derived in this window._");
        }

        return {content: [{type: "text", text: lines.join("\n")}]};
    }

    _formatMemoryReport(query, tasks, limit) {
        const lines = [`### Memory Query: \`${query}\``];
        lines.push(`Found ${tasks.length} results (limit: ${limit})\n`);
        tasks.forEach((task, i) => lines.push(this._formatTaskLine(task, i + 1)));
        return {content: [{type: "text", text: lines.join("\n")}]};
    }

    _formatFocusReport(tasks, limit) {
        const lines = ["### Focus Buffer"];
        lines.push(`Showing top ${tasks.length} items (limit: ${limit})\n`);
        tasks.forEach((task, i) => {
            const termStr = task.term ? task.term.toString() : 'unknown';
            const priority = task.budget ? task.budget.priority.toFixed(2) : "0.00";
            const typeStr = task.punctuation === '!' ? '[GOAL]' : task.punctuation === '?' ? '[QUESTION]' : '[BELIEF]';
            lines.push(`${i + 1}. **${typeStr}** \`${termStr}\` (p=${priority})`);
        });
        return {content: [{type: "text", text: lines.join("\n")}]};
    }

    _formatToolReport(toolName, result) {
        return {
            content: [{
                type: "text",
                text: `### Tool Execution: ${toolName}\n` +
                    `**Success**: ${result.success !== false}\n` +
                    `**Result**: \n\`\`\`json\n${JSON.stringify(result.result ?? result, null, 2)}\n\`\`\``
            }]
        };
    }

    _formatTaskLine(task, index) {
        const termStr = task.term ? task.term.toString() : 'unknown';
        const truthStr = task.truth ? `_{f=${task.truth.frequency.toFixed(2)}, c=${task.truth.confidence.toFixed(2)}}_` : "";
        const typeStr = task.punctuation === '!' ? '[GOAL]' : task.punctuation === '?' ? '[QUESTION]' : '[BELIEF]';
        return `${index}. **${typeStr}** \`${termStr}\` ${truthStr}`;
    }

    _error(message) {
        return {content: [{type: "text", text: message}], isError: true};
    }
}
