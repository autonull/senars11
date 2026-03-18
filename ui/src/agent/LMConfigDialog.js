import { Component } from '../components/Component.js';
import { FluentUI } from '../utils/FluentUI.js';

export class LMConfigDialog extends Component {
    constructor(container, options = {}) {
        super(container);
        this.onSave = options.onSave;
        this.onCancel = options.onCancel;
        this.config = this._loadConfig();

        this.providers = [
            { id: 'webllm', name: 'WebLLM (Browser)' },
            { id: 'transformers', name: 'Transformers.js (Browser)' },
            { id: 'openai', name: 'OpenAI (API)' },
            { id: 'anthropic', name: 'Anthropic (API)' },
            { id: 'ollama', name: 'Ollama (Local)' }
        ];
    }

    _loadConfig() {
        try {
            const saved = localStorage.getItem('senars-lm-config');
            return saved ? JSON.parse(saved) : this._getDefaultConfig();
        } catch (e) {
            console.warn('Failed to load config:', e);
            return this._getDefaultConfig();
        }
    }

    _getDefaultConfig() {
        return {
            provider: 'webllm',
            modelName: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
            apiKey: '',
            baseUrl: ''
        };
    }

    _saveConfig() {
        try {
            localStorage.setItem('senars-lm-config', JSON.stringify(this.config));
            if (this.onSave) this.onSave(this.config);
            this.close();
        } catch (e) {
            console.error('Failed to save config:', e);
            alert('Failed to save configuration');
        }
    }

    render() {
        // Remove existing dialog if any
        const existing = document.getElementById('lm-config-overlay');
        if (existing) existing.remove();

        const overlay = FluentUI.create('div')
            .id('lm-config-overlay')
            .class('modal-overlay')
            .style({
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                background: 'rgba(0,0,0,0.7)',
                zIndex: '2000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            });

        const dialog = FluentUI.create('div')
            .class('modal-dialog')
            .style({
                background: '#1e1e1e',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '20px',
                width: '400px',
                color: '#d4d4d4',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
            });

        // Header
        dialog.child(
            FluentUI.create('h2')
                .text('Language Model Configuration')
                .style({ marginTop: '0', borderBottom: '1px solid #333', paddingBottom: '10px' })
        );

        // Provider Selection
        this._renderField(dialog, 'Provider', 'select', {
            options: this.providers,
            value: this.config.provider,
            onChange: (e) => {
                this.config.provider = e.target.value;
                this._updateModelPlaceholder(e.target.value);
            }
        });

        // Model Name
        this.modelInput = this._renderField(dialog, 'Model Name', 'input', {
            value: this.config.modelName,
            placeholder: 'e.g. Llama-3.2-1B-Instruct-q4f16_1-MLC',
            onChange: (e) => this.config.modelName = e.target.value
        });

        // API Key
        this._renderField(dialog, 'API Key (Optional)', 'input', {
            type: 'password',
            value: this.config.apiKey,
            placeholder: 'sk-...',
            onChange: (e) => this.config.apiKey = e.target.value
        });

        // Base URL
        this._renderField(dialog, 'Base URL (Optional)', 'input', {
            value: this.config.baseUrl,
            placeholder: 'e.g. http://localhost:11434',
            onChange: (e) => this.config.baseUrl = e.target.value
        });

        // Actions
        const actions = FluentUI.create('div')
            .style({ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' });

        actions.child(
            FluentUI.create('button')
                .text('Cancel')
                .class('btn btn-secondary')
                .style({ padding: '8px 16px', background: '#333', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' })
                .on('click', () => this.close())
        );

        actions.child(
            FluentUI.create('button')
                .text('Save & Reload')
                .class('btn btn-primary')
                .style({ padding: '8px 16px', background: '#007acc', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' })
                .on('click', () => this._saveConfig())
        );

        dialog.child(actions);
        overlay.child(dialog);

        // Append to body (ignore container logic for modal)
        document.body.appendChild(overlay.dom);
        this.container = overlay.dom;
    }

    _renderField(parent, label, type, options = {}) {
        const wrapper = FluentUI.create('div').style({ marginBottom: '15px' });

        wrapper.child(FluentUI.create('label').text(label).style({ display: 'block', marginBottom: '5px', color: '#888', fontSize: '0.9em' }));

        let input;
        if (type === 'select') {
            input = FluentUI.create('select')
                .style({ width: '100%', padding: '8px', background: '#252526', border: '1px solid #3c3c3c', color: '#d4d4d4', borderRadius: '4px' })
                .on('change', options.onChange);

            options.options.forEach(opt => {
                const el = FluentUI.create('option').text(opt.name).val(opt.id);
                if (opt.id === options.value) el.attr({ selected: true });
                input.child(el);
            });
        } else {
            input = FluentUI.create('input')
                .attr({ type: options.type || 'text', placeholder: options.placeholder || '', value: options.value || '' })
                .style({ width: '100%', padding: '8px', background: '#252526', border: '1px solid #3c3c3c', color: '#d4d4d4', borderRadius: '4px', boxSizing: 'border-box' })
                .on('input', options.onChange);
        }

        wrapper.child(input);
        parent.child(wrapper);
        return input;
    }

    _updateModelPlaceholder(provider) {
        if (!this.modelInput) return;
        const placeholders = {
            webllm: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
            transformers: 'Xenova/t5-small',
            openai: 'gpt-4o',
            anthropic: 'claude-3-5-sonnet-20241022',
            ollama: 'llama3.2'
        };
        this.modelInput.attr({ placeholder: placeholders[provider] || '' });
    }

    show() {
        console.log('[LMConfigDialog] show() called');
        this.render();
        console.log('[LMConfigDialog] Rendered to DOM');
    }

    close() {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        if (this.onCancel) this.onCancel();
    }
}
