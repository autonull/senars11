import { FluentUI } from '../../utils/FluentUI.js';

export class TimelineWidget {
    constructor(container, data = {}) {
        this.container = container;
        this.data = data.events || [];
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        FluentUI.create('div')
            .class('timeline-widget')
            .style({ padding: '10px', color: '#ccc' })
            .child(
                FluentUI.create('h3').text('Timeline (Placeholder)'),
                FluentUI.create('div').text(`${this.data.length} events recorded.`)
            )
            .mount(this.container);
    }
}
