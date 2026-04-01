export class FileManager {
    constructor(app) {
        this.app = app;
    }

    initialize() {
        this._bindDragDrop();
    }

    handleImportCSV() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            this.loadCSVFile(file);
        };
        input.click();
    }

    loadCSVFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.processCSVContent(e.target.result, file.name);
        };
        reader.readAsText(file);
    }

    processCSVContent(content, filename) {
        this.app.log(`Loading CSV content: ${filename}`, 'system');
        const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

        if (lines.length === 0) {
            this.app.log('CSV is empty', 'warning');
            return;
        }

        const header = lines[0].toLowerCase().split(',').map(c => c.trim());
        const hasHeader = header.includes('id') || header.includes('source');

        let startIndex = 0;
        let columnMap = {};

        if (hasHeader) {
            startIndex = 1;
            header.forEach((h, i) => columnMap[h] = i);
        } else {
            const firstLineCols = lines[0].split(',').length;
            if (firstLineCols >= 2) {
                columnMap = { source: 0, target: 1, type: 2 };
            } else {
                columnMap = { id: 0, type: 1 };
            }
        }

        let nodesCount = 0;
        let edgesCount = 0;

        for (let i = startIndex; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim());

            if (columnMap.hasOwnProperty('source') && columnMap.hasOwnProperty('target') &&
                cols[columnMap.source] && cols[columnMap.target]) {

                const source = cols[columnMap.source];
                const target = cols[columnMap.target];
                const type = columnMap.type !== undefined ? cols[columnMap.type] : 'related';

                this.app.graph.addNode({ id: source, term: source, type: 'concept' }, false);
                this.app.graph.addNode({ id: target, term: target, type: 'concept' }, false);

                this.app.graph.addEdge({ source, target, type }, false);
                edgesCount++;
            }
            else if (columnMap.hasOwnProperty('id') && cols[columnMap.id]) {
                const id = cols[columnMap.id];
                const type = columnMap.type !== undefined ? cols[columnMap.type] : 'concept';
                this.app.graph.addNode({ id, term: id, type }, false);
                nodesCount++;
            }
        }

        this.app.graph.scheduleLayout();
        this.app.log(`Imported ${nodesCount} nodes and ${edgesCount} edges from CSV`, 'success');
        this.app._updateStats();
    }

    handleSaveJSON() {
        if (!this.app.graph || !this.app.graph.cy) return;
        const json = this.app.graph.cy.json();
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        this._downloadBlob(blob, 'senars-graph.json');
        this.app.log('Graph saved to senars-graph.json', 'system');
    }

    handleLoadJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            this.loadFile(file);
        };
        input.click();
    }

    loadFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.app.loadGraphData(data);
                this.app.log(`Loaded file: ${file.name}`, 'system');
            } catch (err) {
                this.app.log(`Error parsing JSON: ${err.message}`, 'error');
            }
        };
        reader.readAsText(file);
    }

    handleExportImage(format) {
        if (!this.app.graph || !this.app.graph.cy) return;

        let content, type, ext;
        if (format === 'png') {
            content = this.app.graph.cy.png({ full: true, bg: 'transparent' });
            type = 'image/png';
            ext = 'png';
        } else if (format === 'svg') {
            if (this.app.graph.cy.svg) {
                content = this.app.graph.cy.svg({ full: true });
                type = 'image/svg+xml';
                ext = 'svg';
            } else {
                this.app.log('SVG export not supported (extension missing)', 'error');
                return;
            }
        }

        if (format === 'png') {
            const a = document.createElement('a');
            a.href = content;
            a.download = `senars-graph.${ext}`;
            a.click();
        } else {
            const blob = new Blob([content], { type });
            this._downloadBlob(blob, `senars-graph.${ext}`);
        }

        this.app.log(`Graph exported as ${ext.toUpperCase()}`, 'success');
    }

    _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    _bindDragDrop() {
        const container = document.body;

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.classList.add('dragging-over');
        });

        container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.classList.remove('dragging-over');
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.classList.remove('dragging-over');

            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];

                if (file.name.endsWith('.json')) {
                    this.loadFile(file);
                } else if (file.name.endsWith('.csv')) {
                    this.loadCSVFile(file);
                } else if (file.name.endsWith('.metta')) {
                    this.loadMeTTaFile(file);
                } else if (file.name.endsWith('.nal') || file.name.endsWith('.nars')) {
                    this.loadNALFile(file);
                } else {
                    this.app.log(`Unsupported file type: ${file.name}`, 'warning');
                }
            }
        });
    }

    loadMeTTaFile(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            await this.app.processMeTTaContent(e.target.result, file.name);
        };
        reader.readAsText(file);
    }

    loadNALFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.app.processNALContent(e.target.result, file.name);
        };
        reader.readAsText(file);
    }

    async loadRemoteFile(path) {
        try {
            this.app.log(`Fetching remote file: ${path}`, 'system');
            const response = await fetch('/' + path);
            if (!response.ok) throw new Error(response.statusText);
            const content = await response.text();

            if (path.endsWith('.metta')) {
                await this.app.processMeTTaContent(content, path);
            } else if (path.endsWith('.nars') || path.endsWith('.nal')) {
                this.app.processNALContent(content, path);
            } else {
                this.app.log(`Unsupported remote file type: ${path}`, 'warning');
            }
        } catch (e) {
            this.app.log(`Failed to load file: ${e.message}`, 'error');
        }
    }
}
