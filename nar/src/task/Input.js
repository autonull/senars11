export class Input {
    constructor() {
        this.tasks = [];
        this.idCounter = 0; // For generating unique IDs
    }

    addTask(task, priority = 0, metadata = {}) {
        if (!this._validateTask(task)) throw new Error('Invalid task format');

        const taskId = this._generateId();
        const taskItem = {
            id: taskId,
            task,
            priority,
            timestamp: Date.now(),
            metadata: {...metadata, createdAt: Date.now()},
            derivedTasks: [] // Track derived tasks from this input
        };

        this.tasks.push(taskItem);
        this._sortTasks();

        return taskId;
    }

    removeTask(index) {
        return this._isValidIndex(index) ? this.tasks.splice(index, 1)[0] : null;
    }

    removeTaskById(taskId) {
        const index = this.tasks.findIndex(item => item.id === taskId);
        return index !== -1 ? this.tasks.splice(index, 1)[0] : null;
    }

    updatePriority(index, newPriority, mode = 'direct') {
        if (!this._isValidIndex(index)) return false;

        const taskItem = this.tasks[index];
        taskItem.priority = newPriority;

        this._handlePriorityUpdateMode(taskItem.id, newPriority, mode);
        this._sortTasks();
        return true;
    }

    _handlePriorityUpdateMode(taskId, newPriority, mode) {
        if (mode === 'cascade' || mode === 'custom') {
            this._updateDerivedPriorities(taskId, newPriority);
        }
    }

    updatePriorityById(taskId, newPriority, mode = 'direct') {
        const index = this.tasks.findIndex(item => item.id === taskId);
        return index !== -1 ? this.updatePriority(index, newPriority, mode) : false;
    }

    getHighestPriorityTask() {
        return this.tasks[0] ?? null;
    }

    getAllTasks() {
        return [...this.tasks];
    }

    getTasksByPriority(minPriority = -Infinity) {
        return this.tasks.filter(item => item.priority >= minPriority);
    }

    getTaskById(taskId) {
        return this.tasks.find(item => item.id === taskId) ?? null;
    }

    size() {
        return this.tasks.length;
    }

    clear() {
        this.tasks = [];
    }

    getTaskDependencies(inputId) {
        const inputTask = this.getTaskById(inputId);
        return inputTask ? [...inputTask.derivedTasks] : [];
    }

    getDerivationPath(taskId) {
        const task = this.getTaskById(taskId);
        if (!task) return [];

        // In a full implementation, this would trace the full derivation path
        // For now, return direct dependencies
        return task.derivedTasks ? [...task.derivedTasks] : [];
    }

    deleteInputWithDependencies(inputId) {
        const taskItem = this.removeTaskById(inputId);
        if (taskItem) {
            this._removeDerivedTasks(inputId);
            return taskItem;
        }
        return null;
    }

    editInputWithRecreate(inputId, newInput, metadata = {}) {
        const index = this.tasks.findIndex(item => item.id === inputId);
        if (index !== -1) {
            const oldTaskItem = this.tasks[index];
            const newPriority = oldTaskItem.priority;

            this._removeDerivedTasks(inputId);

            this.tasks[index] = {
                id: inputId,
                task: newInput,
                priority: newPriority,
                timestamp: Date.now(), // Update timestamp
                metadata: {...oldTaskItem.metadata, ...metadata, modifiedAt: Date.now()},
                derivedTasks: [] // Reset derived tasks
            };

            this._sortTasks();
            return true;
        }
        return false;
    }

    addDerivedTask(inputId, derivedTask) {
        const taskItem = this.getTaskById(inputId);
        if (taskItem) {
            if (!taskItem.derivedTasks) {
                taskItem.derivedTasks = [];
            }
            // Ensure derivedTask has an ID if it doesn't have one
            if (!derivedTask.id) {
                derivedTask.id = `derived_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
            taskItem.derivedTasks.push(derivedTask);
        }
    }

    // Method to add multiple derived tasks at once
    addMultipleDerivedTasks(inputId, derivedTasks) {
        const taskItem = this.getTaskById(inputId);
        if (taskItem) {
            if (!taskItem.derivedTasks) {
                taskItem.derivedTasks = [];
            }
            for (const derivedTask of derivedTasks) {
                if (!derivedTask.id) {
                    derivedTask.id = `derived_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                }
                taskItem.derivedTasks.push(derivedTask);
            }
        }
    }

    // Method to remove a specific derived task
    removeDerivedTask(inputId, derivedTaskId) {
        const taskItem = this.getTaskById(inputId);
        if (taskItem && taskItem.derivedTasks) {
            taskItem.derivedTasks = taskItem.derivedTasks.filter(task => task.id !== derivedTaskId);
        }
    }

    // Method to clear all derived tasks for an input
    clearDerivedTasks(inputId) {
        const taskItem = this.getTaskById(inputId);
        if (taskItem) {
            taskItem.derivedTasks = [];
        }
    }

    // Method to update a derived task
    updateDerivedTask(inputId, derivedTaskId, updatedTask) {
        const taskItem = this.getTaskById(inputId);
        if (taskItem && taskItem.derivedTasks) {
            const index = taskItem.derivedTasks.findIndex(task => task.id === derivedTaskId);
            if (index !== -1) {
                taskItem.derivedTasks[index] = {...taskItem.derivedTasks[index], ...updatedTask};
            }
        }
    }

    // Method to get all derived tasks for an input
    getDerivedTasks(inputId) {
        const taskItem = this.getTaskById(inputId);
        return taskItem ? [...taskItem.derivedTasks] : [];
    }

    // Method to get all inputs that have derived tasks
    getInputsWithDerivedTasks() {
        return this.tasks.filter(taskItem => taskItem.derivedTasks && taskItem.derivedTasks.length > 0);
    }

    _updateDerivedPriorities(inputId, priority) {
        const taskItem = this.getTaskById(inputId);
        if (taskItem?.derivedTasks) {
            taskItem.derivedTasks.forEach(derivedTask => {
                if (derivedTask.metadata) {
                    derivedTask.metadata.priority = priority;
                }
            });
        }
    }

    _removeDerivedTasks(inputId) {
        const taskItem = this.getTaskById(inputId);
        if (taskItem?.derivedTasks) {
            taskItem.derivedTasks = [];
        }
    }

    _validateTask = task => task != null;

    _isValidIndex(index) {
        return index >= 0 && index < this.tasks.length;
    }

    _sortTasks() {
        this.tasks.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp);
    }

    _generateId() {
        return `input_${++this.idCounter}_${Date.now()}`;
    }
}
