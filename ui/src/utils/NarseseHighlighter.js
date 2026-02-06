
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
        // Note: HTML escaped, so ; might appear in entities, but mostly fine as line comments
        // But we are processing a single string which might be multiline.
        // If single line: ^;.*$
        // Since we already escaped, be careful not to match &lt;
        html = html.replace(/(;.*)$/gm, '<span class="metta-comment">$1</span>');

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
