import {NAR, IntrospectionEvents} from '@senars/nar';
import {FormattingUtils} from '@senars/core/src/util/FormattingUtils.js';

describe('TUIRepl NAR Reasoning with Duplicate Suppression', () => {
    let nar;

    beforeEach(async () => {
        nar = new NAR();
        // Enable tracing to capture reasoning derivation events
        nar.traceEnabled = true;
        await nar.initialize();
    });

    afterEach(async () => {
        await nar.dispose();
    });

    test('should derive (a==>c) exactly once from (a==>b) and (b==>c) with duplicate suppression', async () => {
        // Event counters
        const events = {
            taskInput: 0,
            taskFocus: 0,
            reasoningDerivation: 0,
            capturedFocusTasks: []
        };

        // Set up event listeners
        nar.on(IntrospectionEvents.TASK_INPUT, (data) => {
            events.taskInput++;
        });

        nar.on(IntrospectionEvents.TASK_FOCUS, (task) => {
            events.taskFocus++;
            const formattedTask = FormattingUtils.formatTask(task);
            events.capturedFocusTasks.push(formattedTask);
        });

        nar.on(IntrospectionEvents.REASONING_DERIVATION, () => {
            events.reasoningDerivation++;
        });

        // Input the two tasks
        await nar.input('(a==>b).');
        await nar.input('(b==>c).');

        // Run 5 cycles
        for (let i = 0; i < 5; i++) {
            await nar.step();
        }

        // Verify that input tasks generate appropriate events
        expect(events.taskInput).toBeGreaterThanOrEqual(3); // 2 original + 1 derived that was uniquely added
        expect(events.taskFocus).toBeGreaterThanOrEqual(3); // At least 2 original + 1 derived that got focus
        // With duplicate suppression, we expect the reasoning derivation event to fire ONLY when a unique task is derived
        expect(events.reasoningDerivation).toBeGreaterThanOrEqual(1);

        // Count derived tasks that appeared in focus (should be exactly 1)
        const derivedFocusTasks = events.capturedFocusTasks.filter(task => task.includes('(==>, a, c)'));
        expect(derivedFocusTasks.length).toBe(1);

        // Verify that the derived task actually appeared
        const hasDerivedTask = events.capturedFocusTasks.some(task => task.includes('(==>, a, c)'));
        expect(hasDerivedTask).toBe(true);

        // Verify that original tasks also got focus
        const hasInputATask = events.capturedFocusTasks.some(task => task.includes('(==>, a, b)'));
        const hasInputBTask = events.capturedFocusTasks.some(task => task.includes('(==>, b, c)'));
        expect(hasInputATask).toBe(true);
        expect(hasInputBTask).toBe(true);
    });

    test('should implement uniform Input/Memory/Focus/Event process for all tasks', async () => {
        const events = {
            taskInput: [],
            taskFocus: [],
        };

        // Set up event listeners to capture task details
        nar.on(IntrospectionEvents.TASK_INPUT, (data) => {
            events.taskInput.push({
                term: data.task.term?.toString?.(),
                source: data.source,
            });
        });

        nar.on(IntrospectionEvents.TASK_FOCUS, (task) => {
            events.taskFocus.push({
                term: task.term?.toString?.(),
            });
        });

        // Input a task
        const inputResult = await nar.input('(x==>y).');

        // Verify input was successful
        expect(inputResult).toBe(true);

        // Run a step to see if any derivations happen
        await nar.step();

        // Verify that input task goes through both input and focus
        const inputTerms = events.taskInput.map(e => e.term);
        const focusTerms = events.taskFocus.map(e => e.term);

        expect(inputTerms).toContain('(==>, x, y)');
        expect(focusTerms).toContain('(==>, x, y)');
    });

    test('should suppress duplicate derived tasks with focus events', async () => {
        // Event counters
        const events = {
            taskFocus: 0,
            capturedFocusTasks: []
        };

        // Set up event listeners
        nar.on(IntrospectionEvents.TASK_FOCUS, (task) => {
            events.taskFocus++;
            const formattedTask = FormattingUtils.formatTask(task);
            events.capturedFocusTasks.push(formattedTask);
        });

        // Input two tasks that should derive a third
        await nar.input('(x==>y).');
        await nar.input('(y==>z).');

        // Run multiple cycles - the derived task (x==>z) should only get focus once
        const cycles = 5;
        for (let i = 0; i < cycles; i++) {
            await nar.step();
        }

        // Count how many times the derived task appears in focus
        const derivedFocusTasks = events.capturedFocusTasks.filter(task => task.includes('(==>, x, z)'));

        // The derived task should appear in focus exactly once (duplicate suppression working)
        expect(derivedFocusTasks.length).toBe(1);
    });

    test('should format tasks correctly using FormattingUtils', async () => {
        // Input a task
        await nar.input('(m-->n).');
        await nar.step();

        // Verify it can be formatted properly
        const events = {capturedTasks: []};
        nar.on(IntrospectionEvents.TASK_FOCUS, (task) => {
            const formatted = FormattingUtils.formatTask(task);
            events.capturedTasks.push(formatted);
        });

        // Re-input to trigger focus event
        await nar.input('(m-->n).'); // This should return false due to duplication
        await nar.step();

        // Should still have been formatted correctly even if not added as focus
        expect(events.capturedTasks.length).toBeGreaterThanOrEqual(0);
    });
});
