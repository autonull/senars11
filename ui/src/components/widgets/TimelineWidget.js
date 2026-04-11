import { Component } from '../Component.js';
import { FluentUI } from '../../utils/FluentUI.js';

export class TimelineWidget extends Component {
    constructor(container, data = {}) {
        super(container);
        this.events = data.events || [];
    }

    render() {
        if (!this.container) {return;}

        this.fluent().clear().class('timeline-widget')
            .style({
                padding: '10px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '4px',
                width: '100%',
                border: '1px solid var(--border-color)',
                overflowX: 'auto'
            });

        // Header
        this.fluent().child(
            FluentUI.create('div')
                .text('Event Timeline')
                .style({
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: 'var(--text-muted)',
                    marginBottom: '12px',
                    textTransform: 'uppercase'
                })
        );

        // Timeline Container
        const timeline = FluentUI.create('div')
            .class('timeline-track')
            .style({
                position: 'relative',
                height: '60px',
                borderBottom: '2px solid #555',
                display: 'flex',
                alignItems: 'flex-end',
                paddingBottom: '5px',
                minWidth: '100%'
            });

        if (this.events.length === 0) {
            // Demo data if empty
            this.events = [
                { time: 0, label: 'Start', color: '#00ff9d' },
                { time: 5, label: 'Reasoning', color: '#00d4ff' },
                { time: 10, label: 'Conclusion', color: '#ffcc00' }
            ];
        }

        const maxTime = Math.max(...this.events.map(e => e.time), 10);

        this.events.forEach(event => {
            const leftPercent = (event.time / maxTime) * 95; // 95% to avoid edge clipping

            const item = FluentUI.create('div')
                .class('timeline-item')
                .style({
                    position: 'absolute',
                    left: `${leftPercent}%`,
                    bottom: '0',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    transform: 'translateX(-50%)'
                });

            // Dot
            item.child(
                FluentUI.create('div')
                    .style({
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: event.color || '#fff',
                        marginBottom: '4px',
                        border: '2px solid #2d2d2d'
                    })
            );

            // Label
            item.child(
                FluentUI.create('span')
                    .text(event.label)
                    .style({
                        fontSize: '10px',
                        color: '#ccc',
                        whiteSpace: 'nowrap',
                        background: 'rgba(0,0,0,0.5)',
                        padding: '2px 4px',
                        borderRadius: '3px'
                    })
            );

            timeline.child(item);
        });

        this.fluent().child(timeline);
    }
}
