
export class NarseseHighlighter {
    static highlight(text) {
        if (!text) return '';

        // Detect language hint (naive)
        // MeTTa often starts with !, (, or ;
        // Narsese often starts with <, (, or contains -->
        const isMetta = text.trim().startsWith('!') || (text.includes('(') && !text.includes('-->') && !text.includes('==>'));

        // Escape HTML first
        let html = text
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
        html = html.replace(varRegex, '<span class="nars-var">$1</span>');

        // 3. Truth Values %f;c%
        const truthRegex = /%([0-9.]+;[0-9.]+)%/g;
        html = html.replace(truthRegex, '<span class="nars-truth">%$1%</span>');

        // 4. Brackets { } [ ]
        html = html.replace(/([\{\}\[\]])/g, '<span class="nars-punct">$1</span>');

        return html;
    }

    static _highlightMetta(html) {
        // 1. Comments (; ...)
        // Note: HTML escaped, so ; might appear in entities.
        // We only match ; that is NOT preceded by &# or &lt etc (entities usually end with ;)
        // But entities like &quot; end with ;.
        // So we need a lookbehind or ensure it's a standalone ;
        // MeTTa comments start with ;
        // If we assume valid MeTTa, ; starts a comment unless inside a string.
        // We handle strings later, but maybe we should handle them first to protect them?
        // But here we are operating on escaped HTML.

        // Better regex: Match ; that is either at start of line OR preceded by whitespace.
        // And not part of an entity like &quot;
        // Since JS regex lookbehind might be tricky in some environments, let's try matching specifically.

        // Actually, MeTTa comments MUST be separated by whitespace or parens if they follow a token?
        // No, ";comment" is valid. "foo;comment" is valid?
        // In Lisp/MeTTa, ; usually starts a comment anywhere?
        // But we have entities like &quot; which end in ;.
        // An entity is &...;
        // So a comment ; cannot be immediately preceded by &... chars without space?
        // Let's assume a comment ; is usually at the start of a token or follows a space.

        // A safer heuristic for syntax highlighting on escaped text:
        // Match ; only if it's not part of an entity.
        // Entities are &name; or &#123;
        // So if ; is preceded by (Start of line) or (Space) or (Parens) or (!) or ...
        // OR simply: if it is NOT preceded by [a-zA-Z0-9].
        // Entities end with ; preceded by alphanumeric.
        // MeTTa ; comment is usually just ;.

        // However, we replaced " with &quot; which ends in t;.
        // So if we match (;.*) we match the ; in &quot;

        // We can use a negative lookbehind if supported (ES2018+). Senars targets modern environments.
        // (?<!&[a-zA-Z0-9#]+);.*

        // But let's try a safer approach without lookbehind if possible, or just use it.
        // Given we run on Node 22 (from nvm output in earlier step), lookbehind is supported.
        // Browser support is also good (Chrome 62+, FF 78+).

        html = html.replace(/(?<!&[a-zA-Z0-9#]+)(;.*)$/gm, '<span class="metta-comment">$1</span>');

        // 2. Strings "..."
        // Escaped quotes are &quot;
        html = html.replace(/(&quot;.*?&quot;)/g, '<span class="metta-string">$1</span>');

        // 3. Variables $var
        html = html.replace(/(\$[a-zA-Z0-9_\-]+)/g, '<span class="metta-var">$1</span>');

        // 4. Keywords (escaped versions)
        // ! -> !
        // = -> =
        // : -> :
        // -> -> -&gt;
        const keywordRegex = /([\s\(])(!|=|:|&lt;-|->|&gt;-)([\s\)])/g;
        // Capture groups to preserve spacing
        html = html.replace(keywordRegex, '$1<span class="metta-keyword">$2</span>$3');

        return html;
    }
}
