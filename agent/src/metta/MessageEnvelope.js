export class MessageEnvelope {
    static REQUIRED = ['text', 'from', 'embodimentId', 'content'];

    constructor(raw) {
        this.text = this._asString(raw.text, 'text');
        this.from = this._asString(raw.from, 'from');
        this.embodimentId = this._asString(raw.embodimentId, 'embodimentId');
        this.content = this._asString(raw.content, 'content');
        this.channel = raw.channel ?? null;
        this.isPrivate = Boolean(raw.isPrivate ?? false);
        this.salience = Number(raw.salience ?? 0);

        for (const field of MessageEnvelope.REQUIRED) {
            if (!this[field]) {
                throw new Error(`MessageEnvelope missing required field: ${field}`);
            }
        }
    }

    _asString(value, name) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') {
            throw new Error(`MessageEnvelope.${name} must be a string, got ${typeof value}`);
        }
        return String(value);
    }

    get target() {
        return this.isPrivate ? this.from : (this.channel ?? 'default');
    }

    toString() { return this.text; }
}
