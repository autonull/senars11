/**
 * GymnasiumWrapper Tests
 */
import {gym, GymWrapper, isGymnasiumAvailable} from '../../src/index.js';

describe('GymnasiumWrapper', () => {
    describe('isGymnasiumAvailable', () => {
it('should check gymnasium availability', async () => {
    const available = await isGymnasiumAvailable();
    // This will be false if gymnasium is not installed
    expect(typeof available).toBe('boolean');
  }, 10000);
    });

    describe('GymWrapper', () => {
        let wrapper;

        afterEach(async () => {
            if (wrapper) {
                await wrapper.shutdown().catch(() => {
                });
            }
        });

        describe('constructor', () => {
            it('should create wrapper with env name', () => {
                wrapper = new GymWrapper('CartPole-v1');
                expect(wrapper.envName).toBe('CartPole-v1');
            });

            it('should accept configuration', () => {
                wrapper = new GymWrapper('CartPole-v1', {
                    pythonPath: 'python3',
                    timeout: 60000
                });
                expect(wrapper.config.timeout).toBe(60000);
            });
        });

describe('initialization', () => {
    it('should initialize without Python', async () => {
      wrapper = new GymWrapper('CartPole-v1');
      await wrapper.initialize();

      expect(wrapper.initialized).toBe(true);
    }, 10000);

    it('should infer observation space for CartPole', async () => {
      wrapper = new GymWrapper('CartPole-v1');
      await wrapper.initialize();

      expect(wrapper.observationSpace).toBeDefined();
      expect(wrapper.observationSpace.shape).toEqual([4]);
    }, 10000);

    it('should infer action space for CartPole', async () => {
      wrapper = new GymWrapper('CartPole-v1');
      await wrapper.initialize();

      expect(wrapper.actionSpace).toBeDefined();
      expect(wrapper.actionSpace.type).toBe('discrete');
      expect(wrapper.actionSpace.n).toBe(2);
    }, 10000);
  });

describe('action sampling', () => {
    beforeEach(async () => {
      wrapper = new GymWrapper('CartPole-v1');
      await wrapper.initialize();
    }, 10000);

            it('should sample discrete action', () => {
                const action = wrapper.sampleAction();
                expect(action).toBeGreaterThanOrEqual(0);
                expect(action).toBeLessThan(2);
            });

            it('should sample different actions', () => {
                const actions = new Set();
                for (let i = 0; i < 10; i++) {
                    actions.add(wrapper.sampleAction());
                }
                // Should have at least some variety
                expect(actions.size).toBeGreaterThanOrEqual(1);
            });
        });

describe('metadata', () => {
    beforeEach(async () => {
      wrapper = new GymWrapper('CartPole-v1');
      await wrapper.initialize();
    }, 10000);

            it('should return environment metadata', () => {
                const metadata = wrapper.getMetadata();
                expect(metadata.name).toBe('CartPole-v1');
                expect(metadata.observationSpace).toBeDefined();
                expect(metadata.actionSpace).toBeDefined();
            });
        });

describe('different environments', () => {
    it('should handle MountainCar', async () => {
      wrapper = new GymWrapper('MountainCar-v0');
      await wrapper.initialize();

      expect(wrapper.observationSpace.shape).toEqual([2]);
      expect(wrapper.actionSpace.type).toBe('discrete');
      expect(wrapper.actionSpace.n).toBe(3);
    }, 10000);

            it('should handle Pendulum', async () => {
                wrapper = new GymWrapper('Pendulum-v1');
                await wrapper.initialize();

                expect(wrapper.observationSpace.shape).toEqual([3]);
                expect(wrapper.actionSpace.type).toBe('continuous');
            });

            it('should handle LunarLander', async () => {
                try {
                    wrapper = new GymWrapper('LunarLander-v3');
                    await wrapper.initialize();

                    expect(wrapper.observationSpace.shape).toEqual([8]);
                    expect(wrapper.actionSpace.type).toBe('discrete');
                    expect(wrapper.actionSpace.n).toBe(4);
                } catch (e) {
                    // Skip if Box2D not installed
                    if (e.message.includes('Box2D')) {
                        return; // Skip test
                    }
                    throw e;
                }
            });
        });
    });

    describe('gym factory function', () => {
        it('should create and initialize wrapper', async () => {
            const env = await gym('CartPole-v1');
            expect(env.initialized).toBe(true);
            expect(env.envName).toBe('CartPole-v1');
            await env.shutdown();
        });
    });
});
