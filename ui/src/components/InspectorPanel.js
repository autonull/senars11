import { Component } from './Component.js';
import { ConceptCard } from './ConceptCard.js';
import { DerivationWidget } from './widgets/DerivationWidget.js';
import { FluentUI, $, div, span, button, input, h3, h4, pre } from '../utils/FluentUI.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';

export class InspectorPanel extends Component {
    constructor(container) {
        super(container);
        this.currentData = null;
        this.onSave = null;
        this.onQuery = null;
        this.onTrace = null;
        this.onSelect = null;
    }

    render() {
        if (!this.container) return;

        const root = $(this.container).clear();

        const panel = div()
            .id('inspector-panel')
            .class('hud-panel', 'inspector-panel', 'hidden')
            .mount(root);

        h3('Inspector').mount(panel);

        this.contentContainer = div()
            .id('inspector-content')
            .mount(panel);

        div().class('inspector-empty').text('Select a node to inspect').mount(this.contentContainer);

        button('Close')
            .id('btn-close-inspector')
            .class('btn', 'small-btn')
            .on('click', () => this.hide())
            .mount(panel);
    }

    show() {
        const panel = $(this.container).dom.querySelector('#inspector-panel');
        if (panel) panel.classList.remove('hidden');
    }

    hide() {
        const panel = $(this.container).dom.querySelector('#inspector-panel');
        if (panel) panel.classList.add('hidden');
    }

    update(data, mode = 'visualization') {
        this.currentData = data;
        if (!this.contentContainer) return;

        this.contentContainer.clear();
        this.show();

        this._renderActions(data);
        this._renderHeader(data);
        this._renderTruth(data);
        if (data.derivation) this._renderDerivationWidget(data.derivation, data.term || data.id);
        this._renderRelated(data);
        this._renderProperties(data, mode);
    }

    _renderActions(data) {
        const actions = div().class('inspector-actions').mount(this.contentContainer);

        button('🔍').class('btn', 'action-btn').attr('title', 'Query')
            .on('click', () => this._handleQuery())
            .mount(actions);

        button('🎯').class('btn', 'action-btn').attr('title', 'Focus in Graph')
            .on('click', () => this.onSelect?.(data.id))
            .mount(actions);

        if (data.derivation) {
            button('🔗').class('btn', 'action-btn').attr('title', 'Trace Derivation')
                .on('click', () => this.onTrace?.(data.id))
                .mount(actions);
        }
    }

    _renderHeader(data) {
        const conceptData = {
            term: data.term || data.id,
            budget: data.budget,
            tasks: data.tasks || [],
            taskCount: data.taskCount,
            id: data.id
        };

        const cardWrapper = div().style({ marginBottom: '10px' }).mount(this.contentContainer);
        new ConceptCard(cardWrapper.dom, conceptData, { compact: false }).render();
    }

    _renderTruth(data) {
        if (!data.truth) return;

        const { frequency, confidence } = data.truth;
        const section = div().class('inspector-section').mount(this.contentContainer);
        h4('Truth Value').mount(section);

        const createBar = (label, val, color) => {
            const row = div().class('prop-row').style({ display: 'block', paddingBottom: '4px' }).mount(section);
            const info = div().style({ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }).mount(row);
            span().class('prop-label', 'small').text(label).mount(info);
            span().class('prop-value', 'small').text((val || 0).toFixed(2)).mount(info);

            const bar = div().class('progress-bar').mount(row);
            div().class('progress-fill')
                .style({ width: `${(val || 0) * 100}%`, backgroundColor: color })
                .mount(bar);
        };

        createBar('Frequency', frequency, 'var(--accent-primary)');
        createBar('Confidence', confidence, 'var(--accent-secondary)');
    }

    _renderRelated(data) {
        const related = data.links || [];
        const relSection = div().class('inspector-section').mount(this.contentContainer);
        h4('Related').mount(relSection);
        const tags = div().class('related-tags').mount(relSection);

        if (related.length) {
            related.forEach(r => {
                span()
                    .class('related-tag', 'clickable-tag')
                    .attr('title', `Focus ${r}`)
                    .text(r)
                    .on('click', () => this.onSelect?.(r))
                    .mount(tags);
            });
        } else {
            span().class('prop-value-dim').text('No direct links').mount(tags);
        }
    }

    _renderProperties(data, mode) {
        const isControl = (mode === 'control');
        const fields = this._getEditableFields(data);

        if (data.fullData) {
            const section = div().class('inspector-section', 'collapsed').mount(this.contentContainer);
            h4('Internal State ▶').on('click', () => section.dom.classList.toggle('collapsed')).mount(section);
            pre().class('internal-state-code').text(JSON.stringify(data.fullData, null, 2)).mount(section);
        }

        fields.forEach(field => {
            const { key, value, type, path } = field;
            const row = div().class('prop-row').mount(this.contentContainer);
            span().class('prop-label').text(key).mount(row);

            if (isControl) {
                const inputType = type === 'number' ? 'number' : 'text';
                const step = type === 'number' ? '0.01' : '';
                input(inputType)
                    .class('prop-input')
                    .attr('step', step)
                    .data('path', path)
                    .val(value)
                    .mount(row);
            } else {
                if (key === 'term' || key === 'label') {
                     span().class('prop-value').html(NarseseHighlighter.highlight(String(value))).mount(row);
                } else {
                     const displayVal = typeof value === 'number' ? value.toFixed(3) : value;
                     span().class('prop-value').text(String(displayVal)).mount(row);
                }
            }
        });

        if (isControl) {
            const btnRow = div().style({ marginTop: '10px', textAlign: 'right' }).mount(this.contentContainer);
            button('Save Changes')
                .id('btn-inspector-save')
                .class('btn', 'small-btn')
                .on('click', () => this._handleSave())
                .mount(btnRow);
        }
    }

    _renderDerivationWidget(derivation, term) {
        const section = div().class('inspector-section').mount(this.contentContainer);
        h4('Derivation Trace').mount(section);

        const widgetContainer = div()
            .style({
                height: '180px',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(0, 255, 157, 0.1)',
                borderRadius: '4px',
                position: 'relative'
            })
            .mount(section);

        const widgetData = {
            rule: derivation.rule,
            derived: { term },
            input: derivation.input || (derivation.sources?.[0] ? { term: derivation.sources[0] } : null),
            knowledge: derivation.knowledge || (derivation.sources?.[1] ? { term: derivation.sources[1] } : null)
        };

        const widget = new DerivationWidget(widgetContainer.dom, widgetData);
        requestAnimationFrame(() => widget.render());
    }

    _handleQuery() {
        if (this.onQuery && this.currentData) {
            this.onQuery(this.currentData.id || this.currentData.term);
        }
    }

    _getEditableFields(data) {
        let fields = [];
        const priorityKeys = ['term', 'label', 'type'];

        priorityKeys.forEach(k => {
            if (data[k] !== undefined) fields.push({ key: k, value: data[k], type: typeof data[k], path: k });
        });

        if (data.budget) {
            ['priority', 'durability', 'quality'].forEach(k => {
                if (data.budget[k] !== undefined) fields.push({ key: `budget.${k}`, value: data.budget[k], type: 'number', path: `budget.${k}` });
            });
        }

        if (data.truth) {
            ['frequency', 'confidence'].forEach(k => {
                if (data.truth[k] !== undefined) fields.push({ key: `truth.${k}`, value: data.truth[k], type: 'number', path: `truth.${k}` });
            });
        }

        const ignored = new Set(['weight', 'id', 'budget', 'truth', 'fullData', 'tasks', 'links', 'derivation']);

        for (const [key, value] of Object.entries(data)) {
            if (ignored.has(key) || priorityKeys.includes(key)) continue;

            if (value && typeof value === 'object') {
                let strVal = '[Object]';
                try { strVal = JSON.stringify(value); } catch (e) { strVal = '[Circular/Error]'; }
                fields.push({ key: key, value: strVal, type: 'object', path: key });
            } else {
                fields.push({ key, value, type: typeof value, path: key });
            }
        }

        return fields;
    }

    _handleSave() {
        if (!this.onSave || !this.currentData) return;

        const inputs = this.container.querySelectorAll('.prop-input');
        const updates = {};

        inputs.forEach(input => {
            const { path } = input.dataset;
            const value = input.type === 'number' ? parseFloat(input.value) : input.value;
            this._setDeep(updates, path, value);
        });

        this.onSave(this.currentData.id, updates);
    }

    _setDeep(obj, path, value) {
        const parts = path.split('.');
        const last = parts.pop();
        const target = parts.reduce((acc, part) => acc[part] = acc[part] || {}, obj);
        target[last] = value;
    }
}
