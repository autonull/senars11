import { MettaApp } from './MettaApp.js';

console.log('[SeNARS MeTTa] Booting...');

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const app = new MettaApp();
        window.Metta = app; // For debugging
        await app.initialize();
        console.log('[SeNARS MeTTa] Ready');
    } catch (e) {
        console.error('[SeNARS MeTTa] Failed to initialize:', e);
    }
});
