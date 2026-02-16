import { AutoLearner } from './AutoLearner.js';

export class SuggestionEngine {
    constructor() {
        this.autoLearner = new AutoLearner();
        this.context = {
            lastConcept: null,
            recentCommands: []
        };
    }

    setContext(key, value) {
        if (key === 'lastConcept') this.context.lastConcept = value;
        if (key === 'command') {
            this.context.recentCommands.push(value);
            if (this.context.recentCommands.length > 10) this.context.recentCommands.shift();
        }
    }

    getSuggestions(inputText) {
        const suggestions = [];
        const text = inputText.toLowerCase();

        // 1. Context-based suggestions
        if (this.context.lastConcept && !text) {
            suggestions.push({
                text: `<${this.context.lastConcept} --> ?x>?`,
                label: `Query properties of ${this.context.lastConcept}`
            });
             suggestions.push({
                text: `<${this.context.lastConcept} --> [?x]>?`,
                label: `Query instance properties of ${this.context.lastConcept}`
            });
        }

        // 2. Command completion
        const commonCommands = ['<a --> b>.', '<a <-> b>.', '(! reset)', '(! save)', '(! load)'];

        for (const cmd of commonCommands) {
            if (cmd.startsWith(text) && cmd !== text) {
                suggestions.push({ text: cmd, label: 'Common Pattern' });
            }
        }

        // 3. Learner-based suggestions (simplified)
        // If we had a history of successful queries, we could pull from there

        return suggestions.slice(0, 5); // Limit to top 5
    }
}
