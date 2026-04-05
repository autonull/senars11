/**
 * ArithmeticOps.js - Arithmetic operations
 */

import {exp, sym} from '../Term.js';
import {OperationHelpers} from './OperationHelpers.js';

export function registerArithmeticOps(registry) {
    // Register basic arithmetic operations
    registry.register('&+', createReduceOp((a, b) => a + b, 0));
    registry.register('&*', createReduceOp((a, b) => a * b, 1));
    registry.register('&%', createBinaryOp((a, b) => a % b, true)); // Check division by zero

    // Custom logic for - and / to handle unary/binary
    registry.register('&-', createUnaryBinaryOp(x => -x, (a, b) => a - b));
    registry.register('&/', createUnaryBinaryOp(x => 1 / x, (a, b) => a / b, true));
}

/**
 * Create a reduction operation that applies a function cumulatively
 */
function createReduceOp(fn, init) {
    return (...args) => {
        if (args.length === 0) {
            return sym(String(init));
        }
        try {
            const nums = OperationHelpers.requireNums(args);
            return sym(String(nums.reduce(fn, init === undefined ? nums.shift() : init)));
        } catch (e) {
            return OperationHelpers.error(exp(sym('^'), [sym('args'), ...args]), e.message);
        }
    };
}

/**
 * Create a binary operation that takes exactly two arguments
 */
function createBinaryOp(fn, checkZero = false) {
    return (...args) => {
        try {
            const [a, b] = OperationHelpers.requireNums(args, 2);
            if (checkZero && b === 0) {
                return OperationHelpers.error(exp(sym('^'), [sym('args'), ...args]), "Division by zero");
            }
            return sym(String(fn(a, b)));
        } catch (e) {
            return OperationHelpers.error(exp(sym('^'), [sym('args'), ...args]), e.message);
        }
    };
}

/**
 * Create an operation that can handle both unary and binary cases
 */
function createUnaryBinaryOp(unaryFn, binaryFn, checkZero = false) {
    return (...args) => {
        try {
            const nums = OperationHelpers.requireNums(args);
            if (nums.length === 1) {
                return sym(String(unaryFn(nums[0])));
            }
            if (nums.length === 2) {
                if (checkZero && nums[1] === 0) {
                    return OperationHelpers.error(exp(sym('^'), [sym('args'), ...args]), "Division by zero");
                }
                return sym(String(binaryFn(nums[0], nums[1])));
            }
            return OperationHelpers.error(exp(sym('^'), [sym('args'), ...args]), "Operation requires 1 or 2 args");
        } catch (e) {
            return OperationHelpers.error(exp(sym('^'), [sym('args'), ...args]), e.message);
        }
    };
}