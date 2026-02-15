/**
 * Syntax highlighting utilities for Narsese language
 */

export class NarseseSyntaxHighlighter {
    constructor() {
        // Define patterns for Narsese syntax
        this.patterns = [
            // Narsese statements and queries
            { regex: /(&lt;|&gt;|<|>)/g, className: 'narsese-bracket' },
            // Term relations
            { regex: /(-->)|(<->)|(==>)/g, className: 'narsese-relation' },
            // Task types
            { regex: /([.?!])/g, className: 'narsese-task-type' },
            // Truth values
            { regex: /%[\d.]+;[\d.]+%/g, className: 'narsese-truth-value' },
            // Compound terms
            { regex: /([&|\^])/g, className: 'narsese-compound' },
            // Variables
            { regex: /([?*$][a-zA-Z]\w*)/g, className: 'narsese-variable' },
            // Comments or system commands
            { regex: /(\*.+)/g, className: 'narsese-command' }
        ];
    }

    highlight(text) {
        if (!text) return text;

        let highlighted = text;
        for (const pattern of this.patterns) {
            highlighted = highlighted.replace(pattern.regex, (match) => {
                return `<span class="${pattern.className}">${match}</span>`;
            });
        }
        return highlighted;
    }
}

export default NarseseSyntaxHighlighter;