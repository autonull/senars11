import { ExplorerApp } from './ExplorerApp.js';

console.log('[SeNARS Explorer] Booting...');

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const app = new ExplorerApp();
        window.Explorer = app; // For debugging
        await app.initialize();
        console.log('[SeNARS Explorer] Ready');
    } catch (e) {
        console.error('[SeNARS Explorer] Failed to initialize:', e);
    }
});
