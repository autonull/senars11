/**
 * Utility Module Index
 * Centralized exports for all utility modules.
 */

// Action utilities
export * from './ActionUtils.js';
export { default as ActionUtils } from './ActionUtils.js';

// Model factory
export * from './ModelFactory.js';
export { default as ModelFactory } from './ModelFactory.js';
export { default as ModelUtils } from './ModelFactory.js';

// State utilities
export * from './StateUtils.js';
export { default as StateUtils } from './StateUtils.js';

// Loss utilities
export * from './LossUtils.js';
export { default as LossUtils } from './LossUtils.js';

// Belief system
export * from './BeliefSystem.js';
export { default as BeliefUtils } from './BeliefSystem.js';
export { Belief, BeliefSystem } from './BeliefSystem.js';

/**
 * Combined utilities namespace
 */
export const Utils = {
    Action: await import('./ActionUtils.js').then(m => m.ActionUtils),
    Model: await import('./ModelFactory.js').then(m => m.ModelUtils),
    State: await import('./StateUtils.js').then(m => m.StateUtils),
    Loss: await import('./LossUtils.js').then(m => m.LossUtils),
    Belief: await import('./BeliefSystem.js').then(m => m.BeliefUtils)
};

export default Utils;
