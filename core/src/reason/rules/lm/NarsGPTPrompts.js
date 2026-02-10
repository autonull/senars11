/**
 * @file NarsGPTPrompts.js
 * Prompt templates for NARS-GPT style reasoning.
 * Handles formatting of memory items, truth values, and specific reasoning task prompts.
 */

class PromptFormatter {
    formatTruth(truth) {
        // Default to neutral confidence if missing
        const f = truth?.f ?? truth?.frequency ?? 0.5;
        const c = truth?.c ?? truth?.confidence ?? 0;

        // NARS-GPT uses "NOT: " prefix for negative evidence (f < 0.5)
        const isNeg = f < 0.5;
        return {
            prefix: isNeg ? 'NOT: ' : '',
            f: isNeg ? 1 - f : f,
            c
        };
    }

    formatTask(task, index = null) {
        // Handle various input types (Task object, simple object, string)
        const t = task.task ?? task; // Unwrap if wrapped
        const termStr = t.term?.toString?.() ?? String(t.term ?? t);

        const {prefix, f, c} = this.formatTruth(t.truth);
        const truthStr = t.truth ? ` {${f.toFixed(2)} ${c.toFixed(2)}}` : '';
        const indexStr = index !== null ? `${index + 1}. ` : '';

        return `${indexStr}${prefix}${termStr}${truthStr}`;
    }

    formatMemoryBuffer(buffer) {
        if (!buffer || buffer.length === 0) {
            return '(No relevant memory items found)';
        }
        return buffer.map((item, i) => this.formatTask(item, i)).join('\n');
    }
}

export const PromptUtils = new PromptFormatter();

export const NarsGPTPrompts = {
    question: (context, question) => `Answer the question according to what the following memory items, which the answer should be based on, suggest:

${context}

The question: ${question}

Please only answer according to the listed memory items and what can be inferred from them.
If the answer cannot be determined from the memory items, say "I don't know based on my current knowledge."
Include certainty information if relevant (e.g., "I am fairly certain..." or "It is likely that...").`,

    belief: (context, sentence) => `Encode the sentence into memory items. Consider the existing memory items for consistent term usage:

${context}

The sentence: ${sentence}

Provide the encoding in the following format:
- Use inheritance (-->) for "is a" relationships
- Use similarity (<->) for "is similar to" relationships  
- Use implication (==>) for "if...then" relationships
- Include truth values {frequency confidence} where frequency is how often it's true (0-1) and confidence is certainty (0-1)

Example outputs:
(bird --> animal). {0.95 0.9}
(penguin --> bird). {1.0 0.9}
(bird --> flyer). {0.8 0.8}`,

    goal: (context, goal) => `Given the current knowledge and the goal to achieve, suggest actions or sub-goals:

${context}

Goal to achieve: ${goal}

Suggest concrete steps or sub-goals that would help achieve this goal.
Format each as a goal statement ending with !
Consider what is currently known when making suggestions.`,

    questionWithGPTKnowledge: (context, question) => `Answer the question. You may use the following memory items as well as your general knowledge:

${context}

The question: ${question}

Provide your best answer. If using information from the memory items, indicate this.
If using general knowledge not in the memory, note that as well.`,

    // Delegated helpers for backward compatibility or direct usage
    formatBuffer: (buffer) => PromptUtils.formatMemoryBuffer(buffer),
    formatBelief: (termStr, truth) => {
        const {prefix, f, c} = PromptUtils.formatTruth(truth);
        return `${prefix}${termStr} {${f.toFixed(2)} ${c.toFixed(2)}}`;
    }
};

export default NarsGPTPrompts;
