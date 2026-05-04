/**
 * Extract variables from a state representation
 * @param {Array|Object|*} state - State as array, object, or primitive
 * @returns {Object} Variable map
 */
export const extractVariables = (state) => {
    if (Array.isArray(state)) {
        return Object.fromEntries(state.map((v, i) => [`var_${i}`, v]));
    }
    if (typeof state === 'object' && state !== null) {
        return state;
    }
    return {value: state};
};
