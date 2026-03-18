import { FluentUI } from '../../utils/FluentUI.js';

export class VariableInspector {
    constructor(container, data = {}) {
        this.container = container;
        this.data = data.variables || {};
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        FluentUI.create('div')
            .class('variable-inspector')
            .style({ padding: '10px', color: '#ccc' })
            .child(
                FluentUI.create('h3').text('Variables (Placeholder)'),
                FluentUI.create('pre').text(JSON.stringify(this.data, null, 2))
            )
            .mount(this.container);
    }
}
