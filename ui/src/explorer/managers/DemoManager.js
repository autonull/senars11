import { DEMOS } from '../../data/demos.js';
import { DemoLibraryModal } from '../../components/DemoLibraryModal.js';

export class DemoManager {
    constructor(app) {
        this.app = app;
    }

    loadDemo(name) {
        const demo = DEMOS[name];
        if (!demo) return;

        this.app.graph.clear();
        this.app.log(`Loading demo: ${name}`, 'system');

        if (demo.bagCapacity && this.app.graph.bag) {
            this.app.graph.bag.capacity = demo.bagCapacity;
            this.app.log(`Set Bag Capacity to ${demo.bagCapacity}`, 'system');
        }

        if (demo.script) {
            this.app.toastManager.show(`Running Script: ${name}`, 'info');
            this._runDemoScript(name, demo.script);
        } else if (demo.generator) {
            this.app.toastManager.show(`Generating: ${name}`, 'info');
            try {
                demo.generator(this.app.graph);
                this.app.graph.scheduleLayout();
                this.app.toastManager.show(`Generated: ${name}`, 'success');
            } catch (e) {
                this.app.log(`Generator Error: ${e.message}`, 'error');
            }
        } else {
            this.app.toastManager.show(`Demo loaded: ${name}`, 'success');
            demo.concepts.forEach(c => this.app.graph.addNode({ ...c, id: c.term }, false));
            demo.relationships.forEach(r => this.app.graph.addEdge({ source: r[0], target: r[1], type: r[2] }, false));
            this.app.graph.scheduleLayout();
        }
    }

    async _runDemoScript(name, script) {
        for (const line of script) {
            await this.app.handleReplCommand(line);
            await new Promise(r => setTimeout(r, 800));
        }
        this.app.toastManager.show(`Script completed: ${name}`, 'success');
    }

    showDemoLibrary() {
        const modal = new DemoLibraryModal({
            onSelect: (selection) => {
                if (typeof selection === 'string') {
                    this.loadDemo(selection);
                } else if (selection?.path) {
                    this.app.fileManager.loadRemoteFile(selection.path);
                }
            }
        });
        modal.show();
    }

    bindDemoSelect() {
        const demoSelect = document.getElementById('demo-select');
        if (!demoSelect) return;
        const newSelect = demoSelect.cloneNode(false);
        demoSelect.parentNode.replaceChild(newSelect, demoSelect);
        Object.keys(DEMOS).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            newSelect.appendChild(opt);
        });
        newSelect.onchange = (e) => {
            if (e.target.value) {
                this.loadDemo(e.target.value);
                e.target.value = "";
            }
        };
    }
}
