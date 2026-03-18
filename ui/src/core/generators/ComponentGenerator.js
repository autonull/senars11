/**
 * @file ComponentGenerator.js
 * @description Generate components from templates to reduce code duplication
 * 
 * Provides factory functions for creating common component patterns.
 * Reduces copy-paste and ensures consistency.
 * 
 * @example
 * // Generate a standard panel component
 * const MyPanel = ComponentGenerator.panel('my-feature', { 
 *   hasToolbar: true,
 *   hasFooter: false 
 * });
 * 
 * // Generate a widget component
 * const MyWidget = ComponentGenerator.widget('my-widget', function(data) {
 *   this.container.textContent = `Value: ${data.value}`;
 * });
 */

import { $ } from '../../utils/FluentUI.js';

export class ComponentGenerator {
    /**
     * Generate a panel component
     * @param {string} name - Panel name (used for CSS classes)
     * @param {Object} options - Panel options
     * @returns {Function} Panel class
     */
    static panel(name, options = {}) {
        const {
            hasToolbar = true,
            hasFooter = false,
            hasHeader = true
        } = options;

        return class GeneratedPanel {
            constructor(container) {
                this.container = container;
                this.name = name;
            }

            render() {
                const panel = $('div').class(`${name}-panel`, 'panel');

                if (hasHeader) {
                    const header = $('div').class('panel-header');
                    panel.child(header);
                    this.headerElement = header.element;
                }

                if (hasToolbar) {
                    const toolbar = $('div').class('panel-toolbar');
                    panel.child(toolbar);
                    this.toolbarElement = toolbar.element;
                }

                const content = $('div').class('panel-content');
                panel.child(content);
                this.contentElement = content.element;

                if (hasFooter) {
                    const footer = $('div').class('panel-footer');
                    panel.child(footer);
                    this.footerElement = footer.element;
                }

                const element = panel.build();
                this.container.appendChild(element);
                this.element = element;

                return element;
            }

            setTitle(title) {
                if (this.headerElement) {
                    this.headerElement.textContent = title;
                }
            }

            clear() {
                if (this.contentElement) {
                    this.contentElement.innerHTML = '';
                }
            }

            destroy() {
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
            }
        };
    }

    /**
     * Generate a widget component
     * @param {string} name - Widget name
     * @param {Function} updateMethod - Update method function(data)
     * @returns {Function} Widget class
     */
    static widget(name, updateMethod) {
        return class GeneratedWidget {
            constructor(container, config = {}) {
                this.container = container;
                this.name = name;
                this.config = config;
                this.data = null;
            }

            initialize() {
                this.element = $('div')
                    .class(`${name}-widget`, 'widget')
                    .build();

                this.container.appendChild(this.element);
                this.render();
            }

            render() {
                // Override in subclass or provide via config
                if (this.config.render) {
                    this.config.render.call(this);
                }
            }

            update(data) {
                this.data = data;
                updateMethod.call(this, data);
            }

            resize() {
                // Default no-op, override if needed
            }

            destroy() {
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
            }
        };
    }

    /**
     * Generate a list component
     * @param {string} name - List name
     * @param {Function} itemRenderer - Function(item) => HTMLElement
     * @returns {Function} List class
     */
    static list(name, itemRenderer) {
        return class GeneratedList {
            constructor(container) {
                this.container = container;
                this.name = name;
                this.items = [];
            }

            initialize() {
                this.element = $('div')
                    .class(`${name}-list`, 'list')
                    .child(
                        this.listElement = $('ul').class('list-items').build()
                    )
                    .build();

                this.container.appendChild(this.element);
            }

            setItems(items) {
                this.items = items;
                this.render();
            }

            addItem(item) {
                this.items.push(item);
                this.renderItem(item);
            }

            render() {
                this.listElement.innerHTML = '';
                this.items.forEach(item => this.renderItem(item));
            }

            renderItem(item) {
                const itemElement = itemRenderer.call(this, item);
                const li = $('li').class('list-item').child(itemElement).build();
                this.listElement.appendChild(li);
            }

            clear() {
                this.items = [];
                this.listElement.innerHTML = '';
            }

            destroy() {
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
            }
        };
    }

    /**
     * Generate a modal dialog component
     * @param {string} name - Modal name
     * @param {Object} options - Modal options
     * @returns {Function} Modal class
     */
    static modal(name, options = {}) {
        const {
            closeOnOverlayClick = true,
            closeOnEscape = true
        } = options;

        return class GeneratedModal {
            constructor(title, content) {
                this.name = name;
                this.title = title;
                this.content = content;
                this.isOpen = false;
            }

            show() {
                if (this.isOpen) return;

                this.overlay = $('div')
                    .class('modal-overlay')
                    .on('click', (e) => {
                        if (closeOnOverlayClick && e.target === this.overlay) {
                            this.hide();
                        }
                    })
                    .child(
                        this.modal = $('div')
                            .class('modal', `${name}-modal`)
                            .child(
                                $('div').class('modal-header').child(
                                    $('h2').text(this.title),
                                    $('button')
                                        .class('close-btn')
                                        .text('×')
                                        .on('click', () => this.hide())
                                ),
                                $('div').class('modal-content').child(this.content)
                            )
                            .build()
                    )
                    .build();

                document.body.appendChild(this.overlay);
                this.isOpen = true;

                if (closeOnEscape) {
                    this.escapeHandler = (e) => {
                        if (e.key === 'Escape') this.hide();
                    };
                    document.addEventListener('keydown', this.escapeHandler);
                }
            }

            hide() {
                if (!this.isOpen) return;

                if (this.overlay && this.overlay.parentNode) {
                    this.overlay.parentNode.removeChild(this.overlay);
                }

                if (this.escapeHandler) {
                    document.removeEventListener('keydown', this.escapeHandler);
                }

                this.isOpen = false;
            }

            destroy() {
                this.hide();
            }
        };
    }

    /**
     * Generate a form component
     * @param {string} name - Form name
     * @param {Array} fields - Field definitions
     * @returns {Function} Form class
     */
    static form(name, fields) {
        return class GeneratedForm {
            constructor(container, onSubmit) {
                this.container = container;
                this.name = name;
                this.onSubmit = onSubmit;
                this.fields = fields;
            }

            initialize() {
                this.element = $('form')
                    .class(`${name}-form`, 'form')
                    .on('submit', (e) => this.handleSubmit(e))
                    .each(fields, (field) => this.renderField(field))
                    .child(
                        $('div').class('form-actions').child(
                            $('button')
                                .attr('type', 'submit')
                                .class('submit-btn')
                                .text('Submit')
                        )
                    )
                    .build();

                this.container.appendChild(this.element);
            }

            renderField(field) {
                return $('div')
                    .class('form-group')
                    .child(
                        $('label')
                            .attr('for', field.name)
                            .text(field.label),
                        $('input')
                            .attr('type', field.type || 'text')
                            .attr('name', field.name)
                            .attr('id', field.name)
                            .apply(b => {
                                if (field.required) b.attr('required', 'required');
                                if (field.placeholder) b.attr('placeholder', field.placeholder);
                            })
                    );
            }

            handleSubmit(e) {
                e.preventDefault();
                const formData = new FormData(this.element);
                const data = Object.fromEntries(formData.entries());

                if (this.onSubmit) {
                    this.onSubmit(data);
                }
            }

            getValue(fieldName) {
                return this.element.elements[fieldName]?.value;
            }

            setValue(fieldName, value) {
                const field = this.element.elements[fieldName];
                if (field) field.value = value;
            }

            reset() {
                this.element.reset();
            }

            destroy() {
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
            }
        };
    }
}
