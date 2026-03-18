#!/usr/bin/env node

import {basename, dirname} from 'path';
import {ArgParser} from '../../core/src/util/ArgParser.js';
import {ToolSoftwareAnalyzer} from '../../core/src/tool/software/ToolSoftwareAnalyzer.js';
// Check if this script is being run directly (not imported)
import {fileURLToPath} from 'url';

// For integration with NAR system
let NAR = null;

// Try to import NAR if available (for integration scenarios)
try {
    // This import is optional and only used when integrated with the full system
} catch (e) {
    // NAR not available, which is fine for standalone operation
}

// Enhanced analyzer runner using the tool-based implementation
async function main() {
    const args = process.argv.slice(2);
    const options = ArgParser.parse(args);

    if (options.help) {
        console.log(ArgParser.getHelpMessage());
        return;
    }

    console.log('🔧 Using tool-based analyzer...');
    const analyzer = new ToolSoftwareAnalyzer(options);

    await analyzer.runAnalysis();

    // Output tool usage stats
    if (typeof analyzer.getToolUsageStats === 'function') {
        console.log('\n📈 Tool usage statistics:');
        const stats = analyzer.getToolUsageStats();
        for (const [toolName, data] of stats) {
            console.log(`  ${toolName}: executed ${data.count} times`);
        }
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (basename(__filename) === process.argv[1]?.split('/').pop()) {
    main().catch(err => {
        console.error('Analysis failed:', err);
        process.exit(1);
    });
}

// Export for potential module usage
export {ToolSoftwareAnalyzer};
