export class ToastManager {
    constructor() {
        this.container = null;
        this._createContainer();
    }

    _createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;

        // Icon based on type
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'warning') icon = '⚠️';
        if (type === 'error') icon = '🚨';
        if (type === 'system') icon = '🤖';

        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-message">${message}</span>
            <div class="toast-progress"></div>
        `;

        this.container.appendChild(toast);

        // Animate In
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Progress bar animation
        const progress = toast.querySelector('.toast-progress');
        progress.style.transition = `width ${duration}ms linear`;
        // Force reflow
        progress.getBoundingClientRect();
        progress.style.width = '0%';

        // Auto remove
        setTimeout(() => {
            this.dismiss(toast);
        }, duration);

        // Click to dismiss
        toast.onclick = () => this.dismiss(toast);
    }

    dismiss(toast) {
        toast.classList.remove('show');
        toast.classList.add('hide');

        // Wait for animation
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 300);
    }
}
