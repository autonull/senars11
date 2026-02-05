import {fileURLToPath} from 'url';
import {basename, dirname} from 'path';
import {SoftwareAnalyzer} from './SoftwareAnalyzer.js';
import {ArgParser} from '../../../util/ArgParser.js';

/**
 * Module to handle the main execution flow of the self-analyzer
 */
export class AnalyzerRunner {
    static async run() {
        const args = process.argv.slice(2);
        const options = ArgParser.parse(args);

        if (options.help) {
            process.stdout.write(ArgParser.getHelpMessage() + '\n');
            return;
        }

        const analyzer = new SoftwareAnalyzer(options);
        await analyzer.runAnalysis();
    }

    static async runIfMain(importMetaUrl) {
        const __filename = fileURLToPath(importMetaUrl);
        const __dirname = dirname(__filename);

        if (basename(__filename) === process.argv[1]?.split('/').pop()) {
            try {
                await this.run();
            } catch (err) {
                console.error('Analysis failed:', err);
                process.exit(1);
            }
        }
    }
}