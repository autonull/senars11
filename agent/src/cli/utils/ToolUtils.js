/**
 * @file ToolUtils.js
 * @description Utility functions and classes for agent tools
 */

import {z} from "zod";
import {DynamicTool, tool} from "@langchain/core/tools";
import {NARControlTool} from '../../tool/NARControlTool.js';

/**
 * Creates a weather tool for the agent
 * @returns {Tool} Weather tool instance
 */
export const createWeatherTool = () => {
    return tool(async ({location}) => {
        // Simulate API call
        await new Promise(r => setTimeout(r, 500));
        return `Sunny, 22°C in ${location}`;
    }, {
        name: "get_weather",
        description: "Get current weather for a location",
        schema: z.object({
            location: z.string().describe("City name"),
        }),
    });
};

// SeNARS-specific tool for NAR control
export class SeNARSControlTool extends DynamicTool {
    constructor(nar = null) {
        super({
            name: "nar_control",
            description: "Control and interact with the SeNARS reasoning system. You can specify action and content, or provide an input command like 'get_beliefs', 'add_belief <content>', etc.",
            func: async (rawArgs) => {
                if (!nar) {
                    const errorResult = {error: "NAR system not initialized"};
                    console.error('NAR system error:', errorResult.error);
                    return JSON.stringify(errorResult);
                }

                try {
                    // Process the arguments to ensure they match the expected NARControlTool format
                    const processedArgs = parseNARControlArgs(rawArgs);

                    // Execute the tool using our existing NARControlTool
                    const narTool = new NARControlTool(nar);
                    const result = await narTool.execute(processedArgs);
                    return JSON.stringify(result);
                } catch (error) {
                    const errorResult = {error: error.message};
                    console.error('Error in SeNARSControlTool:', error);
                    return JSON.stringify(errorResult);
                }
            },
            schema: z.union([
                // Expected schema
                z.object({
                    action: z.enum(["add_belief", "add_goal", "query", "step", "get_beliefs", "get_goals"])
                        .describe("The action to perform on the NAR system"),
                    content: z.string().optional().describe("Narsese content for the action"),
                }),
                // Model's likely format
                z.object({
                    input: z.string().describe("Single command like 'get_beliefs', 'add_belief <content>', etc."),
                })
            ]),
        });

        this.nar = nar;
    }
}

/**
 * Creates a SeNARSControlTool instance
 * @param {Object} nar - NAR instance
 * @returns {SeNARSControlTool} SeNARSControlTool instance
 */
export const createSeNARSControlTool = (nar = null) => {
    return new SeNARSControlTool(nar);
};

/**
 * Gets the default tool definitions with factories
 * @returns {Array} Array of tool definitions
 */
export const getDefaultToolDefinitions = () => [
    {name: 'weather', factory: createWeatherTool},
    {name: 'nar_control', factory: createSeNARSControlTool}
];

/**
 * Parses raw arguments for NAR control tool
 * @returns {object} Processed arguments with action and content
 * @param input
 */
const parseNARCommand = (input) => {
    const lowerInput = input.toLowerCase().trim();

    // Handle actions based on keywords - check more specific patterns first to avoid conflicts
    if (lowerInput.includes('get_beliefs') || lowerInput.includes('get beliefs')) {
        return {action: 'get_beliefs', content: ''};
    } else if (lowerInput.includes('get_goals') || lowerInput.includes('get goals')) {
        return {action: 'get_goals', content: ''};
    } else if (lowerInput.includes('step') || lowerInput.includes('cycle') || lowerInput.includes('run')) {
        return {action: 'step', content: ''};
    } else if (lowerInput.includes('add_goal') || lowerInput.includes('add goal')) {
        // Extract content after the add command, supporting full Narsese syntax
        const cleaned = input.replace(/^(add_goal|add goal|add)\s*/i, '').trim();
        // If it doesn't end with '!' and is meant to be a goal, add the exclamation mark
        let content = cleaned;
        if (content && !content.endsWith('!')) {
            // Check if already has punctuation, replace if needed
            if (!['.', '!', '?'].includes(content.slice(-1))) {
                content += '!';
            }
        }
        return {action: 'add_goal', content};
    } else if (lowerInput.includes('add_belief') || lowerInput.includes('add belief')) {
        // Extract content after the add command, supporting full Narsese syntax
        const cleaned = input.replace(/^(add_belief|add belief|add)\s*/i, '').trim();
        // If it doesn't end with '.' and is meant to be a belief, add the period
        let content = cleaned;
        if (content && !content.endsWith('.')) {
            // Check if already has punctuation, replace if needed
            if (!['.', '!', '?'].includes(content.slice(-1))) {
                content += '.';
            }
        }
        return {action: 'add_belief', content};
    } else if (lowerInput.includes('query') || lowerInput.includes('what') || lowerInput.includes('show')) {
        const content = input.replace(/^(query|show|what\s+is\s*)\s*/i, '').trim();
        return {action: 'query', content};
    } else {
        // Default fallback - check if input looks like a Narsese statement and determine action from punctuation
        if (input.includes('!')) {
            // Goal statement
            return {action: 'add_goal', content: input.trim()};
        } else if (input.includes('?')) {
            // Question/query statement
            return {action: 'query', content: input.trim()};
        } else if (input.includes('.') || input.includes('-->') || input.includes('<->')) {
            // Belief statement (contains typical belief punctuation or relation symbols)
            let content = input.trim();
            if (!content.endsWith('.')) {
                if (!['.', '!', '?'].includes(content.slice(-1))) {
                    content += '.';
                }
            }
            return {action: 'add_belief', content};
        } else {
            // Default fallback - treat as query
            return {action: 'query', content: input};
        }
    }
};

const parseNARControlArgs = (rawArgs) => {
    // Handle different possible input formats
    if (typeof rawArgs === 'string') {
        // If args is just a string (unexpected but possible)
        const input = rawArgs.toLowerCase().trim();
        switch (input) {
            case 'get_beliefs':
                return {action: 'get_beliefs', content: ''};
            case 'get_goals':
                return {action: 'get_goals', content: ''};
            case 'step':
                return {action: 'step', content: ''};
            default:
                return {action: 'query', content: input};
        }
    } else if (typeof rawArgs === 'object') {
        if (rawArgs.action) {
            // If action is directly provided (the schema-compliant way)
            return rawArgs;
        } else if (rawArgs.input) {
            // If input is provided (the model's preferred way), parse it
            return parseNARCommand(rawArgs.input);
        } else {
            throw new Error("Invalid arguments: object must have 'action' or 'input' field");
        }
    } else {
        throw new Error("Invalid arguments: expected object or string");
    }
};
export {parseNARCommand};
