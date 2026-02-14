export class CommandHistory {
    constructor(storageKey = 'senars-repl-history', maxLimit = 100) {
        this.storageKey = storageKey;
        this.maxLimit = maxLimit;
        this.history = this._load();
        this.pointer = this.history.length;
        this.tempInput = ''; // Store current input when navigating up
    }

    add(command) {
        if (!command || command.trim() === '') return;

        // Remove duplicate if it's the most recent one
        if (this.history.length > 0 && this.history[this.history.length - 1] === command) {
            this.pointer = this.history.length;
            this.tempInput = '';
            return;
        }

        this.history.push(command);
        if (this.history.length > this.maxLimit) {
            this.history.shift();
        }

        this.pointer = this.history.length;
        this.tempInput = '';
        this._save();
    }

    getPrevious(currentInput) {
        // If we are at the "new input" line (pointer == length), save current input
        if (this.pointer === this.history.length) {
            this.tempInput = currentInput;
        }

        if (this.pointer > 0) {
            this.pointer--;
            return this.history[this.pointer];
        }
        return this.history[0];
    }

    getNext() {
        if (this.pointer < this.history.length - 1) {
            this.pointer++;
            return this.history[this.pointer];
        } else if (this.pointer === this.history.length - 1) {
             this.pointer++;
             return this.tempInput;
        } else {
             // Already at temp input
             return null;
        }
    }

    clear() {
        this.history = [];
        this.pointer = 0;
        this.tempInput = '';
        this._save();
    }

    _save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.history));
        } catch (e) {
            console.warn('Failed to save command history', e);
        }
    }

    _load() {
        try {
            // Check if localStorage is available
            if (typeof localStorage === 'undefined') return [];
            const saved = localStorage.getItem(this.storageKey);
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    }
}
