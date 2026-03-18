import {expect} from '@playwright/test';

export class NarPage {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        this.page = page;
        this.commandInput = page.locator('#command-input');
        this.sendButton = page.locator('#send-button');
        this.logsContainer = page.locator('#logs-container');
        this.connectionStatus = page.locator('#connection-status');
        this.graphContainer = page.locator('#graph-container');
        this.sidebarPanel = page.locator('#sidebar-panel');
        this.toggleSidebarBtn = page.locator('#btn-toggle-sidebar');
        this.refreshGraphBtn = page.locator('#refresh-graph');
        this.resetBtn = page.locator('#btn-reset');
        this.confirmResetBtn = page.locator('#btn-confirm-reset');
    }

    async goto() {
        await this.page.goto('/ide.html');
    }

    async waitForConnection() {
        await expect(this.connectionStatus).toContainText('Connected', {ignoreCase: true, timeout: 15000});
    }

    /**
     * @param {string} command
     */
    async sendCommand(command) {
        await this.commandInput.fill(''); // Clear first
        await this.commandInput.fill(command);
        await this.sendButton.click({force: true});
    }

    /**
     * @param {string} text
     * @param {number} [timeout=5000]
     */
    async expectLog(text, timeout = 5000) {
        await expect(this.logsContainer).toContainText(text, {timeout, ignoreCase: true});
    }

    async ensureSidebarOpen() {
        if (!(await this.sidebarPanel.isVisible())) {
            await this.toggleSidebarBtn.click();
            await expect(this.sidebarPanel).toBeVisible();
        }
    }

    async checkGraphHasContent() {
        await this.ensureSidebarOpen();
        await expect(this.graphContainer).toBeVisible();
    }

    async clearLogs() {
        await this.sendCommand('/clear');
        await expect(this.logsContainer).toContainText('Cleared logs', {timeout: 10000, ignoreCase: true});
    }

    async refreshGraph() {
        await this.ensureSidebarOpen();
        await this.refreshGraphBtn.click({force: true});
        await this.page.waitForTimeout(100);
        await this.expectLog('Graph refresh requested', 10000);
    }

    async resetSystem() {
        await this.resetBtn.click();
        await expect(this.confirmResetBtn).toBeVisible();
        await this.confirmResetBtn.click();
        await this.expectLog('System Reset', 10000);
    }
}
