import {NAR} from '@senars/nar';

async function test() {
    const nar = new NAR();

    try {
        console.log('Testing basic case that should work...');
        await nar.input('cat.');
        console.log('✓ Basic case works');
    } catch (e) {
        console.log('✗ Basic case failed:', e.message);
        return;
    }

    try {
        console.log('Testing spaced compound that works...');
        await nar.input('(cat --> dog).');
        console.log('✓ Spaced compound works');
    } catch (e) {
        console.log('✗ Spaced compound failed:', e.message);
        return;
    }

    try {
        console.log('Testing tight compound that should work...');
        await Promise.race([
            nar.input('(cat-->dog).'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        console.log('✓ Tight compound works');
    } catch (e) {
        console.log('✗ Tight compound failed:', e.message);

    }
}

test().catch(err => console.error('Test error:', err.message));