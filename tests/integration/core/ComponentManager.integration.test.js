import {NAR} from '@senars/nar';

describe('ComponentManager Integration', () => {
    it('should dynamically load components from config', async () => {
        const config = {
            components: {
                focus: {
                    enabled: true,
                    path: 'memory/Focus.js',
                    class: 'Focus',
                    dependencies: [],
                    config: {capacity: 100}  // Example config
                },
            },
        };

        const nar = new NAR(config);

        const focusComponent = nar.componentManager.getComponent('focus');
        expect(focusComponent).toBeDefined();
        expect(focusComponent.isInitialized !== undefined).toBe(true); // Check that component was loaded

        await nar.dispose();
    });
});
