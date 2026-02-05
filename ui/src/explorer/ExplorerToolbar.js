// Deprecated. Moved to StatusBar menus.
export class ExplorerToolbar {
    constructor() {
        this.container = null;
    }
    render() {
        if (this.container) {
            this.container.innerHTML = '<!-- Toolbar moved to Status Bar -->';
            this.container.style.display = 'none';
        }
    }
}
