import {AgentBuilder} from '../../../agent/src/AgentBuilder.js';
import {ActivityModel} from '../../../agent/src/app/model/ActivityModel.js';
import {ActivityMonitor} from '../../../agent/src/app/model/ActivityMonitor.js';
import {ActionDispatcher} from '../../../agent/src/app/model/ActionDispatcher.js';
import {PreferenceCollector} from '../../../agent/src/rlfp/PreferenceCollector.js';
import {ActionTypes, ActivityTypes} from '../../../agent/src/app/model/ActivityTypes.js';

describe('Activity Log Integration', () => {
    let agent, model, monitor, dispatcher, collector;

    beforeEach(async () => {
        agent = await new AgentBuilder().build();
        model = new ActivityModel();
        monitor = new ActivityMonitor(agent, model);
        monitor.start();
        collector = new PreferenceCollector();
        dispatcher = new ActionDispatcher(agent, collector);
    });

    afterEach(async () => {
        if (monitor) monitor.stop();
        if (agent) {
            if (agent.stop) agent.stop();
            if (agent.dispose) await agent.dispose();
        }
    });

    test('Engine events should populate ActivityModel', (done) => {
        // Subscribe to model updates
        const unsubscribe = model.subscribe((event, data) => {
            if (event === 'add' && data.type === ActivityTypes.REASONING.DERIVATION) {
                try {
                    expect(data.payload.term).toBe('test');
                    unsubscribe();
                    done();
                } catch (e) {
                    done(e);
                }
            }
        });

        // Trigger derivation (simulated event)
        // We simulate the event that ActivityMonitor listens to: 'reasoning.derivation'
        agent.emit('reasoning.derivation', {
            derivedTask: {term: 'test', stamp: {}},
            rule: 'test-rule'
        });
    });

    test('ActionDispatcher should record preference', async () => {
        const result = await dispatcher.dispatch({
            type: ActionTypes.RATE,
            payload: {value: 1},
            context: {activityId: '123', rawActivity: {type: 'test'}}
        });

        expect(result.success).toBe(true);
        expect(collector.preferences.length).toBe(1);
        expect(collector.preferences[0].rating).toBe(1);
        expect(collector.preferences[0].activityId).toBe('123');
    });

    test('System logs should populate ActivityModel', (done) => {
        const unsubscribe = model.subscribe((event, data) => {
            if (event === 'add' && data.type === ActivityTypes.SYSTEM.LOG) {
                try {
                    expect(data.payload.text).toBe('Test log');
                    unsubscribe();
                    done();
                } catch (e) {
                    done(e);
                }
            }
        });
        agent.emit('log', 'Test log');
    });
});
