/**
 * Default operator mappings for MeTTa→SeNARS translation.
 * Each mapping is a function: (termFactory, args) => Term
 */
export const DEFAULT_MAPPINGS = {
    // Equality - core interop mechanism
    '=': (tf, args) => tf.equality(args[0], args[1]),

    // Logical operators
    'and': (tf, args) => tf.conjunction(...args),
    'or': (tf, args) => tf.disjunction(...args),
    'not': (tf, args) => tf.negation(args[0]),

    // Implication/inference
    'implies': (tf, args) => tf.implication(args[0], args[1]),
    '->': (tf, args) => tf.implication(args[0], args[1]),

    // Type annotation → Inheritance
    ':': (tf, args) => tf.inheritance(args[0], args[1]),

    // Similarity
    '~': (tf, args) => tf.similarity(args[0], args[1]),

    // Set constructors
    'set': (tf, args) => tf.setExt(...args),

    // Control flow - preserved as functors
    'let': (tf, args, head) => tf.predicate(head, tf.product(...args)),
    'let*': (tf, args, head) => tf.predicate(head, tf.product(...args)),
    'if': (tf, args, head) => tf.predicate(head, tf.product(...args)),
    'case': (tf, args, head) => tf.predicate(head, tf.product(...args)),
    'match': (tf, args, head) => tf.predicate(head, tf.product(...args)),

    // Quote - preserve unevaluated
    'quote': (tf, args) => args[0],

    // Empty expression
    'Empty': (tf) => tf.atomic('Empty'),
    'Void': (tf) => tf.atomic('Void')
};
