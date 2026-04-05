export class MessageEnvelope {
    static REQUIRED = ['text', 'from', 'embodimentId', 'content'];

    constructor(raw) {
        this.text = String(raw.text ?? '');
        this.from = String(raw.from ?? '');
        this.embodimentId = String(raw.embodimentId ?? '');
        this.content = String(raw.content ?? '');
        this.channel = raw.channel ?? null;
        this.isPrivate = Boolean(raw.isPrivate ?? false);
        this.salience = Number(raw.salience ?? 0);

        for (const field of MessageEnvelope.REQUIRED) {
            if (!this[field]) {
                throw new Error(`MessageEnvelope missing required field: ${field}`);
            }
        }
    }

    get target() {
        return this.isPrivate ? this.from : (this.channel ?? 'default');
    }

    toString() { return this.text; }
}
