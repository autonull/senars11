const DEMOS = {
    basicUsage: {
        name: 'Basic Usage Demo',
        description: 'Demonstrates basic NARS operations',
        stepDelay: 1000,
        steps: [
            {description: 'Initializing basic usage demo'},
            {description: 'Adding belief: <cat --> animal>.', input: '<cat --> animal>.'},
            {description: 'Adding belief: <dog --> animal>.', input: '<dog --> animal>.'},
            {description: 'Asking question: <cat --> animal>?', input: '<cat --> animal>?'},
            {description: 'Adding goal: <cat --> pet>!', input: '<cat --> pet>!'},
            {description: 'Demo completed'}
        ]
    },
    syllogism: {
        name: 'Syllogistic Reasoning Demo',
        description: 'Demonstrates syllogistic reasoning',
        stepDelay: 1500,
        steps: [
            {description: 'Initializing syllogistic reasoning demo'},
            {description: 'Adding premise: <bird --> animal>.', input: '<bird --> animal>.'},
            {description: 'Adding premise: <robin --> bird>.', input: '<robin --> bird>.'},
            {description: 'Deriving conclusion: <robin --> animal>'},
            {description: 'Asking: <robin --> animal>?', input: '<robin --> animal>?'},
            {description: 'Syllogistic reasoning demo completed'}
        ]
    },
    inductive: {
        name: 'Inductive Reasoning Demo',
        description: 'Demonstrates inductive reasoning',
        stepDelay: 2000,
        steps: [
            {description: 'Initializing inductive reasoning demo'},
            {description: 'Adding observations: <swan1 --> white>.', input: '<swan1 --> white>.'},
            {description: 'Adding observations: <swan2 --> white>.', input: '<swan2 --> white>.'},
            {description: 'Adding observations: <swan3 --> white>.', input: '<swan3 --> white>.'},
            {description: 'Inductive inference: <swan --> white>?', input: '<swan --> white>?'},
            {description: 'Inductive reasoning demo completed'}
        ]
    },
    'hybrid-reasoning': {
        name: 'Hybrid Neurosymbolic Reasoning',
        description: 'Demonstrates integration with Language Models',
        stepDelay: 3000,
        steps: [
            {description: 'Initializing hybrid reasoning demo (Ensure LM is enabled!)'},
            {description: '--- Natural Language Translation ---'},
            {
                description: 'Inputting natural language sentence: "Cats are independent animals."',
                input: '"Cats are independent animals".'
            },
            {description: 'The system uses LMNarseseTranslationRule to parse this into Narsese.'},
            {
                description: 'Verifying derived knowledge: <cat --> independent_animal>?',
                input: '<cat --> independent_animal>?'
            },
            {description: '--- Concept Elaboration ---'},
            {description: 'Inputting a concept to trigger elaboration: bird.', input: 'bird.'},
            {description: 'The system uses LMConceptElaborationRule to find properties of "bird".'},
            {description: 'Checking for elaborated knowledge: <bird --> [fly]>?', input: '<bird --> [fly]?'},
            {description: 'Hybrid reasoning demo completed'}
        ]
    },
    tour: {
        name: 'Comprehensive UI Tour',
        description: 'A complete tour of NARS reasoning capabilities',
        stepDelay: 1500,
        steps: [
            {description: '--- Basic Reasoning ---'},
            {description: 'Adding belief: <cat --> animal>.', input: '<cat --> animal>.'},
            {description: 'Adding belief: <dog --> animal>.', input: '<dog --> animal>.'},
            {description: 'Question: <cat --> animal>?', input: '<cat --> animal>?'},
            {description: 'Goal: <cat --> pet>!', input: '<cat --> pet>!'},
            {description: '--- Syllogistic Reasoning ---'},
            {description: 'Premise 1: <bird --> animal>.', input: '<bird --> animal>.'},
            {description: 'Premise 2: <robin --> bird>.', input: '<robin --> bird>.'},
            {description: 'Checking deduction: <robin --> animal>?'},
            {description: 'Question: <robin --> animal>?', input: '<robin --> animal>?'},
            {description: '--- Inductive Reasoning ---'},
            {description: 'Observation 1: <swan1 --> white>.', input: '<swan1 --> white>.'},
            {description: 'Observation 2: <swan2 --> white>.', input: '<swan2 --> white>.'},
            {description: 'Observation 3: <swan3 --> white>.', input: '<swan3 --> white>.'},
            {description: 'Induction: <swan --> white>?'},
            {description: 'Question: <swan --> white>?', input: '<swan --> white>?'},
            {description: 'Tour completed'}
        ]
    }
};

export class BuiltinDemoSource {
    async getDemos() {
        return Object.entries(DEMOS).map(([id, config]) => ({
            id,
            name: config.name,
            description: config.description,
            stepDelay: config.stepDelay,
            type: 'builtin',
            path: id // Use ID as path for consistency
        }));
    }

    async loadDemoSteps(id) {
        const demo = DEMOS[id];
        if (!demo) {
            throw new Error(`Builtin demo ${id} not found`);
        }
        return demo.steps;
    }

    async getFileContent(id) {
        const demo = DEMOS[id];
        if (!demo) {
            return '// Demo not found';
        }
        // Return a readable representation
        return `// Builtin Demo: ${demo.name}\n// ${demo.description}\n\n${JSON.stringify(demo.steps, null, 2)}`;
    }
}
