/**
 * RateLimiter.js - Token Bucket Rate Limiter
 * prevents flooding channels with messages.
 */
export class RateLimiter {
    constructor(limit = 5, interval = 2000) {
        this.limit = limit; // Max tokens
        this.interval = interval; // Refill interval in ms
        this.tokens = limit;
        this.lastRefill = Date.now();
    }

    async wait() {
        this._refill();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }

        // Calculate time to next refill
        const now = Date.now();
        const timeSinceRefill = now - this.lastRefill;
        const waitTime = this.interval - timeSinceRefill;

        if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
            this._refill();
            if (this.tokens >= 1) {
                this.tokens -= 1;
                return true;
            }
        }

        return false;
    }

    _refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;

        if (elapsed > this.interval) {
            this.tokens = this.limit;
            this.lastRefill = now;
        }
    }
}
