import { jest } from '@jest/globals';

// Import module under test
const { GuidanceOverlay } = await import('../../../src/utils/GuidanceOverlay.js');

describe('GuidanceOverlay', () => {
    let guidance;

    beforeEach(() => {
        document.body.innerHTML = '<div id="target" style="width:100px; height:100px;"></div>';
        guidance = new GuidanceOverlay();
    });

    test('should create overlay elements on initialization', () => {
        expect(document.getElementById('senars-guidance-overlay')).toBeTruthy();
        expect(document.getElementById('senars-guidance-tooltip')).toBeTruthy();
    });

    test('should highlight an element', () => {
        guidance.highlight('#target', 'Look here');

        const overlay = document.getElementById('senars-guidance-overlay');
        const tooltip = document.getElementById('senars-guidance-tooltip');

        expect(overlay.style.opacity).toBe('1');
        expect(tooltip.style.opacity).toBe('1');
        expect(tooltip.textContent).toBe('Look here');
    });

    test('should clear highlight', () => {
        guidance.highlight('#target');
        guidance.clear();

        const overlay = document.getElementById('senars-guidance-overlay');
        expect(overlay.style.opacity).toBe('0');
    });
});
