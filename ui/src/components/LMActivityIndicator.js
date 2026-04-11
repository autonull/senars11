import { FluentUI } from '../utils/FluentUI.js';

export class LMActivityIndicator {
    constructor(container) {
        this.container = container;
        this.overlay = null;
        this.isActive = false;
        this._init();
    }

    get active() { return this.isActive; }

    _init() {
        if (!this.container) {return;}
        this.overlay = FluentUI.create('div')
            .class('lm-activity-overlay hidden')
            .html(`
                <div class="lm-spinner-container">
                    <div class="lm-spinner"></div>
                    <div class="lm-status-text">LM Processing...</div>
                </div>
                <div class="lm-error-container hidden">
                    <div class="lm-error-icon">⚠️</div>
                    <div class="lm-error-text"></div>
                </div>
            `)
            .mount(this.container);
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
        if (!this.overlay) {return;}
        this.isActive = visible;

        if (visible) {
            this.overlay.removeClass('hidden');
        } else {
            this.overlay.addClass('hidden');
        }

        if (visible) {
            const spinner = this.overlay.dom.querySelector('.lm-spinner-container');
            const error = this.overlay.dom.querySelector('.lm-error-container');

            if (isError) {
                spinner.classList.add('hidden');
                error.classList.remove('hidden');
                this.overlay.dom.querySelector('.lm-error-text').textContent = msg;
            } else {
                spinner.classList.remove('hidden');
                error.classList.add('hidden');
            }
        }
    }

    destroy() {
        this.overlay?.remove();
        this.overlay = null;
    }
}
