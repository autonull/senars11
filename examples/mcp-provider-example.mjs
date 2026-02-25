/**
 * Example: SeNARS providing MCP services (Use Case B)
 * 
 * This demonstrates how to start the SeNARS MCP server
 * that exposes reasoning capabilities to AI clients like Claude Desktop.
 */

import { Server } from '../agent/src/mcp/Server.js';
import { MeTTaInterpreter } from '../metta/src/MeTTaInterpreter.js';

async function exampleSeNARSProvidesMCP() {
  console.log('=== Use Case B: SeNARS Providing MCP Services ===\n');

  // Create the MeTTa interpreter
  const mettaInterpreter = new MeTTaInterpreter();

  // Create the MCP server with both NAR and MeTTa interpreter
  // Note: In a real scenario, you'd also pass a NAR instance
  const server = new Server({
    nar: null, // Replace with actual NAR instance if available
    mettaInterpreter: mettaInterpreter
  });

  console.log('SeNARS MCP Server created with tools:');
  console.log('  - ping: Health check');
  console.log('  - reason: Feed premises into NAL, run inference cycles');
  console.log('  - memory-query: Query concept memory');
  console.log('  - execute-tool: Invoke registered NAR tools');
  console.log('  - evaluate_js: Sandboxed JS execution');
  console.log('  - get-focus: Return top tasks from attention focus');
  console.log('  - sync-beliefs: Bidirectional belief reconciliation');
  console.log('  - metta-eval: Evaluate MeTTa expressions (NEW!)');

  console.log('\nTo start the server for Claude Desktop:');
  console.log('  node agent/src/mcp/start-server.js');
  
  console.log('\nClaude Desktop config (~/.config/Claude/claude_desktop_config.json):');
  console.log(JSON.stringify({
    mcpServers: {
      senars: {
        command: 'node',
        args: ['/absolute/path/to/senars10/agent/src/mcp/start-server.js']
      }
    }
  }, null, 2));

  console.log('\nExample Claude prompt:');
  console.log('  "Use the reason tool with premises:');
  console.log('   <bird --> animal>.');
  console.log('   <animal --> living_being>.');
  console.log('   to derive whether birds are living beings."');

  // Note: We don't start the server here since it would hijack stdio
  // await server.start();
}

exampleSeNARSProvidesMCP().catch(console.error);
