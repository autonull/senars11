
export class SyntaxHighlighter {
    static highlight(text, language = 'auto') {
        if (!text) {return '';}

        let isMetta = false;
        if (language === 'metta') {
            isMetta = true;
        } else if (language === 'narsese') {
            isMetta = false;
        } else {
            // Auto-detect
            const trimmed = text.trim();
            isMetta = trimmed.startsWith('!') || (trimmed.startsWith('(') && !trimmed.includes('-->') && !trimmed.includes('==>'));
        }

        // Escape HTML first
        const html = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

        if (isMetta) {
            return this._highlightMetta(html);
        } else {
            return this._highlightNarsese(html);
        }
    }

    static _highlightNarsese(html) {
        // 1. Copulas (Arrows)
        const copulaRegex = /(--&gt;|==&gt;|=\/&gt;|&lt;-&gt;|&lt;=&gt;)/g;
        html = html.replace(copulaRegex, '<span class="nars-copula">$1</span>');

        // 2. Variables ($var, #var, ?var)
        const varRegex = /([?$#][a-zA-Z0-9_]+)/g;
        html = html.replace(varRegex, '<span class="nars-variable">$1</span>');

        // 3. Truth Values %f;c%
        const truthRegex = /%([0-9.]+;[0-9.]+)%/g;
        html = html.replace(truthRegex, '<span class="nars-truth">%$1%</span>');

        // 4. Brackets { } [ ]
        html = html.replace(/([\{\}\[\]])/g, '<span class="nars-punctuation">$1</span>');

        return html;
    }

    static _highlightMetta(html) {
        // Highlighting for MeTTa (Lisp-like syntax)

        // 1. Comments (; ...)
        // We use a regex that matches ; at the start of line or preceded by whitespace/punctuation,
        // ensuring it's not part of an entity like &quot;
        // Since we already escaped HTML, entities are &...;
        // So a comment ; must not be preceded by &... chars.
        // A simple heuristic: ; followed by anything until end of line.
        // To avoid matching the ; in &quot;, we can use a negative lookbehind if supported,
        // or match specifically.
        // Using lookbehind (?<!&[a-zA-Z0-9#]+) works in modern JS environments (Node 10+, Chrome 62+).
        // html = html.replace(/(?<!&[a-zA-Z0-9#]+)(;.*)$/gm, '<span class="metta-comment">$1</span>');

        // 2. Strings "..."
        // Matches &quot;...&quot;
        // We need to be careful not to match inside comments (though we handled comments first,
        // but simple replace doesn't exclude previously matched parts unless we tokenize properly).
        // However, comments are wrapped in <span>...</span> now.
        // So we should avoid matching inside existing tags?
        // A better approach for simple regex highlighting is to tokenize or do it in one pass,
        // but for now, we assume strings don't contain comments and vice versa in simple cases.
        // We can match strings that are NOT inside a span tag.
        // But since we process sequentially:
        // Comments are now <span class="metta-comment">; ...</span>
        // So if we match &quot;, we might match inside the comment?
        // Yes, if the comment contains a quote.
        // To fix this properly without a full parser, we can use a placeholder approach:
        // 1. Extract comments and replace with placeholders.
        // 2. Process strings.
        // 3. Process other tokens.
        // 4. Restore comments.

        const placeholders = [];
        const generatePlaceholder = (index) => `__PLACEHOLDER_${index}__`;

        // 1. Extract Comments
        html = html.replace(/(?<!&[a-zA-Z0-9#]+)(;.*)$/gm, (match) => {
            const index = placeholders.push(`<span class="metta-comment">${match}</span>`) - 1;
            return generatePlaceholder(index);
        });

        // 2. Extract Strings
        html = html.replace(/(&quot;.*?&quot;)/g, (match) => {
            const index = placeholders.push(`<span class="metta-string">${match}</span>`) - 1;
            return generatePlaceholder(index);
        });

        // 3. Variables ($var)
        // MeTTa variables start with $
        html = html.replace(/(\$[a-zA-Z0-9_\-]+)/g, '<span class="metta-variable">$1</span>');

        // 4. Keywords and Symbols
        // Common MeTTa keywords: !, =, :, ->
        // We match them if they are surrounded by whitespace or parens.
        // Since HTML is escaped, < is &lt;, > is &gt;
        // Arrows: -> becomes -&gt;
        const keywords = ['!', '=', ':', '&lt;-', '-&gt;', '&gt;-', 'let', 'if', 'case', 'match'];
        const keywordPattern = new RegExp(`(^|[\\s\\(\\)])(${keywords.join('|')})(?=[\\s\\(\\)]|$)`, 'g');

        html = html.replace(keywordPattern, '$1<span class="metta-keyword">$2</span>');

        // 5. Restore placeholders
        // We need to restore in reverse order or just loop?
        // Since placeholders are unique strings, order doesn't matter much if they don't overlap.
        placeholders.forEach((content, index) => {
            html = html.replace(generatePlaceholder(index), content);
        });

        return html;
    }
}
