/**
 * FormComponents - Abstracted form components for consistent UI patterns
 */

/**
 * Base form input component
 */
export class BaseFormInput {
  constructor(type, options = {}) {
    this.type = type;
    this.options = options;
    this.element = this._createInput();
    this._attachEventListeners();
  }

  _createInput() {
    const input = document.createElement('input');
    input.type = this.type;
    input.name = this.options.name || '';
    input.placeholder = this.options.placeholder || '';
    input.value = this.options.value || '';
    input.disabled = this.options.disabled || false;
    input.required = this.options.required || false;

    // Apply CSS classes for consistent styling
    input.className = this.options.className || 'form-input';
    
    // Add validation if specified
    if (this.options.pattern) {
      input.pattern = this.options.pattern;
    }
    if (this.options.min) {
      input.min = this.options.min;
    }
    if (this.options.max) {
      input.max = this.options.max;
    }

    return input;
  }

  _attachEventListeners() {
    if (this.options.onChange) {
      this.element.addEventListener('change', this.options.onChange);
    }
    
    if (this.options.onInput) {
      this.element.addEventListener('input', this.options.onInput);
    }
    
    if (this.options.onFocus) {
      this.element.addEventListener('focus', this.options.onFocus);
    }
    
    if (this.options.onBlur) {
      this.element.addEventListener('blur', this.options.onBlur);
    }
  }

  getValue() {
    return this.element.value;
  }

  setValue(value) {
    this.element.value = value;
  }

  setDisabled(disabled) {
    this.element.disabled = disabled;
  }

  validate() {
    if (this.options.required && !this.element.value) {
      return { valid: false, message: 'This field is required' };
    }
    
    if (this.options.pattern && this.element.value && !new RegExp(this.options.pattern).test(this.element.value)) {
      return { valid: false, message: 'Invalid format' };
    }
    
    return { valid: true };
  }
}

/**
 * Text input component
 */
export class TextInput extends BaseFormInput {
  constructor(options = {}) {
    super('text', { ...options, className: `form-input text-input ${options.className || ''}` });
  }
}

/**
 * Number input component
 */
export class NumberInput extends BaseFormInput {
  constructor(options = {}) {
    super('number', {
      ...options,
      className: `form-input number-input ${options.className || ''}`,
      min: options.min || 0,
      max: options.max || 100,
      step: options.step || 1
    });
  }
}

/**
 * Dropdown/Select component
 */
export class Dropdown {
  constructor(options = {}) {
    this.options = options;
    this.element = this._createDropdown();
    this._attachEventListeners();
  }

  _createDropdown() {
    const select = document.createElement('select');
    select.name = this.options.name || '';
    select.disabled = this.options.disabled || false;
    select.multiple = this.options.multiple || false;
    
    // Apply CSS classes for consistent styling
    select.className = `form-select ${this.options.className || ''}`;

    // Add options
    if (this.options.options) {
      this.options.options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value || option;
        optionElement.textContent = option.text || option.label || option;
        optionElement.selected = option.selected || false;
        select.appendChild(optionElement);
      });
    }

    return select;
  }

  _attachEventListeners() {
    if (this.options.onChange) {
      this.element.addEventListener('change', this.options.onChange);
    }
  }

  getValue() {
    return this.element.value;
  }

  setValue(value) {
    this.element.value = value;
  }

  setOptions(options) {
    // Clear existing options
    this.element.innerHTML = '';
    
    // Add new options
    options.forEach(option => {
      const optionElement = document.createElement('option');
      optionElement.value = option.value || option;
      optionElement.textContent = option.text || option.label || option;
      this.element.appendChild(optionElement);
    });
  }

  setDisabled(disabled) {
    this.element.disabled = disabled;
  }

  getSelectedOptions() {
    if (this.element.multiple) {
      return Array.from(this.element.selectedOptions).map(option => option.value);
    }
    return this.element.value;
  }
}

/**
 * Button component with consistent styling
 */
export class Button {
  constructor(options = {}) {
    this.options = options;
    this.element = this._createButton();
    this._attachEventListeners();
  }

  _createButton() {
    const button = document.createElement('button');
    button.type = this.options.type || 'button';
    button.textContent = this.options.text || '';
    button.disabled = this.options.disabled || false;
    
    // Apply CSS classes for consistent styling
    button.className = `btn ${this.options.variant || 'btn-primary'} ${this.options.className || ''}`;
    
    if (this.options.icon) {
      const icon = document.createElement('span');
      icon.innerHTML = this.options.icon;
      button.insertBefore(icon, button.firstChild);
    }

    return button;
  }

  _attachEventListeners() {
    if (this.options.onClick) {
      this.element.addEventListener('click', this.options.onClick);
    }
    
    if (this.options.onMouseEnter) {
      this.element.addEventListener('mouseenter', this.options.onMouseEnter);
    }
    
    if (this.options.onMouseLeave) {
      this.element.addEventListener('mouseleave', this.options.onMouseLeave);
    }
  }

  setText(text) {
    this.element.textContent = text;
  }

  setDisabled(disabled) {
    this.element.disabled = disabled;
  }

  setVariant(variant) {
    // Remove all variant classes
    this.element.className = this.element.className.replace(/btn-\w+/g, '');
    // Add the new variant
    this.element.classList.add(`btn-${variant}`);
  }
}

/**
 * Toolbar component
 */
export class Toolbar {
  constructor(options = {}) {
    this.options = options;
    this.buttons = [];
    this.element = this._createToolbar();
  }

  _createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = `toolbar ${this.options.className || ''}`;
    
    if (this.options.buttons) {
      this.options.buttons.forEach(btnConfig => {
        const button = new Button(btnConfig);
        this.buttons.push(button);
        toolbar.appendChild(button.element);
      });
    }
    
    return toolbar;
  }

  addButton(config) {
    const button = new Button(config);
    this.buttons.push(button);
    this.element.appendChild(button.element);
    return button;
  }

  removeButton(button) {
    const index = this.buttons.indexOf(button);
    if (index > -1) {
      this.buttons.splice(index, 1);
      button.element.remove();
    }
  }

  clear() {
    this.buttons.forEach(button => button.element.remove());
    this.buttons = [];
  }
}

/**
 * Form group component to wrap labels and inputs together
 */
export class FormGroup {
  constructor(options = {}) {
    this.options = options;
    this.element = this._createFormGroup();
  }

  _createFormGroup() {
    const group = document.createElement('div');
    group.className = `form-group ${this.options.className || ''}`;

    // Add label if provided
    if (this.options.label) {
      const label = document.createElement('label');
      label.textContent = this.options.label;
      label.className = 'form-label';
      if (this.options.inputId) {
        label.setAttribute('for', this.options.inputId);
      }
      group.appendChild(label);
    }

    // Add input element
    if (this.options.input) {
      group.appendChild(this.options.input.element || this.options.input);
    }

    // Add help text if provided
    if (this.options.helpText) {
      const helpText = document.createElement('div');
      helpText.textContent = this.options.helpText;
      helpText.className = 'form-help-text';
      group.appendChild(helpText);
    }

    // Add error message container
    this.errorElement = document.createElement('div');
    this.errorElement.className = 'form-error-message';
    this.errorElement.style.display = 'none';
    group.appendChild(this.errorElement);

    return group;
  }

  showError(message) {
    this.errorElement.textContent = message;
    this.errorElement.style.display = 'block';
    this.element.classList.add('form-group-error');
  }

  hideError() {
    this.errorElement.style.display = 'none';
    this.element.classList.remove('form-group-error');
  }

  setInput(input) {
    // Remove existing input if any
    const inputPlaceholder = this.element.querySelector('.form-input, .form-select, input, select');
    if (inputPlaceholder) {
      inputPlaceholder.remove();
    }
    
    // Add new input
    this.element.appendChild(input.element || input);
  }
}