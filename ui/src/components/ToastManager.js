/**
 * @file ToastManager.js
 * @description Singleton service for managing toast notifications
 */

class ToastManagerService {
    constructor() {
        this.container = null;
        this.queue = [];
        this.isProcessing = false;
    }

    _ensureContainer() {
        if (!this.container) {
            this.container = document.getElementById('toast-container');
        }

        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
        return this.container;
    }

    show(message, type = 'info', duration = 3000) {
        const container = this._ensureContainer();

        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;

        // Icon based on type
        let icon = 'ℹ️';
        if (type === 'success') {icon = '✅';}
        if (type === 'warning') {icon = '⚠️';}
        if (type === 'error') {icon = '🚨';}
        if (type === 'system') {icon = '🤖';}

        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-message">${message}</span>
            <div class="toast-progress"></div>
        `;

        container.appendChild(toast);

        // Animate In
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Progress bar animation
        const progress = toast.querySelector('.toast-progress');
        if (progress) {
            progress.style.transition = `width ${duration}ms linear`;
            // Force reflow
            progress.getBoundingClientRect();
            progress.style.width = '0%';
        }

        // Auto remove
        setTimeout(() => {
            this.dismiss(toast);
        }, duration);

        // Click to dismiss
        toast.onclick = () => this.dismiss(toast);

        return toast;
    }

    dismiss(toast) {
        if (!toast) {return;}

        toast.classList.remove('show');
        toast.classList.add('hide');

        // Wait for animation
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 300);
    }

    // For manual clearing/testing
    clearAll() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// Export singleton instance
export const ToastManager = new ToastManagerService();
