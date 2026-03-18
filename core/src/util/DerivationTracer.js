import {TraceId} from './TraceId.js';
import {IntrospectionEvents} from './IntrospectionEvents.js';
import {getPlatform} from '../platform/index.js';

export class DerivationTracer {
    constructor(eventBus, options = {}) {
        this.eventBus = eventBus;
        this.options = {
            maxSteps: options.maxSteps ?? 10000,
            autoStart: options.autoStart ?? false,
            recordSkips: options.recordSkips ?? true,
            ...options
        };
        this.traces = new Map();      // traceId → Trace
        this.activeTrace = null;
        this._subscribed = false;

        if (this.options.autoStart) {
            this.startTrace();
        }
    }

    get platform() {
        return getPlatform();
    }

    startTrace(initialTask = null) {
        const traceId = TraceId.generate();
        this.traces.set(traceId, {
            id: traceId,
            task: initialTask?.serialize?.() ?? null,
            startTime: Date.now(),
            endTime: null,
            steps: [],
            skips: [],
            derivations: [],
            metadata: {}
        });
        this.activeTrace = traceId;
        this._ensureSubscribed();
        return traceId;
    }

    endTrace(traceId = this.activeTrace) {
        const trace = this.traces.get(traceId);
        if (!trace) throw new Error(`Trace ${traceId} not found`);
        trace.endTime = Date.now();
        trace.metrics = this._computeMetrics(trace);
        if (traceId === this.activeTrace) this.activeTrace = null;
        return trace;
    }

    _ensureSubscribed() {
        if (this._subscribed) return;
        this.eventBus.on(IntrospectionEvents.RULE_FIRED, this._onRuleFired.bind(this));
        this.eventBus.on(IntrospectionEvents.RULE_NOT_FIRED, this._onRuleSkipped.bind(this));
        this.eventBus.on(IntrospectionEvents.REASONING_DERIVATION, this._onDerivation.bind(this));
        this._subscribed = true;
    }

    _onRuleFired(event) {
        if (!this.activeTrace) return;
        const trace = this.traces.get(this.activeTrace);
        if (!trace) return;

        trace.steps.push({
            timestamp: Date.now(),
            rule: event.ruleName,
            premises: event.premises?.map(p => p.serialize?.() ?? p) ?? [],
            conclusion: event.conclusion?.serialize?.() ?? event.conclusion,
            truth: event.truth ?? null,
            depth: event.depth ?? 0
        });

        if (trace.steps.length > this.options.maxSteps) trace.steps.shift();
    }

    _onRuleSkipped(event) {
        if (!this.activeTrace || !this.options.recordSkips) return;
        const trace = this.traces.get(this.activeTrace);
        if (!trace) return;

        trace.skips.push({
            timestamp: Date.now(),
            rule: event.ruleName,
            reason: event.reason ?? 'precondition failed'
        });
    }

    _onDerivation(event) {
        if (!this.activeTrace) return;
        const trace = this.traces.get(this.activeTrace);
        if (!trace) return;

        trace.derivations.push(event.task?.serialize?.() ?? event);
    }

    getTrace(traceId) {
        return this.traces.get(traceId) ?? null;
    }

    getActiveTrace() {
        return this.activeTrace ? this.traces.get(this.activeTrace) : null;
    }

    list() {
        return Array.from(this.traces.keys());
    }

    _toTermString(term) {
        return typeof term === 'string' ? term : (term.term?.toString?.() ?? term.toString?.() ?? String(term));
    }

    findPath(traceId, fromTerm, toTerm) {
        const trace = this.traces.get(traceId);
        if (!trace) return [];

        const queue = [{term: fromTerm, path: []}];
        const visited = new Set();
        const targetStr = this._toTermString(toTerm);

        while (queue.length > 0) {
            const {term, path} = queue.shift();
            const termStr = this._toTermString(term);

            if (visited.has(termStr)) continue;
            visited.add(termStr);
            if (termStr === targetStr) return path;

            for (const step of trace.steps) {
                if (step.premises.some(p => this._toTermString(p) === termStr)) {
                    queue.push({term: this._toTermString(step.conclusion), path: [...path, step]});
                }
            }
        }

        return [];
    }

    whyNot(traceId, term) {
        const trace = this.traces.get(traceId);
        if (!trace) return [];

        const termStr = this._toTermString(term).toLowerCase();
        return trace.skips.filter(skip =>
            skip.rule.toLowerCase().includes(termStr) || termStr.includes(skip.rule.toLowerCase())
        );
    }

    hotRules(traceId) {
        const trace = this.traces.get(traceId);
        if (!trace) return new Map();

        return trace.steps.reduce((counts, step) => {
            counts.set(step.rule, (counts.get(step.rule) ?? 0) + 1);
            return counts;
        }, new Map());
    }

    export(traceId, format = 'json') {
        const trace = this.traces.get(traceId);
        if (!trace) throw new Error(`Trace ${traceId} not found`);

        switch (format) {
            case 'json':
                return JSON.stringify(trace, null, 2);
            case 'mermaid':
                return this._toMermaid(trace);
            case 'dot':
                return this._toDot(trace);
            case 'html':
                return this._toHTML(trace);
            default:
                throw new Error(`Unknown format: ${format}`);
        }
    }

    _toMermaid(trace) {
        const lines = trace.steps.map((step, i) => {
            const from = step.premises.map(p => this._toTermString(p.term ?? p)).join(' + ') || 'premise';
            const to = this._toTermString(step.conclusion.term ?? step.conclusion) || 'conclusion';
            return `  P${i}["${from}"] -->|${step.rule}| C${i}["${to}"]`;
        });
        return `graph TD\n${lines.join('\n')}\n`;
    }

    _toDot(trace) {
        const nodes = new Set();
        const addNode = (id, label) => {
            if (nodes.has(id)) return '';
            nodes.add(id);
            return `  ${id} [label="${label}"];\n`;
        };

        const lines = trace.steps.map((step, i) => {
            const from = step.premises.map(p => this._toTermString(p.term ?? p)).join(', ');
            const to = this._toTermString(step.conclusion.term ?? step.conclusion);
            return addNode(`p${i}`, from) + addNode(`c${i}`, to) + `  p${i} -> c${i} [label="${step.rule}"];\n`;
        });

        return `digraph Trace {\n  rankdir=LR;\n  node [shape=box];\n\n${lines.join('')}}\n`;
    }

    _toHTML(trace) {
        const metrics = trace.metrics ?? this._computeMetrics(trace);

        let html = '<!DOCTYPE html>\n<html>\n<head>\n';
        html += '<title>Derivation Trace Report</title>\n';
        html += '<style>\n';
        html += 'body { font-family: sans-serif; margin: 20px; }\n';
        html += 'h1 { color: #333; }\n';
        html += '.metrics { background: #f0f0f0; padding: 10px; border-radius: 5px; }\n';
        html += '.step { border-left: 3px solid #4CAF50; padding: 10px; margin: 10px 0; background: #f9f9f9; }\n';
        html += '.rule { font-weight: bold; color: #1976D2; }\n';
        html += '.skip { border-left: 3px solid #FF9800; padding: 10px; margin: 10px 0; background: #fff3e0; }\n';
        html += '</style>\n';
        html += '</head>\n<body>\n';
        html += `<h1>Trace Report: ${trace.id}</h1>\n`;

        html += '<div class="metrics">\n';
        html += `<p><strong>Duration:</strong> ${metrics.duration}ms</p>\n`;
        html += `<p><strong>Total Steps:</strong> ${metrics.totalSteps}</p>\n`;
        html += `<p><strong>Total Derivations:</strong> ${metrics.totalDerivations}</p>\n`;
        html += `<p><strong>Unique Rules:</strong> ${metrics.uniqueRules}</p>\n`;
        html += `<p><strong>Max Depth:</strong> ${metrics.maxDepth}</p>\n`;
        html += `<p><strong>Derivations/sec:</strong> ${metrics.derivationsPerSecond.toFixed(2)}</p>\n`;
        html += '</div>\n';

        html += '<h2>Derivation Steps</h2>\n';
        trace.steps.forEach((step, i) => {
            html += `<div class="step">\n`;
            html += `<p><span class="rule">${step.rule}</span> (#${i + 1})</p>\n`;
            html += `<p>Depth: ${step.depth}</p>\n`;
            if (step.truth) {
                html += `<p>Truth: f=${step.truth.frequency ?? step.truth.f}, c=${step.truth.confidence ?? step.truth.c}</p>\n`;
            }
            html += '</div>\n';
        });

        if (trace.skips.length > 0) {
            html += '<h2>Skipped Rules</h2>\n';
            trace.skips.forEach((skip, i) => {
                html += `<div class="skip">\n`;
                html += `<p><span class="rule">${skip.rule}</span></p>\n`;
                html += `<p>Reason: ${skip.reason}</p>\n`;
                html += '</div>\n';
            });
        }

        html += '</body>\n</html>';
        return html;
    }

    async save(traceId, path) {
        const trace = this.traces.get(traceId);
        if (!trace) throw new Error(`Trace ${traceId} not found`);

        await this.platform.fs.promises.writeFile(path, JSON.stringify(trace, null, 2), 'utf-8');
    }

    async load(path) {
        const data = await this.platform.fs.promises.readFile(path, 'utf-8');
        const trace = JSON.parse(data);

        this.traces.set(trace.id, trace);
        return trace;
    }

    _computeMetrics(trace) {
        const duration = trace.endTime ? (trace.endTime - trace.startTime) : 0;

        return {
            totalSteps: trace.steps.length,
            totalSkips: trace.skips.length,
            totalDerivations: trace.derivations.length,
            uniqueRules: new Set(trace.steps.map(s => s.rule)).size,
            maxDepth: Math.max(...trace.steps.map(s => s.depth), 0),
            duration,
            derivationsPerSecond: duration > 0 ? (trace.derivations.length / (duration / 1000)) : 0
        };
    }

    dispose() {
        if (this._subscribed) {
            this.eventBus.off(IntrospectionEvents.RULE_FIRED, this._onRuleFired.bind(this));
            this.eventBus.off(IntrospectionEvents.RULE_NOT_FIRED, this._onRuleSkipped.bind(this));
            this.eventBus.off(IntrospectionEvents.REASONING_DERIVATION, this._onDerivation.bind(this));
            this._subscribed = false;
        }
        this.traces.clear();
        this.activeTrace = null;
    }
}
