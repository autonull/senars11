/**
 * MeTTaStrategy - MeTTa-based Reasoning Strategy
 * Implements premise selection and inference using MeTTa reduction
 */

import {Strategy} from '@senars/nar';

export class MeTTaStrategy extends Strategy {
    constructor(mettaInterpreter, config = {}) {
        super(config);
        this.name = 'MeTTaStrategy';
        this.metta = mettaInterpreter;
        this.maxPremises = config.maxPremises ?? 5;
    }

    async selectSecondaryPremises(primaryPremise) {
        // Convert to MeTTa representation
        const taskTerm = this._taskToMetta(primaryPremise);

        // Use control.metta for premise selection
        const selection = this.metta.run(`(select-premises ${taskTerm} ${this.maxPremises})`);

        // Convert results back to tasks
        return this._mettaToTasks(selection);
    }

    async ask(task) {
        // Evaluate task using MeTTa reduction
        const taskTerm = this._taskToMetta(task);
        const results = this.metta.evaluate(taskTerm);

        return this._mettaToTasks(results);
    }

    _taskToMetta(task) {
        // Convert NARS task to MeTTa atom
        // This is a simplified conversion - full implementation would handle all term types
        return task.term?.toString() ?? String(task);
    }

    _mettaToTasks(mettaResult) {
        // Convert MeTTa results back to NARS tasks
        // Simplified implementation
        if (!mettaResult || mettaResult.length === 0) {
            return [];
        }

        // For now, return empty array - full implementation would reconstruct tasks
        // This requires Task and Truth imports which we want to avoid circular deps
        return [];
    }

    getStatus() {
        return {
            ...super.getStatus(),
            type: 'MeTTaStrategy',
            maxPremises: this.maxPremises,
            mettaSpaceSize: this.metta.space?.size() ?? 0
        };
    }
}
