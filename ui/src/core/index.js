/**
 * @file index.js
 * @description Core infrastructure barrel export
 * 
 * Provides centralized access to all core metaprogramming utilities.
 */

// Reactive state management
export { ReactiveState } from './ReactiveState.js';

// Dependency injection
export { ServiceContainer, container } from './ServiceContainer.js';

// Event bus
export { EventBus, eventBus } from './EventBus.js';

// Decorators
export {
    inject,
    autobind,
    defineEventHandlers,
    mixin,
    debounce,
    throttle,
    memoize,
    validate,
    validators
} from './decorators.js';

// Fluent UI builder (from utils/FluentUI.js)
export {
    FluentUI,
    $,
    div,
    span,
    button,
    input,
    label,
    h1,
    h2,
    h3,
    p,
    a,
    img,
    list,
    table,
    form
} from '../utils/FluentUI.js';

// Component generators
export { ComponentGenerator } from './generators/ComponentGenerator.js';
