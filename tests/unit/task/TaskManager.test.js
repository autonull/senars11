import {Focus, Memory, Task, TaskManager, TermFactory, Truth} from '@senars/nar';

describe('TaskManager', () => {
    let mgr, memory, term;
    const factory = new TermFactory();

    beforeEach(() => {
        term = factory.atomic('A');
        const config = {priorityThreshold: 0.6, defaultBudget: {priority: 0.5, durability: 0.5, quality: 0.5}};
        memory = new Memory(config);
        mgr = new TaskManager(memory, new Focus(), config);
    });

    test('init', () => {
        expect(mgr.pendingTasksCount).toBe(0);
        expect(mgr.stats.totalTasksCreated).toBe(0);
    });

    test('addTask -> pending', () => {
        const task = new Task({term, truth: {frequency: 0.9, confidence: 0.8}});
        mgr.addTask(task);
        expect(mgr.pendingTasksCount).toBe(1);
        expect(mgr.getPendingTasks()).toContain(task);
    });

    test('processPendingTasks', () => {
        mgr.addTask(new Task({term, budget: {priority: 0.8}, truth: {frequency: 0.9, confidence: 0.8}}));
        mgr.addTask(new Task({
            term: factory.atomic('B'),
            budget: {priority: 0.4},
            truth: {frequency: 0.9, confidence: 0.8}
        }));

        const processed = mgr.processPendingTasks();
        expect(mgr.pendingTasksCount).toBe(0);
        expect(processed).toHaveLength(2);
        expect(memory.getConcept(term).totalTasks).toBe(1);
    });

    test('create helpers', () => {
        expect(mgr.createBelief(term, new Truth(0.9, 0.8)).type).toBe('BELIEF');
        expect(mgr.createGoal(term).type).toBe('GOAL');
        expect(mgr.createQuestion(term).type).toBe('QUESTION');
    });

    test('findTasksByTerm', () => {
        mgr.addTask(new Task({term, truth: {frequency: 0.9, confidence: 0.8}}));
        mgr.processPendingTasks();
        const found = mgr.findTasksByTerm(term);
        expect(found).toHaveLength(1);
        expect(found[0].term).toEqual(term);
    });

    test('getHighestPriorityTasks', () => {
        mgr.addTask(new Task({term, budget: {priority: 0.6}, truth: {frequency: 0.9, confidence: 0.8}}));
        mgr.addTask(new Task({
            term: factory.atomic('B'),
            budget: {priority: 0.8},
            truth: {frequency: 0.9, confidence: 0.8}
        }));
        mgr.processPendingTasks();

        const highest = mgr.getHighestPriorityTasks(2);
        expect(highest).toHaveLength(2);
        expect(highest[0].budget.priority).toBe(0.8);
        expect(highest[1].budget.priority).toBe(0.6);
    });

    test('updateTaskPriority', () => {
        const task = new Task({term, budget: {priority: 0.5}, truth: {frequency: 0.9, confidence: 0.8}});
        mgr.addTask(task);
        mgr.processPendingTasks();

        expect(mgr.updateTaskPriority(task, 0.9)).toBe(true);
        const concept = memory.getConcept(term);
        expect(concept.getTask(task.stamp.id).budget.priority).toBe(0.9);
    });
});
