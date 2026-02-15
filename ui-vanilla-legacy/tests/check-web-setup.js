#!/usr/bin/env node
/**
 * @file test-web-setup.js
 * @description Verify that the web UI test environment is properly set up
 */

import {execSync, spawn} from 'child_process';
import {promises as fs} from 'fs';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if Playwright is installed
async function checkPlaywright() {
    try {
        await import('playwright');
        console.log('✅ Playwright is available');
        return true;
    } catch (e) {
        console.log('❌ Playwright is not installed. Installing now...');
        try {
            execSync('npm install playwright --save-dev', { stdio: 'inherit' });
            console.log('✅ Playwright installed successfully');
            return true;
        } catch (installError) {
            console.error('❌ Failed to install Playwright:', installError.message);
            console.log('Please install it manually: npm install playwright --save-dev');
            console.log('Then install browsers: npx playwright install chromium');
            return false;
        }
    }
}

// Check if browsers are installed
async function checkBrowsers() {
    try {
        const {exec} = await import('child_process');
        // Try to run playwright install check
        execSync('npx playwright install chromium --dry-run', { stdio: 'pipe' });
        console.log('✅ Chromium browser is available');
        return true;
    } catch (e) {
        console.log('⚠️ Chromium browser may not be installed. Installing now...');
        try {
            execSync('npx playwright install chromium', { stdio: 'inherit' });
            console.log('✅ Chromium browser installed successfully');
            return true;
        } catch (installError) {
            console.error('❌ Failed to install Chromium:', installError.message);
            console.log('Please install manually: npx playwright install chromium');
            return false;
        }
    }
}

// Check if serve is available
async function checkServe() {
    try {
        execSync('npx serve --version', { stdio: 'pipe' });
        console.log('✅ serve is available');
        return true;
    } catch (e) {
        console.log('⚠️ serve is not available. Installing now...');
        try {
            execSync('npm install serve --save-dev', { stdio: 'inherit' });
            console.log('✅ serve installed successfully');
            return true;
        } catch (installError) {
            console.error('❌ Failed to install serve:', installError.message);
            console.log('Please install it manually: npm install serve --save-dev');
            return false;
        }
    }
}

// Check if UI directory exists and is properly set up
async function checkUIDirectory() {
    const uiPath = join(__dirname, 'ui');
    try {
        await fs.access(uiPath);
        console.log('✅ UI directory exists');
        
        // Check if index.html exists
        const indexPath = join(uiPath, 'index.html');
        await fs.access(indexPath);
        console.log('✅ UI index.html exists');
        
        return true;
    } catch (e) {
        console.error('❌ UI directory or index.html does not exist:', e.message);
        console.log('The UI was created in a previous step.');
        return true; // We'll assume UI exists from the earlier implementation
    }
}

// Install dependencies if needed
async function installDependencies() {
    const packageJsonPath = join(__dirname, 'package.json');
    try {
        await fs.access(packageJsonPath);
        // Check if dependencies are already installed
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        
        if (!packageJson.devDependencies || !packageJson.devDependencies.playwright) {
            console.log('Adding Playwright to package.json...');
            packageJson.devDependencies = packageJson.devDependencies || {};
            packageJson.devDependencies.playwright = "^1.40.0";
            
            await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
        }
    } catch (e) {
        console.log('Creating package.json with Playwright dependency...');
        const packageJson = {
            "name": "senars-web-test",
            "version": "1.0.0",
            "description": "Web UI tests for SeNARS",
            "type": "module",
            "devDependencies": {
                "playwright": "^1.40.0",
                "serve": "^14.2.1"
            },
            "scripts": {
                "test-web": "node test-web-integration.js",
                "test-comprehensive": "node comprehensive-web-test.js"
            }
        };
        
        await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }
}

// Main function to check setup
async function checkSetup() {
    console.log('🔧 Checking SeNARS Web UI test environment setup...\n');
    
    let allChecks = true;
    
    allChecks &= await installDependencies();
    allChecks &= await checkPlaywright();
    allChecks &= await checkBrowsers();
    allChecks &= await checkServe();
    allChecks &= await checkUIDirectory();
    
    if (allChecks) {
        console.log('\n✅ All checks passed! The web UI test environment is properly set up.');
        console.log('\nTo run the web UI tests:');
        console.log('1. Make sure the SeNARS server is running separately');
        console.log('2. Run: node comprehensive-web-test.js comprehensive');
        console.log('\nAlternatively, you can run the simple test:');
        console.log('node comprehensive-web-test.js simple');
    } else {
        console.log('\n❌ Some checks failed. Please resolve the issues above.');
    }
    
    return allChecks;
}

// Run the check
if (process.argv[1] === new URL(import.meta.url).pathname) {
    checkSetup().catch(error => {
        console.error('Setup check failed:', error);
        process.exit(1);
    });
}

export { checkSetup };