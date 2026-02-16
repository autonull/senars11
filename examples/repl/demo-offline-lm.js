import {TransformersJSProvider} from '../../src/lm/TransformersJSProvider.js';

async function main() {
    console.log('🚀 Demo: Offline LM with Transformers.js');
    console.log('Loading model (this may take a while on the first run)...');

    try {
        const provider = new TransformersJSProvider({
            modelName: 'Xenova/LaMini-Flan-T5-783M',
            task: 'text2text-generation'
        });

        const prompt = "Explain artificial intelligence in simple terms.";
        console.log(`\n📝 Prompt: ${prompt}`);

        const startTime = Date.now();
        const result = await provider.generateText(prompt);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`\n🤖 Result (${duration}s):\n${result}`);

    } catch (error) {
        console.error('\n❌ Error:', { message: error.message, stack: error.stack });
    }
}

main().catch(console.error);
