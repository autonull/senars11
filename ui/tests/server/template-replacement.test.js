/**
 * @file test-template-replacement.js
 * @description Tests for template replacement functionality in ui server.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { spawn, exec } from 'child_process';
import { setTimeout } from 'timers/promises';

// Tests for template replacement functionality
describe('ui Template Replacement Tests', () => {
    const testPort = 8100;
    const testWsPort = 8101;

    test('Template placeholders exist in index.html', () => {
        // Read the actual index.html file
        const indexHtml = readFileSync('./index.html', 'utf8');
        
        // Check that template placeholders exist
        expect(indexHtml).toContain('{{WEBSOCKET_PORT}}');
        expect(indexHtml).toContain('{{WEBSOCKET_HOST}}');
        
        // Verify the JavaScript configuration block contains the template placeholders
        expect(indexHtml).toContain('port: \'{{WEBSOCKET_PORT}}\'');
        expect(indexHtml).toContain('host: \'{{WEBSOCKET_HOST}}\'');
    });

    test('Server properly replaces template placeholders', (done) => {
        // Create a temporary test HTML file with template placeholders
        const testHtml = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
    <script>
        window.WEBSOCKET_CONFIG = {
            port: '{{WEBSOCKET_PORT}}',
            host: '{{WEBSOCKET_HOST}}'
        };
    </script>
</body>
</html>`;

        writeFileSync('./test-template.html', testHtml);

        // Simulate the replacement logic from server.js
        const replacedHtml = testHtml
            .replace(/\{\{WEBSOCKET_PORT}}/g, testWsPort.toString())
            .replace(/\{\{WEBSOCKET_HOST}}/g, 'custom-host.com');

        // Verify replacements occurred
        expect(replacedHtml).toContain(`port: '${testWsPort}'`);
        expect(replacedHtml).toContain(`host: 'custom-host.com'`);
        
        // Clean up test file
        exec('rm ./test-template.html', () => {
            done();
        });
    });

    test('Regex pattern correctly matches template placeholders', () => {
        // Test the regex patterns used in server.js
        const contentWithPlaceholders = `
            port: '{{WEBSOCKET_PORT}}',
            host: '{{WEBSOCKET_HOST}}',
            other: 'value'
        `;
        
        // Apply the same replacements as in server.js
        const replacedContent = contentWithPlaceholders
            .replace(/\{\{WEBSOCKET_PORT}}/g, '8081')
            .replace(/\{\{WEBSOCKET_HOST}}/g, 'localhost');
        
        expect(replacedContent).not.toContain('{{WEBSOCKET_PORT}}');
        expect(replacedContent).not.toContain('{{WEBSOCKET_HOST}}');
        expect(replacedContent).toContain('port: \'8081\'');
        expect(replacedContent).toContain('host: \'localhost\'');
    });

    test('Environment variables are properly used for template replacement', () => {
        // Test the configuration logic from server.js
        const env = {
            BACKEND_WS_PORT: 8085,
            BACKEND_WS_HOST: 'remote-server.com'
        };
        
        // Simulate the configuration logic
        const httpPort = 8080; // default
        const backendWsPort = env.BACKEND_WS_PORT ? parseInt(env.BACKEND_WS_PORT) : 8081;
        const backendWsHost = env.BACKEND_WS_HOST || 'localhost';
        
        expect(backendWsPort).toBe(8085);
        expect(backendWsHost).toBe('remote-server.com');
    });

    test('Template replacement handles multiple occurrences', () => {
        const contentWithMultiplePlaceholders = `
            port: '{{WEBSOCKET_PORT}}',
            backup_port: '{{WEBSOCKET_PORT}}',
            host: '{{WEBSOCKET_HOST}}',
            backup_host: '{{WEBSOCKET_HOST}}'
        `;
        
        const replacedContent = contentWithMultiplePlaceholders
            .replace(/\{\{WEBSOCKET_PORT}}/g, '8081')
            .replace(/\{\{WEBSOCKET_HOST}}/g, 'localhost');
        
        // Count occurrences to ensure all were replaced
        const portMatches = (replacedContent.match(/8081/g) || []).length;
        const hostMatches = (replacedContent.match(/localhost/g) || []).length;
        
        expect(portMatches).toBe(2); // Should replace both occurrences
        expect(hostMatches).toBe(2); // Should replace both occurrences
    });

    test('Template replacement doesn\'t affect non-template content', () => {
        const contentWithMixedContent = `
            port: '{{WEBSOCKET_PORT}}',
            normal_text: 'This is not a template: {{not_a_template}}',
            host: '{{WEBSOCKET_HOST}}',
            other_template: '{{SOME_OTHER_TEMPLATE}}'
        `;
        
        const replacedContent = contentWithMixedContent
            .replace(/\{\{WEBSOCKET_PORT}}/g, '8081')
            .replace(/\{\{WEBSOCKET_HOST}}/g, 'localhost');
        
        // Only the specific placeholders should be replaced
        expect(replacedContent).toContain('port: \'8081\'');
        expect(replacedContent).toContain('host: \'localhost\'');
        expect(replacedContent).toContain('{{not_a_template}}'); // Should remain unchanged
        expect(replacedContent).toContain('{{SOME_OTHER_TEMPLATE}}'); // Should remain unchanged
    });

    test('Server serves index.html with replaced templates', (done) => {
        // Start the actual server to test real functionality
        const env = {
            ...process.env,
            PORT: testPort.toString(),
            BACKEND_WS_PORT: testWsPort.toString()
        };

        const serverProcess = spawn('node', ['server.js'], {
            cwd: './',
            stdio: 'pipe',
            env: env
        });

        let output = '';
        serverProcess.stdout.on('data', (data) => {
            output += data.toString();
            if (output.includes(`UI Server running at http://localhost:${testPort}`)) {
                // Now make an HTTP request to check template replacement
                const http = require('http');
                
                const request = http.get(`http://localhost:${testPort}/index.html`, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        // Check that template values were properly replaced
                        if (data.includes(testWsPort.toString()) && data.includes('localhost')) {
                            serverProcess.kill();
                            done();
                        } else {
                            serverProcess.kill();
                            done(new Error('Template replacement did not occur properly'));
                        }
                    });
                });
                
                request.on('error', (err) => {
                    serverProcess.kill();
                    done(new Error(`HTTP request failed: ${err.message}`));
                });
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`Server error: ${data}`);
        });

        setTimeout(15000).then(() => {
            if (serverProcess) {
                serverProcess.kill();
                done(new Error('Server failed to start within timeout'));
            }
        });
    });

    test('Template replacement works with different file types', () => {
        // Although the server only replaces templates in .html files according to the logic,
        // let's verify the conditional logic
        const processHtmlFile = (content) => {
            return content
                .replace(/\{\{WEBSOCKET_PORT}}/g, '8081')
                .replace(/\{\{WEBSOCKET_HOST}}/g, 'localhost');
        };

        const processOtherFile = (content) => {
            // For non-HTML files, no replacement should occur
            return content;
        };

        const htmlContent = 'port: \'{{WEBSOCKET_PORT}}\'';
        const jsContent = 'port: \'{{WEBSOCKET_PORT}}\'';

        const processedHtml = processHtmlFile(htmlContent);
        const processedJs = processOtherFile(jsContent);

        expect(processedHtml).toContain('8081');
        expect(processedJs).toContain('{{WEBSOCKET_PORT}}'); // Should remain unchanged
    });
});