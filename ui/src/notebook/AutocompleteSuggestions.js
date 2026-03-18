export const AUTOCOMPLETE_SUGGESTIONS = [
    // Narsese Copulas
    { label: '-->', type: 'relation', info: 'Inheritance' },
    { label: '<->', type: 'relation', info: 'Similarity' },
    { label: '{--', type: 'relation', info: 'Instance' },
    { label: '--]', type: 'relation', info: 'Property' },
    { label: '{-]', type: 'relation', info: 'Instance-Property' },
    { label: '==>', type: 'relation', info: 'Implication' },
    { label: '<=>', type: 'relation', info: 'Equivalence' },
    { label: '=/>', type: 'relation', info: 'Predictive Implication' },
    { label: '=\\>', type: 'relation', info: 'Retrospective Implication' },
    { label: '</>', type: 'relation', info: 'Concurrent Implication' },

    // Narsese Connectors
    { label: '(&&,', type: 'connector', info: 'Conjunction' },
    { label: '(||,', type: 'connector', info: 'Disjunction' },
    { label: '(&/,', type: 'connector', info: 'Sequence' },
    { label: '(|/,', type: 'connector', info: 'Parallel' },
    { label: '(-,', type: 'connector', info: 'Negation' },
    { label: '(--,', type: 'connector', info: 'Difference' },

    // Narsese Keywords
    { label: 'SELF', type: 'keyword', info: 'Self Reference' },
    { label: 'out', type: 'keyword', info: 'Output' },
    { label: 'int', type: 'keyword', info: 'Internal' },

    // Operators
    { label: '^op', type: 'operator', info: 'Operator' },
    { label: '^go', type: 'operator', info: 'Go to' },
    { label: '^pick', type: 'operator', info: 'Pick up' },
    { label: '^drop', type: 'operator', info: 'Drop' },

    // MeTTa Keywords
    { label: 'match', type: 'keyword', info: 'Pattern Matching' },
    { label: 'superpose', type: 'keyword', info: 'Superposition' },
    { label: 'collapse', type: 'keyword', info: 'Collapse Superposition' },
    { label: 'unique', type: 'keyword', info: 'Unique Results' },
    { label: 'case', type: 'keyword', info: 'Case Expression' },
    { label: 'if', type: 'keyword', info: 'Conditional' },
    { label: 'let', type: 'keyword', info: 'Variable Binding' },
    { label: 'let*', type: 'keyword', info: 'Sequential Binding' },
    { label: 'quote', type: 'keyword', info: 'Quote Atom' },
    { label: 'eval', type: 'keyword', info: 'Evaluate' },
    { label: 'function', type: 'keyword', info: 'Function Definition' },
    { label: 'return', type: 'keyword', info: 'Return Value' },
    { label: '!', type: 'keyword', info: 'Execution' },
    { label: 'import!', type: 'keyword', info: 'Import Module' },
    { label: 'bind!', type: 'keyword', info: 'Bind Token' },
    { label: 'pragma!', type: 'keyword', info: 'Compiler Directive' },
    { label: 'get-type', type: 'keyword', info: 'Get Atom Type' },
    { label: 'get-metatype', type: 'keyword', info: 'Get Meta Type' },
    { label: 'assertEqual', type: 'keyword', info: 'Assertion' },
    { label: 'assertEqualToResult', type: 'keyword', info: 'Assertion' },

    // MeTTa Types & Constructors
    { label: 'Atom', type: 'type', info: 'Base Type' },
    { label: 'Symbol', type: 'type', info: 'Symbol Type' },
    { label: 'Expression', type: 'type', info: 'Expression Type' },
    { label: 'Variable', type: 'type', info: 'Variable Type' },
    { label: 'Grounded', type: 'type', info: 'Grounded Type' },
    { label: 'Cons', type: 'type', info: 'List Cons' },
    { label: 'Nil', type: 'type', info: 'Empty List' },
    { label: '->', type: 'keyword', info: 'Function Type' }
];
