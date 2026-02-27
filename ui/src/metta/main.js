import { MettaApp } from './MettaApp.js';

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const app = new MettaApp();
        window.Metta = app;
        await app.initialize();
    } catch (e) {
        // Initialization errors are handled by the app's error reporting
    }
});
