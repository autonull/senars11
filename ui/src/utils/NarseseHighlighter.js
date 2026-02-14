/**
 * Utility to highlight Narsese syntax in text.
 */
export class NarseseHighlighter {
    static highlight(text, language = 'narsese') {
        if (!text) return '';
        if (typeof text !== 'string') {
            text = typeof text === 'object' ? JSON.stringify(text) : String(text);
        }

        if (language === 'metta') {
            return this.highlightMetta(text);
        }

        // Default to Narsese
        let html = text
            // Escape HTML (simple version)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // 1. Highlight Structure: < and >
        html = html.replace(/(&lt;|&gt;)/g, '<span class="nars-structure">$1</span>');

        // 2. Highlight Relations: -->, <->, ==> etc.
        html = html.replace(/(--&gt;|&lt;-&gt;|=&gt;|&lt;=&gt;)/g, '<span class="nars-copula">$1</span>');

        // 3. Highlight Truth Values: %1.0;0.9%
        html = html.replace(/(%\d+(\.\d+)?;\d+(\.\d+)?%)/g, '<span class="nars-truth">$1</span>');

        // 4. Highlight Variables: $x, #y, ?z
        html = html.replace(/([$#?][a-zA-Z0-9_]+)/g, '<span class="nars-variable">$1</span>');

        // 5. Highlight Operators: ^op
        html = html.replace(/(\^[a-zA-Z0-9_]+)/g, '<span class="nars-operator">$1</span>');

        // 6. Highlight Punctuation: . ! ? @
        // (Careful not to match inside words, but Narsese usually has spaces or is at end)
        html = html.replace(/(\s)([\.!\?@])(\s|$)/g, '$1<span class="nars-punctuation">$2</span>$3');

        return html;
    }

    static highlightMetta(text) {
        if (!text) return '';

        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // 1. Comments
        html = html.replace(/(;.*)/g, '<span class="metta-comment">$1</span>');

        // 2. Symbols/Functions (rudimentary) - match keywords BEFORE replacing parens
        const keywords = ['=', '->', '!', 'match', 'let', 'type'];
        keywords.forEach(kw => {
             // Match keywords that are preceded by space or start of line or opening paren
             // and followed by space or end of line or closing paren
             // But simplest is: look for boundaries including parens
             // Since we haven't escaped parens yet, we can check for them.

             // A keyword might be: (match ...
             // So preceded by ( or space.
             const regex = new RegExp(`([\\s\\(]|^)(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})([\\s\\)]|$)`, 'g');
             html = html.replace(regex, '$1<span class="metta-keyword">$2</span>$3');
        });

        // 3. Variables ($var)
        html = html.replace(/(\$[a-zA-Z0-9_]+)/g, '<span class="metta-variable">$1</span>');

        // 4. Parentheses (Do this last so it doesn't mess up keyword matching boundaries)
        html = html.replace(/(\(|\))/g, '<span class="metta-paren">$1</span>');

        return html;
    }
}
