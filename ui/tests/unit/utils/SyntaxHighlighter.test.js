import { describe, expect, test } from '@jest/globals';
import { SyntaxHighlighter } from '../../../src/utils/SyntaxHighlighter.js';

describe('SyntaxHighlighter', () => {
    test('should highlight Narsese copulas', () => {
        const input = '<cat --> animal>.';
        // highlight escapes HTML first: &lt;cat --&gt; animal&gt;.
        // Then replaces --&gt; with span
        const output = SyntaxHighlighter.highlight(input);
        expect(output).toContain('<span class="nars-copula">--&gt;</span>');
    });

    test('should identify MeTTa code', () => {
        const input = '!(match &self $x $x)';
        const output = SyntaxHighlighter.highlight(input, 'metta');
        // metta variables highlighted
        expect(output).toContain('<span class="metta-variable">$x</span>');
    });

    test('reproduce HTML entity corruption in MeTTa comments', () => {
        const input = '!"foo"'; // Starts with ! so detected as MeTTa
        const output = SyntaxHighlighter.highlight(input);

        // Expected: !<span class="metta-string">&quot;foo&quot;</span>
        // Actual (buggy): !<span class="metta-string">&quot;foo&quot<span class="metta-comment">;</span></span>

        // At the very least, it should NOT corrupt the closing &quot; entity.
        expect(output).toContain('&quot;');
        expect(output).not.toMatch(/&quot<span/);
    });

    test('should highlight actual MeTTa comments', () => {
        const input = '!x ; this is a comment';
        const output = SyntaxHighlighter.highlight(input);
        expect(output).toContain('<span class="metta-comment">; this is a comment</span>');
    });
});
