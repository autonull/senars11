import { BaseMeTTaComponent } from './helpers/BaseMeTTaComponent.js';
import { MeTTaRuleAdapter } from './helpers/MeTTaRuleAdapter.js';
import { Term } from './kernel/Term.js';
import { Task, Truth } from '@senars/nar';

export class SeNARSBridge extends BaseMeTTaComponent {
    constructor(reasoner, mettaInterpreter, config = {}, eventBus = null) {
        super(config, 'SeNARSBridge', eventBus, mettaInterpreter?.termFactory);
        this.reasoner = reasoner;
        this.mettaInterpreter = mettaInterpreter;
    }

    mettaToNars(term, punctuation = '.') {
        return this.trackOperation('mettaToNars', () => {
            this.emitMeTTaEvent('metta-to-nars', { term: term.toString() });
            const truth = (punctuation === '?' || punctuation === 'QUESTION') ? null : new Truth(0.9, 0.9);
            return new Task({ term, punctuation, truth });
        });
    }

    narsToMetta(task) {
        return this.trackOperation('narsToMetta', () => {
            const term = task.term ?? task;
            this.emitMeTTaEvent('nars-to-metta', { term: term.toString() });
            return term;
        });
    }

    queryWithReasoning(query) {
        return this.trackOperation('queryWithReasoning', () => {
            const qTerm = typeof query === 'string' ? this.mettaInterpreter.parser.parseExpression(query) : query;
            const task = this.mettaToNars(qTerm, '?');
            const derived = this.reasoner?.derive?.(task) ?? [];
            this.emitMeTTaEvent('reasoning-complete', { derivationCount: derived.length });
            return derived;
        });
    }

    importToSeNARS(code) {
        return this.trackOperation('importToSeNARS', () => {
            const tasks = this.mettaInterpreter.load(code);
            tasks.forEach(t => this.reasoner?.process?.(this.mettaToNars(t.term, t.punctuation)));
            this.emitMeTTaEvent('knowledge-imported', { taskCount: tasks.length });
        });
    }

    exportFromSeNARS() {
        return this.trackOperation('exportFromSeNARS', () => {
            const terms = (this.reasoner?.memory?.getBeliefs?.() ?? []).map(b => this.narsToMetta(b));
            this.emitMeTTaEvent('knowledge-exported', { termCount: terms.length });
            return terms;
        });
    }

    injectRule(ruleTerm) {
        return this.trackOperation('injectRule', () => {
            const rule = new MeTTaRuleAdapter(ruleTerm, this.mettaInterpreter);
            this.reasoner.ruleProcessor.ruleExecutor.registerRule(rule);
            this.emitMeTTaEvent('rule-injected', { ruleId: rule.id });
            return rule;
        });
    }

    sync(code) {
        return this.trackOperation('sync', () => {
            this.importToSeNARS(code);
            const exported = this.exportFromSeNARS();
            return { imported: code, exported: exported.map(t => t.toString()).join('\n') };
        });
    }

    getConceptSTI(atom) { return this._getBudget(atom, 'sti'); }
    setConceptSTI(atom, value) { this._setBudget(atom, 'sti', value); }
    getConceptLTI(atom) { return this._getBudget(atom, 'lti'); }
    setConceptLTI(atom, value) { this._setBudget(atom, 'lti', value); }

    _getBudget(atom, type) {
        return this.trackOperation(`getConcept${type.toUpperCase()}`, () => {
            const c = this.reasoner?.memory?.getConcept?.(atom?.toString?.() ?? String(atom));
            return c?.budget?.[type] ?? 0;
        });
    }

    _setBudget(atom, type, value) {
        this.trackOperation(`setConcept${type.toUpperCase()}`, () => {
            const term = atom?.toString?.() ?? String(atom);
            const c = this.reasoner?.memory?.getConcept?.(term);
            if (c?.budget) {
                c.budget[type] = value;
                this.emitMeTTaEvent(`${type}-updated`, { concept: term, [type]: value });
            }
        });
    }

    getRelatedConcepts(atom, max = 10) {
        return this.trackOperation('getRelatedConcepts', () => {
            const term = atom?.toString?.() ?? String(atom);
            const c = this.reasoner?.memory?.getConcept?.(term);
            if (!c?.links) return [];
            const linked = [...c.links].slice(0, max).map(l => l.target?.term ?? l.target);
            this.emitMeTTaEvent('related-concepts-retrieved', { concept: term, count: linked.length });
            return linked;
        });
    }

    getTopBySTI(n = 10) {
        return this.trackOperation('getTopBySTI', () =>
            (this.reasoner?.memory?.getAllConcepts?.() ?? [])
                .filter(c => c.budget?.sti > 0)
                .sort((a, b) => (b.budget?.sti ?? 0) - (a.budget?.sti ?? 0))
                .slice(0, n)
                .map(c => c.term)
        );
    }

    getSystemStats() {
        return this.trackOperation('getSystemStats', () => {
            const concepts = this.reasoner?.memory?.getAllConcepts?.() ?? [];
            const stis = concepts.map(c => c.budget?.sti ?? 0).filter(s => s > 0);
            const avgSti = stis.length ? (stis.reduce((a, b) => a + b, 0) / stis.length).toFixed(2) : '0';
            const memUsage = process.memoryUsage ? (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) : '0';

            return {
                atomCount: this.mettaInterpreter?.space?.size?.() ?? 0,
                conceptCount: concepts.length,
                avgSTI: avgSti,
                maxSTI: Math.max(...stis, 0).toFixed(2),
                minSTI: stis.length ? Math.min(...stis).toFixed(2) : '0',
                memoryMB: memUsage
            };
        });
    }

    executeNARSDerivation(task, premise = null) {
        return this.trackOperation('executeNARSDerivation', () => {
            const nTask = this.mettaToNars(task, '.');
            const derived = premise
                ? (this.reasoner?.deriveWith?.(nTask, premise) ?? this.reasoner?.derive?.(nTask))
                : this.reasoner?.derive?.(nTask);
            return derived?.[0] ? this.narsToMetta(derived[0]) : null;
        });
    }

    registerPrimitives(ground) {
        const { constructList, sym, exp } = Term;
        const reg = (name, fn) => ground.register(name, fn);

        reg('&get-sti', a => sym(String(this.getConceptSTI(a))));
        reg('&set-sti', (a, v) => (this.setConceptSTI(a, parseFloat(v.name ?? v)), a));
        reg('&get-lti', a => sym(String(this.getConceptLTI(a))));
        reg('&set-lti', (a, v) => (this.setConceptLTI(a, parseFloat(v.name ?? v)), a));
        reg('&get-related', a => constructList(this.getRelatedConcepts(a), sym('()')));
        reg('&nars-derive', (t, p) => this.executeNARSDerivation(t, p?.name === '()' ? null : p) ?? sym('()'));
        reg('&system-stats', () => constructList(
            Object.entries(this.getSystemStats()).map(([k, v]) => exp(sym(':'), [sym(k), sym(String(v))])),
            sym('()')
        ));
    }
}
