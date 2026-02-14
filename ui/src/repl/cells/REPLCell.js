export class REPLCell {
    constructor(type, content = '') {
        this.id = `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.type = type;
        this.content = content;
        this.timestamp = Date.now();
        this.element = null;
    }

    render() {
        throw new Error('REPLCell.render() must be implemented by subclass');
    }

    destroy() {
        this.element?.parentNode?.removeChild(this.element);
    }

    _createActionBtn(icon, title, onClick) {
        // Keeping this for non-Toolbar usages (like absolute positioned actions)
        const btn = document.createElement('button');
        btn.innerHTML = icon;
        btn.title = title;
        btn.style.cssText = 'background: transparent; border: none; cursor: pointer; color: #ccc; font-size: 1em; padding: 0 2px;';
        btn.onclick = (e) => {
            e.stopPropagation();
            onClick(e);
        };
        return btn;
    }
}
