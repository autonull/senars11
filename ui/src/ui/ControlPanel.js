/**
 * ControlPanel handles playback controls, input mode switching, and sidebar management
 */
export class ControlPanel {
    static ICONS = {
        PLAY: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
        PAUSE: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
        STEP: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>'
    };

    constructor(uiElements, commandProcessor, logger) {
        this.uiElements = uiElements;
        this.commandProcessor = commandProcessor;
        this.logger = logger;
        this.inputMode = 'narsese';
        this.isRunning = false;
        this.isSidebarVisible = false;
    }

    initialize() {
        this._setupToolbar();
        this._setupInputMode();
        this._setupSaveLoad();
        this._setupSidebar();
        this._setupResetModal();
        this._updatePlaybackControls();
    }

    _setupToolbar() {
        const { btnPlayPause, btnStep, btnReset } = this.uiElements.getAll();

        btnPlayPause?.addEventListener('click', () => this._togglePlayback());

        btnStep?.addEventListener('click', () => {
            if (!this.isRunning) {
                this.commandProcessor.executeControlCommand('control/step');
                this.logger.log('Stepping...', 'debug', '⏯️');
            }
        });

        btnReset?.addEventListener('click', () => this._showResetModal());
    }

    _togglePlayback() {
        if (this.isRunning) {
            this.commandProcessor.executeControlCommand('control/stop');
            this.logger.log('System paused', 'info', '⏸️');
        } else {
            this.commandProcessor.executeControlCommand('control/start');
            this.logger.log('System started', 'info', '▶️');
        }
        this.isRunning = !this.isRunning;
        this._updatePlaybackControls();
    }

    _updatePlaybackControls() {
        const { btnPlayPause, btnStep } = this.uiElements.getAll();

        if (btnPlayPause) {
            btnPlayPause.innerHTML = this.isRunning ? ControlPanel.ICONS.PAUSE : ControlPanel.ICONS.PLAY;
            const label = this.isRunning ? 'Pause' : 'Run Continuous';
            btnPlayPause.title = label;
            btnPlayPause.setAttribute('aria-label', label);
        }

        if (btnStep) {
            if (!btnStep.innerHTML.includes('<svg')) {
                btnStep.innerHTML = ControlPanel.ICONS.STEP;
            }
            btnStep.disabled = this.isRunning;
            btnStep.style.opacity = this.isRunning ? '0.5' : '1';
            btnStep.title = 'Step Forward';
            btnStep.setAttribute('aria-label', 'Step Forward');
        }
    }

    _setupSidebar() {
        const { btnToggleSidebar, btnCloseSidebar } = this.uiElements.getAll();
        btnToggleSidebar?.addEventListener('click', () => this.toggleSidebar());
        btnCloseSidebar?.addEventListener('click', () => this.toggleSidebar(false));
    }

    toggleSidebar(show) {
        const { sidebarPanel, btnToggleSidebar } = this.uiElements.getAll();
        if (!sidebarPanel) return;

        this.isSidebarVisible = show ?? !this.isSidebarVisible;
        sidebarPanel.classList.toggle('hidden', !this.isSidebarVisible);
        btnToggleSidebar?.classList.toggle('active', this.isSidebarVisible);

        // Enable/Disable graph updates based on visibility
        this.commandProcessor.graphManager?.setUpdatesEnabled(this.isSidebarVisible);

        // Toggle Metrics collection on demand
        this.commandProcessor.processCommand(this.isSidebarVisible ? '/metrics on' : '/metrics off');
    }

    _setupResetModal() {
        const { confirmationModal, btnConfirmReset, btnCancelReset } = this.uiElements.getAll();

        btnConfirmReset?.addEventListener('click', () => {
            this.commandProcessor.executeControlCommand('control/reset');
            this.logger.log('System reset', 'warning', '🔄');
            this._hideResetModal();
            if (this.isRunning) {
                this.isRunning = false;
                this._updatePlaybackControls();
            }
            this.updateCycleCount(0);
        });

        btnCancelReset?.addEventListener('click', () => this._hideResetModal());

        confirmationModal?.addEventListener('click', (e) => {
            if (e.target === confirmationModal) this._hideResetModal();
        });
    }

    _showResetModal() {
        this.uiElements.getAll().confirmationModal?.classList.remove('hidden');
    }

    _hideResetModal() {
        this.uiElements.getAll().confirmationModal?.classList.add('hidden');
    }

    _setupInputMode() {
        const { inputModeNarsese, inputModeAgent } = this.uiElements.getAll();

        const handleModeChange = (e) => {
            if (e.target.checked) {
                this.inputMode = e.target.value;
                this.logger.log(`Input mode switched to: ${this.inputMode.toUpperCase()}`, 'info', '⚙️');
            }
        };

        inputModeNarsese?.addEventListener('change', handleModeChange);
        inputModeAgent?.addEventListener('change', handleModeChange);
    }

    _setupSaveLoad() {
        const { btnSave, btnLoad } = this.uiElements.getAll();
        btnSave?.addEventListener('click', () => this.commandProcessor.processCommand('/save'));
        btnLoad?.addEventListener('click', () => this.commandProcessor.processCommand('/load'));
    }

    updateCycleCount(count) {
        const { cycleCount } = this.uiElements.getAll();
        if (cycleCount) cycleCount.textContent = `Cycle: ${count}`;
    }

    getInputMode() {
        return this.inputMode;
    }
}
