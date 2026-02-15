/**
 * Visual feedback utilities for the SeNARS UI
 */

export class VisualFeedback {
    constructor() {
        this.activeIndicators = new Set();
    }

    /**
     * Show a loading indicator
     * @param {HTMLElement} element - Element to show indicator on
     * @param {string} message - Loading message
     */
    showLoading(element, message = 'Processing...') {
        // Remove any existing loading indicator
        this.hideLoading(element);

        // Create loading overlay
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-indicator';
        loadingDiv.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;

        const spinner = document.createElement('div');
        spinner.style.cssText = `
            width: 24px;
            height: 24px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        `;

        const messageDiv = document.createElement('div');
        messageDiv.textContent = message;
        messageDiv.style.cssText = `margin-left: 10px; color: #333;`;

        // Add CSS animation if not already present
        this._addSpinAnimation();

        loadingDiv.appendChild(spinner);
        loadingDiv.appendChild(messageDiv);

        // Position the loading div relative to the element
        element.style.position = 'relative';
        element.appendChild(loadingDiv);

        // Store the loading element for later removal
        element._loadingIndicator = loadingDiv;
    }

    /**
     * Hide loading indicator
     * @param {HTMLElement} element - Element to remove indicator from
     */
    hideLoading(element) {
        if (element._loadingIndicator) {
            element.removeChild(element._loadingIndicator);
            element._loadingIndicator = null;
        }
    }

    /**
     * Show success animation
     * @param {HTMLElement} element - Element to show animation on
     * @param {string} message - Success message
     */
    showSuccess(element, message = 'Success!') {
        this._showTemporaryFeedback(element, message, 'success');
    }

    /**
     * Show error animation
     * @param {HTMLElement} element - Element to show animation on
     * @param {string} message - Error message
     */
    showError(element, message = 'Error occurred') {
        this._showTemporaryFeedback(element, message, 'error');
    }

    /**
     * Show temporary feedback message
     * @private
     */
    _showTemporaryFeedback(element, message, type) {
        // Remove existing feedback
        this._hideTemporaryFeedback(element);

        // Create feedback element
        const feedback = document.createElement('div');
        feedback.className = `feedback-${type}`;
        feedback.textContent = message;
        
        const isInput = element.tagName.toLowerCase() === 'input';
        const isButton = element.tagName.toLowerCase() === 'button';
        
        if (isInput || isButton) {
            // Position near the input/button
            feedback.style.cssText = `
                position: absolute;
                top: ${element.offsetTop + element.offsetHeight + 5}px;
                left: ${element.offsetLeft}px;
                padding: 5px 10px;
                border-radius: 4px;
                color: white;
                font-size: 12px;
                z-index: 1001;
                ${type === 'success' ? 'background-color: green;' : 'background-color: red;'}
            `;
        } else {
            // For other elements, append to the element
            feedback.style.cssText = `
                position: relative;
                padding: 5px 10px;
                border-radius: 4px;
                color: white;
                font-size: 12px;
                margin-top: 5px;
                display: inline-block;
                ${type === 'success' ? 'background-color: green;' : 'background-color: red;'}
            `;
        }

        element._feedbackElement = feedback;
        
        // Add animation
        feedback.style.opacity = '0';
        feedback.style.transform = 'translateY(-10px)';
        
        if (isInput || isButton) {
            element.parentElement.appendChild(feedback);
        } else {
            element.appendChild(feedback);
        }

        // Animate in
        setTimeout(() => {
            feedback.style.transition = 'all 0.3s ease';
            feedback.style.opacity = '1';
            feedback.style.transform = 'translateY(0)';
        }, 10);

        // Remove after 3 seconds
        setTimeout(() => {
            this._hideTemporaryFeedback(element);
        }, 3000);
    }

    /**
     * Hide temporary feedback
     * @private
     */
    _hideTemporaryFeedback(element) {
        if (element._feedbackElement) {
            element._feedbackElement.style.opacity = '0';
            element._feedbackElement.style.transform = 'translateY(-10px)';
            
            setTimeout(() => {
                if (element._feedbackElement && element._feedbackElement.parentNode) {
                    element._feedbackElement.parentNode.removeChild(element._feedbackElement);
                    element._feedbackElement = null;
                }
            }, 300);
        }
    }

    /**
     * Add CSS animation for spinner
     * @private
     */
    _addSpinAnimation() {
        if (!document.querySelector('#spin-animation-style')) {
            const style = document.createElement('style');
            style.id = 'spin-animation-style';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Pulse animation for live updates
     * @param {HTMLElement} element - Element to pulse
     */
    pulseLiveUpdates(element) {
        element.style.animation = 'pulse 1s infinite';
        
        if (!document.querySelector('#pulse-animation-style')) {
            const style = document.createElement('style');
            style.id = 'pulse-animation-style';
            style.textContent = `
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.7); }
                    70% { box-shadow: 0 0 0 10px rgba(46, 204, 113, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Stop pulse animation
     * @param {HTMLElement} element - Element to stop pulsing
     */
    stopPulse(element) {
        element.style.animation = 'none';
    }
}

export default VisualFeedback;