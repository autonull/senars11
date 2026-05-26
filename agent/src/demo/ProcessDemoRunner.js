import {spawn} from 'child_process';

// Regex to strip ANSI escape codes
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

export class ProcessDemoRunner {
    constructor() {
        this.process = null;
    }

    /**
     * Start a Node.js script as a child process
     * @param {string} scriptPath - Absolute path to the script
     * @param {function} onOutput - Callback for output (text, type)
     * @param {function} onExit - Callback for process exit (code)
     */
    start(scriptPath, onOutput, onExit) {
        if (this.process) {
            this.stop();
        }

        // Ensure we run from project root
        const cwd = process.cwd();

        this.process = spawn('node', [scriptPath], {
            cwd: cwd,
            env: {...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1'},
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.process.stdout.on('data', (data) => {
            const text = data.toString();
            // Strip ANSI codes for clean UI output
            const cleanText = text.replace(ANSI_REGEX, '');
            onOutput(cleanText, 'info');
        });

        this.process.stderr.on('data', (data) => {
            const text = data.toString();
            const cleanText = text.replace(ANSI_REGEX, '');
            onOutput(cleanText, 'error');
        });

        this.process.on('close', (code) => {
            if (onExit) {
                onExit(code);
            }
            this.process = null;
        });

        this.process.on('error', (err) => {
            onOutput(`Failed to start process: ${err.message}`, 'error');
            if (onExit) {
                onExit(1);
            }
            this.process = null;
        });

        return true;
    }

    stop() {
        if (this.process) {
            // Kill the process and its children (if any)
            this.process.kill();
            this.process = null;
        }
    }

    input(text) {
        if (this.process && this.process.stdin) {
            this.process.stdin.write(`${text}\n`);
        }
    }
}
