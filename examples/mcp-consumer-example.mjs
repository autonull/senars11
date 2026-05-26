/**
 * Example: MeTTa using MCP tools (Use Case A)
 * 
 * This demonstrates how MeTTa can discover and use MCP tools
 * via JS reflection and the mcp-std.metta standard library.
 */

import { MeTTaInterpreter } from '../metta/src/index.js';
import { MeTTaMCPManager } from '../metta/src/mcp/index.js';

async function exampleMeTTaConsumesMCP() {
  console.log('=== Use Case A: MeTTa Consuming MCP Tools ===\n');

  const interp = new MeTTaInterpreter();
  const mcp = new MeTTaMCPManager(interp);

  // Define reasoning patterns in MeTTa
  interp.run(`
    ;; Tool selection strategy
    (= (can-answer-query ?q)
       (if (tool-available "read_file")
           (mcp-call "fs" "read_file" (object (: path "/tmp/data.txt")))
           "No file tool available"))

    ;; Safe conditional execution
    (= (safe-search $q)
       (if (tool-available "brave_search")
           (mcp-call "search" "brave_search" (object (: query $q)))
           "Fallback: no search available"))

    ;; Compose tool results
    (= (summarize-file $path)
       (let* (($content (mcp-call "fs" "read_file" (object (: path $path))))
              ($summary (string-append "File content: " $content)))
         $summary))
  `);

  console.log('Reasoning patterns loaded.');
  console.log('To connect to actual MCP servers, uncomment the connect calls:');
  console.log('  await mcp.connect("fs", "npx", ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"])');
  console.log('  await mcp.connect("search", "npx", ["-y", "@modelcontextprotocol/server-brave-search"])');
  
  // Example: Check what tools are available
  const availableTools = interp.query('(tool-available $name)', '(tool-available $name)');
  console.log('\nCurrently known tools:', availableTools.length);

  await mcp.disconnect();
}

exampleMeTTaConsumesMCP().catch(console.error);
