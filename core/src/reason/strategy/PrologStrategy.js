/**
 * Prolog Strategy for the SeNARS Stream Reasoner
 * Implements Prolog-style backward chaining resolution with unification and backtracking
 * using the PrologParser to convert between Prolog and SeNARS representations.
 */

import {Strategy} from '../Strategy.js';
import {PrologParser} from '../../parser/PrologParser.js';
import {Task} from '../../task/Task.js';
import {Truth} from '../../Truth.js';
import {TermFactory} from '../../term/TermFactory.js';
import {Unifier} from '../../term/Unifier.js';
import {FunctorRegistry} from '../FunctorRegistry.js';
import {isQuestion} from '../RuleHelpers.js';
import {getComponents, getVariableName, isCompound, isVariable} from '../../term/TermUtils.js';

export class PrologStrategy extends Strategy {
    constructor(config = {}) {
        super(config);
        this.name = 'PrologStrategy';
        this.prologParser = new PrologParser(config.termFactory || new TermFactory());
        this.termFactory = this.prologParser.termFactory;
        this.unifier = new Unifier(this.termFactory);
        this.goalStack = [];
        this.knowledgeBase = new Map();
        this.substitutionStack = [];
        this.variableCounter = 0;
        this.functorRegistry = config.functorRegistry ?? new FunctorRegistry();
        this._registerPrologOperatorAliases();
        this.config = {maxDepth: 10, maxSolutions: 5, backtrackingEnabled: true, ...config};
    }

    _registerPrologOperatorAliases() {
        const ops = [
            ['>', (a, b) => Number(a) > Number(b), 'Greater than'],
            ['<', (a, b) => Number(a) < Number(b), 'Less than'],
            ['>=', (a, b) => Number(a) >= Number(b), 'Greater than or equal', ['=<']],
            ['<=', (a, b) => Number(a) <= Number(b), 'Less than or equal'],
            ['=', (a, b) => a === b, 'Equality', ['=:=']],
            ['\\=', (a, b) => a !== b, 'Inequality', ['=\\=']]
        ];

        ops.forEach(([op, fn, desc, aliases]) =>
            this.functorRegistry.registerFunctorDynamic(op, fn, {
                arity: 2,
                category: 'comparison',
                description: desc,
                ...(aliases && {aliases})
            })
        );

        const arith = [
            ['+', (a, b) => Number(a) + Number(b), 'Addition'],
            ['-', (a, b) => Number(a) - Number(b), 'Subtraction'],
            ['*', (a, b) => Number(a) * Number(b), 'Multiplication'],
            ['/', (a, b) => Number(a) / Number(b), 'Division']
        ];

        arith.forEach(([op, fn, desc]) =>
            this.functorRegistry.registerFunctorDynamic(op, fn, {
                arity: 2,
                category: 'arithmetic',
                description: desc
            })
        );
    }

    async selectSecondaryPremises(primaryPremise) {
        if (!isQuestion(primaryPremise)) return super.selectSecondaryPremises(primaryPremise);

        try {
            this.memory?.updateKnowledgeBase?.(this._getAvailableTasks());
            const results = await this._resolveGoal(primaryPremise);
            return results.map(r => r.task);
        } catch (error) {
            console.error('Error in PrologStrategy resolution:', error);
            return [];
        }
    }

    async _resolveGoal(goalTask, currentDepth = 0, substitution = {}) {
        if (currentDepth >= this.config.maxDepth) return [];

        // Check for built-in predicates
        if (this._isBuiltIn(goalTask.term)) {
            return this._solveBuiltIn(goalTask, substitution);
        }

        const solutions = [];
        const applicableRules = this._findApplicableRules(goalTask);

        for (const rule of applicableRules) {
            // Standardize variables apart to prevent collisions in recursion
            const {head, body, isFact} = this._standardizeRuleVariables(rule);

            const {success, substitution: newSubstitution} = this.unifier.unify(goalTask.term, head, substitution);

            if (success) {
                if (isFact) {
                    solutions.push({
                        substitution: newSubstitution,
                        task: this._applySubstitutionToTask(goalTask, newSubstitution)
                    });
                } else if (body?.length > 0) {
                    const bodySolutions = await this._resolveRuleBody(body, newSubstitution, currentDepth + 1);
                    for (const bodySub of bodySolutions) {
                        solutions.push({
                            substitution: bodySub,
                            task: this._applySubstitutionToTask(goalTask, bodySub)
                        });
                    }
                }
            }
            if (solutions.length >= this.config.maxSolutions) break;
        }

        return solutions;
    }

    _isBuiltIn(term) {
        const pred = this._getPredicateName(term);
        return this.functorRegistry.has(pred) || pred === 'is';
    }

    _getPredicateArgs(term) {
        const components = getComponents(term);
        // Handle PrologParser structure (^, Pred, ArgsTuple)
        if (term.operator === '^' && components.length === 2) {
            return getComponents(components[1]);
        }
        return components;
    }

    _solveBuiltIn(goalTask, substitution) {
        // Apply current substitution to resolve any bound variables before evaluation
        const term = this.unifier.applySubstitution(goalTask.term, substitution);
        const pred = this._getPredicateName(term);
        const args = this._getPredicateArgs(term);

        if (args.length !== 2) return [];

        const [arg1, arg2] = args;

        try {
            if (pred === 'is') {
                // X is Expr — evaluate expression and unify with LHS
                const value = this._evalExpression(arg2);
                const valueTerm = this.termFactory.atomic(String(value));

                const unification = this.unifier.unify(arg1, valueTerm, substitution);
                if (unification.success) {
                    return [{
                        substitution: unification.substitution,
                        task: this._applySubstitutionToTask(goalTask, unification.substitution)
                    }];
                }
                return [];
            }

            // Use functor registry for comparisons
            if (this.functorRegistry.has(pred)) {
                const val1 = this._evalExpression(arg1);
                const val2 = this._evalExpression(arg2);
                const success = this.functorRegistry.execute(pred, val1, val2);

                if (success) {
                    return [{substitution, task: goalTask}];
                }
                return [];
            }

            return [];

        } catch (e) {
            // Evaluation failed (e.g. uninstantiated variable)
            return [];
        }
    }

    _evalExpression(term) {
        // Number atom
        const val = parseFloat(term.name);
        if (!isNaN(val)) return val;

        // Compound expression — use functor registry
        if (isCompound(term)) {
            const pred = this._getPredicateName(term);
            const args = this._getPredicateArgs(term);

            if (this.functorRegistry.has(pred) && args.length === 2) {
                const v1 = this._evalExpression(args[0]);
                const v2 = this._evalExpression(args[1]);
                return this.functorRegistry.execute(pred, v1, v2);
            }
        }
        throw new Error("Cannot evaluate term: " + term.toString());
    }

    _standardizeRuleVariables(rule) {
        const mapping = {};
        const suffix = `_${this.variableCounter++}`;

        const standardize = (term) => {
            if (!term) return term;
            if (isVariable(term)) {
                const name = getVariableName(term);
                if (!mapping[name]) {
                    mapping[name] = `${name}${suffix}`;
                }
                return this.termFactory.variable(mapping[name]);
            }
            if (isCompound(term)) {
                const components = getComponents(term).map(standardize);
                return this.termFactory.create(term.operator, components);
            }
            return term;
        };

        return {
            head: standardize(rule.head),
            body: rule.body ? rule.body.map(standardize) : null,
            isFact: rule.isFact
        };
    }

    async _resolveRuleBody(goals, initialSubstitution, currentDepth) {
        if (goals.length === 0) return [initialSubstitution];

        const [firstGoal, ...remainingGoals] = goals;
        const firstGoalTerm = this.unifier.applySubstitution(firstGoal, initialSubstitution);
        const firstGoalTask = this._createTaskFromTerm(firstGoalTerm, '?');

        const firstSolutions = await this._resolveGoal(firstGoalTask, currentDepth, initialSubstitution);
        const allSolutions = [];

        for (const solution of firstSolutions) {
            const nextSubstitution = solution.substitution;

            if (remainingGoals.length === 0) {
                allSolutions.push(nextSubstitution);
            } else {
                const remainingSolutions = await this._resolveRuleBody(remainingGoals, nextSubstitution, currentDepth);
                allSolutions.push(...remainingSolutions);
            }
            if (allSolutions.length >= this.config.maxSolutions) break;
        }

        return allSolutions;
    }

    _findApplicableRules(goal) {
        const goalPredicate = this._getPredicateName(goal.term);
        return this.knowledgeBase.get(goalPredicate) || [];
    }

    _getPredicateName(term) {
        return term?.getPredicate?.()?.toString()
            ?? term?.term?.getPredicate?.()?.toString()
            ?? (term?.components?.length > 0 ? this._getPredicateName(term.components[0]) : null)
            ?? term?.name
            ?? term?.toString()
            ?? 'unknown';
    }


    _applySubstitutionToTask(task, substitution) {
        if (!task || !substitution) return task;

        return new Task({
            term: this.unifier.applySubstitution(task.term, substitution),
            punctuation: task.punctuation,
            truth: task.truth ? new Truth(task.truth.frequency, task.truth.confidence) : undefined,
            budget: task.budget ? {...task.budget} : undefined
        });
    }

    _createTaskFromTerm(term, punctuation = '?', truth = null) {
        return new Task({
            term: term,
            punctuation: punctuation,
            truth: punctuation === '?' ? null : truth || new Truth(1.0, 0.9),
            budget: {priority: 0.8, durability: 0.7, quality: 0.8}
        });
    }

    updateKnowledgeBase(tasks) {
        for (const task of tasks) {
            if (task.punctuation !== '.') continue;

            const term = task.term;
            const isRule = term.operator === '==>';

            const head = isRule ? term.components[1] : term;
            const bodyTerm = isRule ? term.components[0] : null;

            const body = !isRule ? null
                : (['&&', '&/'].includes(bodyTerm.operator) ? bodyTerm.components : [bodyTerm]);

            const predicateName = this._getPredicateName(head);
            if (!this.knowledgeBase.has(predicateName)) {
                this.knowledgeBase.set(predicateName, []);
            }

            this.knowledgeBase.get(predicateName).push({
                head,
                body,
                isFact: !isRule,
                sourceTask: task
            });
        }
    }

    addPrologRule(prologRuleString) {
        try {
            this.updateKnowledgeBase(this.prologParser.parseProlog(prologRuleString));
        } catch (error) {
            console.error('Error adding Prolog rule:', error);
        }
    }

    addPrologFacts(prologFactsString) {
        this.addPrologRule(prologFactsString);
    }

    getStatus() {
        return {
            ...super.getStatus(),
            type: 'PrologStrategy',
            knowledgeBaseSize: this.knowledgeBase.size,
            registeredPredicates: Array.from(this.knowledgeBase.keys()),
            config: this.config,
            variableCounter: this.variableCounter
        };
    }

    registerFunctor(name, fn, properties = {}) {
        this.functorRegistry.registerFunctorDynamic(name, fn, properties);
        return this;
    }

    async ask(task) {
        const results = await this._resolveGoal(task);
        return results.map(r => r.task);
    }
}
