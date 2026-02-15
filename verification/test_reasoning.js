import { AgentToolsBridge } from '../ui/src/agent/AgentToolsBridge.js';
import { IntrospectionEvents } from '../core/src/util/IntrospectionEvents.js';

// Mock browser globals if needed (AgentToolsBridge might depend on them?)
// AgentToolsBridge imports NAR from @senars/core.
// We need to handle module resolution.
// Since we are in node, we might need to rely on the package.json "type": "module".

async function run() {
    console.log('Initializing Bridge...');
    const bridge = new AgentToolsBridge();
    await bridge.initialize();

    const nar = bridge.getNAR();
    nar.traceEnabled = true;

    console.log('Binding events...');
    nar.on(IntrospectionEvents.TASK_ADDED, (data) => {
        console.log(`TASK_ADDED: ${data.task.term}`);
    });

    nar.on(IntrospectionEvents.REASONING_DERIVATION, (data) => {
        console.log(`DERIVED: ${data.derivedTask.term}`);
    });

    console.log('Input 1...');
    await nar.input('<bird --> animal>.');

    console.log('Input 2...');
    await nar.input('<robin --> bird>.');

    console.log('Stepping...');
    for(let i=0; i<50; i++) {
        await nar.step();
        // Allow async processing
        await new Promise(r => setTimeout(r, 10));
    }

    console.log('Done.');
}

run().catch(e => console.error(e));
