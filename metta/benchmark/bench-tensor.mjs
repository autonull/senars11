/**
 * bench-tensor.mjs
 * MORK-parity Phase P5: Tensor & NeuralBridge Benchmarks
 */
import { MeTTaInterpreter } from '../src/MeTTaInterpreter.js';

export const runTensorBenchmark = async () => {
    const interpreter = new MeTTaInterpreter({ tensor: true });

    // We run a 500x500 matrix multiplication natively in MeTTa.
    // Ensure we use the proper representation for lists `(: 500 (: 500 ()))` or if our resolveArg handles `(500 500)`.
    const script = `!(matmul (random (500 500)) (random (500 500)))`;

    console.log("Running tensor benchmark (500x500 matmul)...");
    const start = performance.now();
    interpreter.run(script);
    const duration = performance.now() - start;

    console.log(`Tensor benchmark completed in ${duration.toFixed(2)}ms`);
    return duration;
};

// If run directly
if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('bench-tensor.mjs')) {
    runTensorBenchmark().catch(console.error);
}
