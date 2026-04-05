import {z} from 'zod';

export class ToolAdapter {
    static toAISDK(tool, type) {
        if (type === 'websearch') {
            return {
                name: 'web_search',
                description: 'Search the web for information.',
                parameters: z.object({query: z.string().describe('The search query')}),
                execute: async ({query}) => tool.search(query)
            };
        }
        if (type === 'file') {
            return {
                read_file: {
                    name: 'read_file',
                    description: 'Read contents of a file from the workspace.',
                    parameters: z.object({path: z.string().describe('Relative path to the file')}),
                    execute: async ({path}) => tool.readFile(path) || 'File not found'
                },
                write_file: {
                    name: 'write_file',
                    description: 'Write content to a file in the workspace.',
                    parameters: z.object({
                        path: z.string().describe('Relative path to the file'),
                        content: z.string().describe('Content to write')
                    }),
                    execute: async ({path, content}) => tool.writeFile(path, content) ? 'Success' : 'Failed'
                }
            };
        }
    }
}
