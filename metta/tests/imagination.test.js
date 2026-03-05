import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MeTTaInterpreter } from '../src/MeTTaInterpreter.js';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ImaginationExtension (Mind Eye)', () => {
    let interp;
    const testDir = path.resolve(__dirname, 'test_output_imagination');

    beforeEach(() => {
        interp = new MeTTaInterpreter();
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    it('should create a canvas and save an image', () => {
        const imagePath = path.join(testDir, 'test_image.png');

        interp.run(`
            !(canvas-create 200 200)
            !(set-color "red")
            !(draw-rect 50 50 100 100)
            !(set-color "blue")
            !(draw-circle 100 100 25)
            !(save-image "${imagePath}")
        `);

        expect(fs.existsSync(imagePath)).toBe(true);
        const stats = fs.statSync(imagePath);
        expect(stats.size).toBeGreaterThan(0);
    });

    it('should create a key-framed video sequence (GIF)', async () => {
        const videoPath = path.join(testDir, 'test_video.gif');

        interp.run(`
            !(canvas-create 100 100)
            !(video-start "${videoPath}" 100 0)

            ;; Frame 1
            !(set-color "white")
            !(draw-rect 0 0 100 100)
            !(set-color "red")
            !(draw-circle 50 50 20)
            !(video-add-frame)

            ;; Frame 2
            !(set-color "white")
            !(draw-rect 0 0 100 100)
            !(set-color "green")
            !(draw-circle 50 50 30)
            !(video-add-frame)

            ;; Frame 3
            !(set-color "white")
            !(draw-rect 0 0 100 100)
            !(set-color "blue")
            !(draw-circle 50 50 40)
            !(video-add-frame)

            !(video-finish)
        `);

        // Wait a small amount for the stream to flush before we check file size
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(fs.existsSync(videoPath)).toBe(true);
        const stats = fs.statSync(videoPath);
        expect(stats.size).toBeGreaterThan(0);
    });
});
