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
import {isQuestion} from '../RuleHelpers.js';

export class PrologStrategy extends Strategy {
    constructor(config = {}) {
        super(config);
        this.name = 'PrologStrategy';
        this.prologParser = new PrologParser(config.termFactory || new TermFactory());
        this.termFactory = this.prologParser.termFactory;
        this.goalStack = []; // For backtracking
        this.knowledgeBase = new Map(); // Store facts and rules for resolution
        this.substitutionStack = []; // Track variable bindings during resolution
        this.variableCounter = 0; // For generating unique variable names

        // Configuration for Prolog-style reasoning
        this.config = {
            maxDepth: 10,
            maxSolutions: 5,
            backtrackingEnabled: true,
            ...config
        };
    }

    /**
     * Override the parent method to implement Prolog-style goal-driven reasoning
     */
    async selectSecondaryPremises(primaryPremise) {
        if (!isQuestion(primaryPremise)) {
            return super.selectSecondaryPremises(primaryPremise);
        }

        try {
            this.memory && this.updateKnowledgeBase(this._getAvailableTasks());
            const results = await this._resolveGoal(primaryPremise);
            return results.map(r => r.task);
        } catch (error) {
            console.error('Error in PrologStrategy resolution:', error);
            return [];
        }
    }

    /**
     * Resolve a goal using Prolog-style backward chaining
     * Returns array of {substitution, task}
     * @private
     */
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

            const {success, substitution: newSubstitution} = this._unify(goalTask.term, head, substitution);

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
        return ['is', '>', '<', '>=', '<=', '=', '\\='].includes(pred);
    }

    _getPredicateArgs(term) {
        const components = this._getTermComponents(term);
        // Handle PrologParser structure (^, Pred, ArgsTuple)
        if (term.operator === '^' && components.length === 2) {
             return this._getTermComponents(components[1]);
        }
        return components;
    }

    _solveBuiltIn(goalTask, substitution) {
        // Apply current substitution to resolve any bound variables before evaluation
        const term = this._applySubstitutionToTerm(goalTask.term, substitution);
        const pred = this._getPredicateName(term);
        const args = this._getPredicateArgs(term);

        if (args.length !== 2) return [];

        const [arg1, arg2] = args;

        try {
            if (pred === 'is') {
                // X is Expr
                const value = this._evalExpression(arg2);
                const valueTerm = this.termFactory.create(String(value));

                const unification = this._unify(arg1, valueTerm, substitution);
                if (unification.success) {
                     return [{
                         substitution: unification.substitution,
                         task: this._applySubstitutionToTask(goalTask, unification.substitution)
                     }];
                }
                return [];
            }

            // Comparisons
            const val1 = this._evalExpression(arg1);
            const val2 = this._evalExpression(arg2);
            let success = false;

            switch(pred) {
                case '>': success = val1 > val2; break;
                case '<': success = val1 < val2; break;
                case '>=': success = val1 >= val2; break;
                case '<=': success = val1 <= val2; break;
                case '=': success = val1 === val2; break;
                case '\\=': success = val1 !== val2; break;
            }

            if (success) {
                return [{ substitution, task: goalTask }];
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

        // Compound expression
        if (this._isCompound(term)) {
            const pred = this._getPredicateName(term);
            const args = this._getPredicateArgs(term); // Use getPredicateArgs to handle ^ structure in expressions too!

            if (args.length === 2) {
                const v1 = this._evalExpression(args[0]);
                const v2 = this._evalExpression(args[1]);
                switch(pred) {
                    case '+': return v1 + v2;
                    case '-': return v1 - v2;
                    case '*': return v1 * v2;
                    case '/': return v1 / v2;
                }
            }
        }
        throw new Error("Cannot evaluate term: " + term.toString());
    }

    /**
     * Standardize variables in a rule to ensure they are unique for this instantiation
     * @private
     */
    _standardizeRuleVariables(rule) {
        const mapping = {};
        const suffix = `_${this.variableCounter++}`;

        const standardize = (term) => {
            if (!term) return term;
            if (this._isVariable(term)) {
                const name = this._getVariableName(term);
                if (!mapping[name]) {
                    mapping[name] = `${name}${suffix}`;
                }
                return this.termFactory.variable(mapping[name]);
            }
            if (this._isCompound(term)) {
                const components = this._getTermComponents(term).map(standardize);
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

    /**
     * Resolve the body of a rule (a conjunction of goals)
     * Returns array of substitutions
     * @private
     */
    async _resolveRuleBody(goals, initialSubstitution, currentDepth) {
        if (goals.length === 0) return [initialSubstitution];

        const [firstGoal, ...remainingGoals] = goals;
        const firstGoalTerm = this._applySubstitutionToTerm(firstGoal, initialSubstitution);
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

    /**
     * Find applicable rules/facts that could match the goal
     * @private
     */
    _findApplicableRules(goal) {
        const goalPredicate = this._getPredicateName(goal.term);
        return this.knowledgeBase.get(goalPredicate) || [];
    }

    /**
     * Get the predicate name from a term
     * @private
     */
    _getPredicateName(term) {
        return term?.getPredicate?.()?.toString()
            ?? term?.term?.getPredicate?.()?.toString()
            ?? (term?.components?.length > 0 ? this._getPredicateName(term.components[0]) : null)
            ?? term?.name
            ?? term?.toString()
            ?? 'unknown';
    }

    /**
     * Unify two terms and return the substitution
     * @private
     */
    _unify(term1, term2, substitution = {}) {
        const t1 = this._applySubstitutionToTerm(term1, substitution);
        const t2 = this._applySubstitutionToTerm(term2, substitution);

        if (this._isVariable(t1)) return this._unifyVariable(t1, t2, substitution);
        if (this._isVariable(t2)) return this._unifyVariable(t2, t1, substitution);

        if (this._termsEqual(t1, t2)) return { success: true, substitution };

        if (this._isCompound(t1) && this._isCompound(t2)) {
            if (this._getTermArity(t1) !== this._getTermArity(t2)) {
                return { success: false, substitution: {} };
            }

            if ((t1.operator || '') !== (t2.operator || '')) {
                return { success: false, substitution: {} };
            }

            let currentSubstitution = substitution;
            const components1 = this._getTermComponents(t1);
            const components2 = this._getTermComponents(t2);

            for (let i = 0; i < components1.length; i++) {
                const result = this._unify(components1[i], components2[i], currentSubstitution);
                if (!result.success) return { success: false, substitution: {} };
                currentSubstitution = result.substitution;
            }
            return { success: true, substitution: currentSubstitution };
        }
        return { success: false, substitution: {} };
    }

    _unifyVariable(variable, term, substitution) {
        const varName = this._getVariableName(variable);
        if (substitution[varName]) {
            return this._unify(substitution[varName], term, substitution);
        }

        const termVarName = this._getVariableName(term);
        if (this._isVariable(term) && substitution[termVarName]) {
            return this._unify(variable, substitution[termVarName], substitution);
        }

        if (this._occursCheck(varName, term, substitution)) {
            return { success: false, substitution: {} };
        }

        return { success: true, substitution: { ...substitution, [varName]: term } };
    }

    /**
     * Check if a term is compound (has components)
     * @private
     */
    _isCompound(term) {
        if (!term) return false;
        if (typeof term.isCompound === 'boolean') return term.isCompound;
        return !!(term.operator || (term.args && Array.isArray(term.args)));
    }

    /**
     * Get the arity (number of arguments) of a term
     * @private
     */
    _getTermArity(term) {
        return this._getTermComponents(term).length;
    }

    /**
     * Get the components of a term.
     * Normalized to include all structural components.
     * @private
     */
    _getTermComponents(term) {
        return term.components || term.args || [];
    }

    /**
     * Check if two terms are equal under a substitution
     * @private
     */
    _termsEqual(term1, term2) {
        if (!term1 || !term2) return false;
        if (typeof term1.equals === 'function') return term1.equals(term2);
        if (term1.name && term2.name) return term1.name === term2.name;
        return term1.toString() === term2.toString();
    }

    /**
     * Check if a term represents a variable
     * @private
     */
    _isVariable(term) {
        if (!term) return false;
        const name = term.name || term._name || '';
        return name.startsWith('?') || name.startsWith('_') || /^[A-Z]/.test(name);
    }

    /**
     * Get variable name
     * @private
     */
    _getVariableName(term) {
        return term.name || term._name || 'unknown';
    }

    /**
     * Perform occurs check to prevent circular substitutions
     * @private
     */
    _occursCheck(varName, term, substitution) {
        if (this._isVariable(term) && this._getVariableName(term) === varName) return true;

        if (this._isCompound(term)) {
            return this._getTermComponents(term).some(comp => this._occursCheck(varName, comp, substitution));
        }

        return false;
    }

    /**
     * Apply substitution to a single term
     * @private
     */
    _applySubstitutionToTerm(term, substitution) {
        if (!term) return term;

        if (this._isVariable(term)) {
            const varName = this._getVariableName(term);
            if (substitution[varName]) {
                return this._applySubstitutionToTerm(substitution[varName], substitution);
            }
            return term;
        }

        if (this._isCompound(term)) {
            const newComponents = this._getTermComponents(term).map(comp =>
                this._applySubstitutionToTerm(comp, substitution)
            );

            return this.termFactory.create(term.operator, newComponents);
        }

        return term;
    }

    /**
     * Apply substitution to a task
     * @private
     */
    _applySubstitutionToTask(task, substitution) {
        if (!task || !substitution) return task;

        return new Task({
            term: this._applySubstitutionToTerm(task.term, substitution),
            punctuation: task.punctuation,
            truth: task.truth ? new Truth(task.truth.frequency, task.truth.confidence) : undefined,
            budget: task.budget ? {...task.budget} : undefined
        });
    }

    /**
     * Create a task from a term
     * @private
     */
    _createTaskFromTerm(term, punctuation = '?', truth = null) {
        return new Task({
            term: term,
            punctuation: punctuation,
            truth: punctuation === '?' ? null : truth || new Truth(1.0, 0.9),
            budget: {priority: 0.8, durability: 0.7, quality: 0.8}
        });
    }

    /**
     * Update the knowledge base with new facts/rules from memory
     * @public
     */
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

    /**
     * Add a Prolog rule to the knowledge base
     * @public
     */
    addPrologRule(prologRuleString) {
        try {
            this.updateKnowledgeBase(this.prologParser.parseProlog(prologRuleString));
        } catch (error) {
            console.error('Error adding Prolog rule:', error);
        }
    }

    /**
     * Parse and add Prolog facts to the knowledge base
     * @public
     */
    addPrologFacts(prologFactsString) {
        this.addPrologRule(prologFactsString);
    }

    /**
     * Get strategy status information
     * @public
     */
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

    async ask(task) {
        const results = await this._resolveGoal(task);
        return results.map(r => r.task);
    }
}
