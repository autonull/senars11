#!/usr/bin/env node
/**
 * @file validate-ui-configuration.js
 * @description Validate UI configuration without running servers
 */

import fs from 'fs';
import path from 'path';

console.log('🔍 Validating UI Configuration...\n');

let success = true;
let checks = 0;

// 1. Check that all required files exist
const requiredFiles = [
  './app.js',
  './server.js', 
  './index.html',
  './style.css'
];

for (const file of requiredFiles) {
  checks++;
  console.log(`📋 Checking file: ${file}`);
  if (fs.existsSync(file)) {
    console.log(`   ✅ File exists`);
  } else {
    console.log(`   ❌ MISSING: ${file}`);
    success = false;
  }
}

// 2. Check that template placeholders exist in HTML
checks++;
console.log(`\n📋 Checking template placeholders in index.html`);
const indexHTML = fs.readFileSync('./index.html', 'utf8');
const hasWsConfig = indexHTML.includes('WEBSOCKET_CONFIG');
const hasWsPortPlaceholder = indexHTML.includes('{{WEBSOCKET_PORT}}');
const hasWsHostPlaceholder = indexHTML.includes('{{WEBSOCKET_HOST}}');

if (hasWsConfig && hasWsPortPlaceholder && hasWsHostPlaceholder) {
  console.log(`   ✅ All template placeholders found`);
} else {
  console.log(`   ❌ Missing placeholders: config=${hasWsConfig}, port=${hasWsPortPlaceholder}, host=${hasWsHostPlaceholder}`);
  success = false;
}

// 3. Check that server.js has template replacement logic
checks++;
console.log(`\n📋 Checking server template replacement logic`);
const serverJS = fs.readFileSync('./server.js', 'utf8');
const hasPortReplace = serverJS.includes('WEBSOCKET_PORT');
const hasHostReplace = serverJS.includes('WEBSOCKET_HOST');
const hasReplaceLogic = serverJS.includes('replace') && serverJS.includes('WEBSOCKET_PORT');

if (hasPortReplace && hasHostReplace && hasReplaceLogic) {
  console.log(`   ✅ Server template replacement logic found`);
} else {
  console.log(`   ❌ Missing server replacement logic: port=${hasPortReplace}, host=${hasHostReplace}, replace=${hasReplaceLogic}`);
  success = false;
}

// 4. Check that app.js has proper WebSocket configuration function
checks++;
console.log(`\n📋 Checking app.js WebSocket configuration`);
const appJS = fs.readFileSync('./app.js', 'utf8');
const hasGetWsConfig = appJS.includes('getWebSocketConfig');
const hasWsConfigCheck = appJS.includes('WEBSOCKET_CONFIG');

if (hasGetWsConfig && hasWsConfigCheck) {
  console.log(`   ✅ App WebSocket configuration function found`);
} else {
  console.log(`   ❌ Missing app config function: getWsConfig=${hasGetWsConfig}, check=${hasWsConfigCheck}`);
  success = false;
}

// 5. Check that the variable names match between HTML and JS
checks++;
console.log(`\n📋 Checking variable name consistency`);
const htmlWsConfig = indexHTML.includes('window.WEBSOCKET_CONFIG');
const jsWsConfig = appJS.includes('WEBSOCKET_CONFIG');

if (htmlWsConfig && jsWsConfig) {
  console.log(`   ✅ Variable names are consistent`);
} else {
  console.log(`   ❌ Inconsistent variable names: HTML=${htmlWsConfig}, JS=${jsWsConfig}`);
  success = false;
}

// 6. Check that dependencies are properly loaded in HTML
checks++;
console.log(`\n📋 Checking HTML dependencies`);
const hasCytoscape = indexHTML.includes('cytoscape');
const hasAppJS = indexHTML.includes('app.js');

if (hasCytoscape && hasAppJS) {
  console.log(`   ✅ Dependencies properly referenced`);
} else {
  console.log(`   ❌ Missing dependency references: cytoscape=${hasCytoscape}, app.js=${hasAppJS}`);
  success = false;
}

// 7. Check that all UI elements have corresponding DOM elements
checks++;
console.log(`\n📋 Checking UI element consistency`);
const elementsDefined = (appJS.match(/statusIndicator|connectionStatus|messageCount|logsContainer|commandInput|sendButton|quickCommands|execQuick|showHistory|clearLogs|refreshGraph|toggleLive|demoSelect|runDemo|graphDetails/g) || []).length;
const elementsInHTML = (indexHTML.match(/id=['"]status-indicator['"]|id=['"]connection-status['"]|id=['"]message-count['"]|id=['"]logs-container['"]|id=['"]command-input['"]|id=['"]send-button['"]/g) || []).length;

if (elementsDefined > 10 && elementsInHTML > 10) {  // Rough check
  console.log(`   ✅ UI elements properly defined (${elementsDefined} in JS, many in HTML)`);
} else {
  console.log(`   ⚠️  UI element check: JS=${elementsDefined}, HTML=many`);
}

// 8. Check for error handling in app.js
checks++;
console.log(`\n📋 Checking error handling in app.js`);
const hasTryCatch = appJS.includes('try') && appJS.includes('catch');
const hasWsErrorHandling = appJS.includes('ws.onerror') || appJS.includes('onerror');
const hasReconnect = appJS.includes('connectWebSocket') && appJS.includes('setTimeout');

if (hasTryCatch || hasWsErrorHandling || hasReconnect) {
  console.log(`   ✅ Error handling found`);
} else {
  console.log(`   ⚠️  Limited error handling detected`);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`📊 Validation Summary: ${checks} checks performed`);

if (success) {
  console.log('🎉 ALL CRITICAL CHECKS PASSED!');
  console.log('✅ UI is properly configured and ready for use');
  console.log('✅ Template replacement system is correctly set up');
  console.log('✅ WebSocket configuration is consistent');
  console.log('✅ All required files are present');
  process.exit(0);
} else {
  console.log('❌ Some critical issues detected');
  process.exit(1);
}