
export class NarseseHighlighter {
    static highlight(text) {
        if (!text) return '';

        // Escape HTML first
        let html = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

        // 1. Highlight Structure: < ... > (Statement brackets)
        // Since we escaped, we look for &lt; and &gt;
        // But we want to color just the brackets, or the content?
        // Typically coloring the brackets is subtle.
        // Let's color the Copula and Variables more strongly.

        // 2. Copulas (Arrows)
        // -->  ==>  =/>  <->  <=>
        // Escaped: --&gt;  ==&gt;  =/&gt;  &lt;-&gt;  &lt;=&gt;
        const copulaRegex = /(--&gt;|==&gt;|=\/&gt;|&lt;-&gt;|&lt;=&gt;)/g;
        html = html.replace(copulaRegex, '<span class="nars-copula">$1</span>');

        // 3. Variables ($var, #var, ?var)
        // Only if they are standalone words or inside structure
        const varRegex = /([?$#][a-zA-Z0-9_]+)/g;
        html = html.replace(varRegex, '<span class="nars-var">$1</span>');

        // 4. Truth Values %f;c%
        const truthRegex = /%([0-9.]+;[0-9.]+)%/g;
        html = html.replace(truthRegex, '<span class="nars-truth">%$1%</span>');

        // 5. Brackets { } [ ]
        html = html.replace(/([\{\}\[\]])/g, '<span class="nars-punct">$1</span>');

        // 6. Statement Brackets &lt; &gt;
        // We might want to color them if they aren't part of a copula
        // This is tricky with regex on already modified string.
        // Simple approach: Replace remaining &lt; &gt; that are NOT part of span tags?
        // Too complex for simple highlighter.
        // Let's just highlight &lt; and &gt; globally if they are boundaries.

        return html;
    }
}
