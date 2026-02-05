/**
 * TermUtils.js
 *
 * Provides a consistent API for common term operations, abstracting away
 * direct property access and providing null-safety.
 */

/**
 * Checks if two terms are equal.
 * @param {Term} t1 - First term
 * @param {Term} t2 - Second term
 * @returns {boolean} True if terms are equal
 */
export const termsEqual = (t1, t2) => t1 === t2 || (t1?.equals?.(t2) ?? false);

/**
 * Checks if a term is a variable.
 * @param {Term} term - The term to check
 * @returns {boolean} True if the term is a variable
 */
export const isVariable = (term) => term?.isVariable || term?.name?.startsWith('$') || false;

/**
 * Checks if a term is a compound term.
 * @param {Term} term - The term to check
 * @returns {boolean} True if the term is compound
 */
export const isCompound = (term) => term?.isCompound ?? false;

/**
 * Checks if a term is an atomic term.
 * @param {Term} term - The term to check
 * @returns {boolean} True if the term is atomic
 */
export const isAtomic = (term) => term?.isAtomic ?? false;

/**
 * Gets the components of a term.
 * @param {Term} term - The term
 * @returns {Array<Term>} The components array, or empty array if none
 */
export const getComponents = (term) => term?.components ?? [];

/**
 * Gets the operator of a term.
 * @param {Term} term - The term
 * @returns {string|null} The operator, or null if none
 */
export const getOperator = (term) => term?.operator ?? null;

/**
 * Checks if a term has a specific operator.
 * @param {Term} term - The term
 * @param {string} op - The operator to check for
 * @returns {boolean} True if the term has the operator
 */
export const hasOperator = (term, op) => term?.operator === op;

/**
 * Gets the variable name of a term.
 * @param {Term} term - The term
 * @returns {string} The variable name, or 'unknown'
 */
export const getVariableName = (term) => term?.name || term?._name || 'unknown';
