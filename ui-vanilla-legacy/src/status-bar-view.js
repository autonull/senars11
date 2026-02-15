/**
 * StatusBarView - Manages the enhanced status bar UI element
 */
import { selectElement } from './utils/common.js';

export default class StatusBarView {
    constructor(store) {
        this.store = store;
        this.statusBarElement = selectElement('#status-bar');
        this.connectionStatusIndicator = selectElement('#connection-status-indicator');
        this.connectionStatusText = selectElement('#connection-status-text');
        this.liveUpdatesStatus = selectElement('#live-updates-status');
        this.messageCount = selectElement('#message-count');
        this.nodeCount = selectElement('#node-count');
        this.connectionQuality = selectElement('#connection-quality');
        this.unsubscribe = null;

        // Track message counts
        this.messageSentCount = 0;
        this.messageReceivedCount = 0;

        if (!this.statusBarElement) {
            console.error('Status bar element not found');
            return;
        }

        this.init();
    }

    init() {
        this.unsubscribe = this.store.subscribe((state) => {
            this.handleStoreChange(state);
        });

        this.handleStoreChange(this.store.getState());
    }

    handleStoreChange(state) {
        if (!this.statusBarElement) return;

        this._updateConnectionStatus(state.connectionStatus);
        this._updateLiveUpdatesStatus(state.isLiveUpdateEnabled);
        this._updateNodeCount(state.graph.nodes.size);
        this._updateConnectionQuality(state);
    }

    _updateConnectionStatus(status) {
        // Update the status text
        if (this.connectionStatusText) {
            switch(status) {
                case 'connected':
                    this.connectionStatusText.textContent = 'Connected';
                    break;
                case 'connecting':
                    this.connectionStatusText.textContent = 'Connecting...';
                    break;
                case 'disconnected':
                    this.connectionStatusText.textContent = 'Disconnected';
                    break;
                case 'error':
                    this.connectionStatusText.textContent = 'Error';
                    break;
                default:
                    this.connectionStatusText.textContent = status;
            }
        }

        // Update the status indicator class
        if (this.connectionStatusIndicator) {
            this.connectionStatusIndicator.className = 'status-indicator';
            switch(status) {
                case 'connected':
                    this.connectionStatusIndicator.classList.add('connected-indicator');
                    break;
                case 'connecting':
                    this.connectionStatusIndicator.classList.add('connecting-indicator');
                    break;
                case 'error':
                    this.connectionStatusIndicator.classList.add('error-indicator');
                    break;
                case 'disconnected':
                default:
                    this.connectionStatusIndicator.classList.add('disconnected-indicator');
            }
        }

        // Update the status bar background class
        this.statusBarElement.className = this._getStatusClass(status);
    }

    _updateLiveUpdatesStatus(enabled) {
        if (this.liveUpdatesStatus) {
            this.liveUpdatesStatus.textContent = enabled ? 'ON' : 'PAUSED';
        }
    }

    _updateMessageCount(sentCount, receivedCount) {
        if (this.messageCount) {
            this.messageCount.textContent = (sentCount + receivedCount).toString();
        }
    }

    _updateNodeCount(count) {
        if (this.nodeCount) {
            this.nodeCount.textContent = count.toString();
        }
    }

    _updateConnectionQuality(state) {
        if (this.connectionQuality) {
            this.connectionQuality.textContent = this._getConnectionQuality(state);
        }
    }

    _getStatusClass(status) {
        const statusMap = {
            'connecting': 'status-connecting',
            'connected': 'status-connected',
            'disconnected': 'status-disconnected',
            'error': 'status-error'
        };

        return statusMap[status] ?? 'status-unknown';
    }

    _getConnectionQuality(state) {
        // For now, we'll provide a simple connection quality indicator
        // In a more advanced implementation, this could include latency, retry attempts, etc.
        if (state.connectionStatus === 'connected') {
            return 'Excellent';
        } else if (state.connectionStatus === 'connecting') {
            return 'Establishing';
        } else if (state.connectionStatus === 'disconnected') {
            return 'Poor';
        }
        return 'Unknown';
    }

    updateMessageCounts(sentCount, receivedCount) {
        this.messageSentCount = sentCount;
        this.messageReceivedCount = receivedCount;
        this._updateMessageCount(sentCount, receivedCount);
    }

    destroy() {
        this.unsubscribe?.();
    }
}