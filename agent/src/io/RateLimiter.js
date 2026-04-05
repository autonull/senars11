export class RateLimiter {
    constructor(limit = 5, interval = 2000) {
        this.limit = limit;
        this.interval = interval;
        this.tokens = limit;
        this.lastRefill = Date.now();
    }

    async wait() {
        this._refill();
        if (this.tokens >= 1) { this.tokens -= 1; return true; }
        const waitTime = this.interval - (Date.now() - this.lastRefill);
        if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
            this._refill();
            if (this.tokens >= 1) { this.tokens -= 1; return true; }
        }
        return false;
    }

    _refill() {
        const elapsed = Date.now() - this.lastRefill;
        if (elapsed > this.interval) { this.tokens = this.limit; this.lastRefill = Date.now(); }
    }
}
