import {NAR} from '@senars/nar';

describe('NAR - Basic Functionality', () => {
    let nar;

    beforeEach(async () => {
        nar = new NAR();
        await nar.initialize();
    });

    afterEach(async () => {
        await nar.dispose();
    });

    test.each([
        ['atomic', 'cat.', t => t.includes('cat')],
        ['spaced compound', '(cat --> dog).', t => t.includes('-->')],
        ['tight compound', '(cat-->dog).', t => t.includes('-->')]
    ])('handle %s terms', async (_, input, check) => {
        expect(await nar.input(input)).toBe(true);
        const beliefs = nar.getBeliefs();
        expect(beliefs.length).toBeGreaterThan(0);
        expect(check(beliefs[0].term.toString())).toBe(true);
    });

    test('handle invalid input', async () => {
        await expect(nar.input('invalid input')).rejects.toThrow(/Input processing failed/);
    });
});
