export class LMActivityIndicator {
    constructor(container) {
        this.container = container;
        this.overlay = null;
        this.isActive = false;
        this._init();
    }

    get active() { return this.isActive; }

    _init() {
        if (!this.container) return;
        this.overlay = document.createElement('div');
        this.overlay.className = 'lm-activity-overlay hidden';
        this.overlay.innerHTML = `
            <div class="lm-spinner-container">
                <div class="lm-spinner"></div>
                <div class="lm-status-text">LM Processing...</div>
            </div>
            <div class="lm-error-container hidden">
                <div class="lm-error-icon">⚠️</div>
                <div class="lm-error-text"></div>
            </div>
        `;
        this.container.appendChild(this.overlay);
    }

    show() {
        this._setState(true, false);
    }

    hide() {
        this._setState(false);
    }

    showError(msg = 'LM Error') {
        this._setState(true, true, msg);
        setTimeout(() => this.hide(), 3000);
    }

    _setState(visible, isError = false, msg = '') {
        if (!this.overlay) return;
        this.isActive = visible;
        this.overlay.classList.toggle('hidden', !visible);

        if (visible) {
            const spinner = this.overlay.querySelector('.lm-spinner-container');
            const error = this.overlay.querySelector('.lm-error-container');

            spinner.classList.toggle('hidden', isError);
            error.classList.toggle('hidden', !isError);

            if (isError) {
                this.overlay.querySelector('.lm-error-text').textContent = msg;
            }
        }
    }

    destroy() {
        this.overlay?.remove();
        this.overlay = null;
    }
}
