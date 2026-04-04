# MeTTa + SeNARS: Minimal Path to AGI and RSI

**Date**: 2026-03-08  
**Thesis**: AGI and RSI emerge naturally from SeNARS's existing inference engine when we add **self-representation** and **rule evolution**.

---

## Core Insight

> **SeNARS already does 80% of AGI**:
> - Continuous inference loop ✓
> - Uncertain reasoning (NARS truth values) ✓
> - Attention allocation (budgets, focus) ✓
> - Memory with consolidation ✓
> - Rule-based derivation ✓
>
> **AGI requires only**:
> 1. Represent the system's own rules as Narsese atoms
> 2. Allow rules to propose rule-modifications
> 3. Add selection pressure based on utility
>
> **RSI is the same loop, applied to itself**.

---

## The Minimal Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    THE CORE LOOP                         │
│                                                          │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐         │
│   │  SELECT  │ →  │  INFER   │ →  │  UPDATE  │         │
│   │ premises │    │  rules   │    │  memory  │         │
│   └──────────┘    └──────────┘    └──────────┘         │
│         ↑                                  │            │
│         └──────────────────────────────────┘            │
│                                                          │
│   For AGI: Add WORLD to memory                          │
│   For RSI: Add SELF to memory                           │
└─────────────────────────────────────────────────────────┘
```

**Everything is a task in memory**:
- Perceptions: `(Inh [light] [red] <f=0.9, c=0.8>)`
- Goals: `(Goal [achieve] [survival] <f=1.0, c=1.0>)`
- Rules: `(Impl <(Inh $x $y) /> <(Inh $y $z) /> <f,c>)`
- **Self-model**: `(Inh [rule-001] [active] <f,c>)`
- **Modifications**: `(Goal [modify] [rule-001] [disable])`

---

## Phase 1: AGI via Self-Modeling (4 weeks)

### Week 1-2: Represent the System in Itself

**Goal**: Every rule, concept, and budget is a Narsese atom.

```javascript
// In NAR.js - add self-modeling to the inference loop
class NAR extends BaseComponent {
    async _handleStreamDerivation(derivation) {
        // Existing: add derivation to memory
        await this._inputTask(derivation);
        
        // NEW: If derivation is about self, trigger meta-inference
        if (this._isSelfReferential(derivation)) {
            await this._inputTask(this._toMetaTask(derivation));
        }
    }
    
    _isSelfReferential(task) {
        const term = task.term.toString();
        return term.includes('rule-') || 
               term.includes('budget-') || 
               term.includes('concept-');
    }
    
    _toMetaTask(task) {
        // Wrap in meta-level goal
        return new Task(
            this._parser.parse(`(Goal [consider] ${task.term})`),
            { priority: 0.5, durability: 0.3 }
        );
    }
}
```

**MeTTa bridge** - export SeNARS state to MeTTa space:

```metta
;; In metta/src/nal/stdlib/self.metta

;; Represent rules as inspectable atoms
(= (rule-represent $rule-id $condition $conclusion $utility)
   (add-atom &self (Rule $rule-id $condition $conclusion $utility)))

;; Query rules
(= (rules-matching $pattern)
   (match &self (Rule $id $pattern $conclusion $utility)
     $id))

;; Measure rule utility
(= (rule-utility $rule-id)
   (let* (($uses (query &self (Used $rule-id)))
          ($successes (query &self (Successful $rule-id))))
     (if (== $uses 0) 0.0 (/ $successes $uses))))
```

**Milestone**: System can answer queries about its own rules.

---

### Week 3-4: Goal-Directed Self-Modification

**Goal**: System proposes and tests rule modifications.

```metta
;; Rule modification proposals

;; If rule has low utility, propose disabling
(= (propose-modification $rule-id)
   (let (($util (rule-utility $rule-id)))
     (if (< $util 0.3)
         `(modify-rule ,rule-id disable)
         (if (> $util 0.8)
             `(modify-rule ,rule-id generalize)
             'no-op))))

;; Generalize a successful rule
(= (generalize-rule $rule-id)
   (let* (($rule (get-rule $rule-id))
          ($vars (extract-variables $rule)))
     ;; Replace specific terms with variables
     (add-rule (generalize-pattern $rule $vars))))

;; Apply modification
(= (apply-modification $mod)
   (match $mod
     ((modify-rule $id disable) (disable-rule $id))
     ((modify-rule $id generalize) (generalize-rule $id))
     ((modify-rule $id add $pattern $conclusion) (add-rule $pattern $conclusion))))
```

**JavaScript integration**:

```javascript
// In NAR.js - handle modification proposals
class NAR {
    async _inputTask(task, options = {}) {
        const added = await this.memory.addTask(task);
        
        // NEW: Check if task is a modification proposal
        if (this._isModificationProposal(task)) {
            await this._executeModification(task);
        }
        
        return added;
    }
    
    _isModificationProposal(task) {
        return task.term.name === 'Goal' && 
               task.term.children[1]?.name === 'modify-rule';
    }
    
    async _executeModification(task) {
        const [_, ruleId, action] = task.term.children;
        
        switch (action.name) {
            case 'disable':
                this.ruleEngine.disableRule(ruleId.name);
                break;
            case 'generalize':
                await this._generalizeRule(ruleId.name);
                break;
            case 'add':
                // Add new rule from task payload
                break;
        }
        
        // Record the modification for learning
        this.memory.addTask(new Task(
            this._parser.parse(`(Modified ${ruleId.name} ${action.name})`),
            { priority: 0.9 }
        ));
    }
}
```

**Milestone**: System can disable low-utility rules and generalize high-utility ones.

---

## Phase 2: RSI via Rule Evolution (4 weeks)

### Week 5-6: Mutation and Crossover

**Goal**: Rules evolve through variation operators.

```metta
;; Mutation operators

;; Mutate a rule's condition
(= (mutate-condition $rule-id)
   (let* (($rule (get-rule $rule-id))
          ($new-cond (mutate-pattern (condition $rule))))
     `(modify-rule ,rule-id replace-condition ,new-cond)))

;; Mutate a rule's conclusion  
(= (mutate-conclusion $rule-id)
   (let* (($rule (get-rule $rule-id))
          ($new-conc (mutate-pattern (conclusion $rule))))
     `(modify-rule ,rule-id replace-conclusion ,new-conc)))

;; Crossover: combine two rules
(= (crossover $rule1 $rule2)
   (let* (($c1 (condition $rule1))
          ($c2 (conclusion $rule2)))
     `(add-rule ,c1 ,c2)))

;; Random mutation based on utility
(= (evolve-rule $rule-id)
   (let (($util (rule-utility $rule-id)))
     (if (< $util 0.5)
         ;; Low utility: high mutation
         (if (< (random) 0.5)
             (mutate-condition $rule-id)
             (mutate-conclusion $rule-id))
         ;; High utility: low mutation (crossover)
         (let (($partner (select-partner $rule-id)))
           (crossover $rule-id $partner)))))

;; Select crossover partner (similar rules with good utility)
(= (select-partner $rule-id)
   (let* (($my-cond (condition (get-rule $rule-id)))
          ($candidates (rules-with-similar-condition $my-cond)))
     (max-by utility (filter (λ (r) (> (rule-utility r) 0.6)) $candidates))))
```

**JavaScript implementation**:

```javascript
// In NAR.js - rule evolution
class NAR {
    async runEvolutionCycle() {
        const rules = this.ruleEngine.getAllRules();
        
        for (const rule of rules) {
            // Skip recently modified rules
            if (Date.now() - rule.lastModified < 60000) continue;
            
            // Get utility from memory
            const utility = await this._getRuleUtility(rule.id);
            
            // Decide evolution operator
            let proposal;
            if (utility < 0.3) {
                // High chance of mutation or removal
                proposal = Math.random() < 0.5 
                    ? this._proposeMutation(rule)
                    : this._proposeRemoval(rule);
            } else if (utility > 0.7) {
                // Crossover with similar rules
                const partner = this._selectPartner(rule);
                if (partner) {
                    proposal = this._proposeCrossover(rule, partner);
                }
            } else {
                // Low-probability mutation
                if (Math.random() < 0.1) {
                    proposal = this._proposeMutation(rule);
                }
            }
            
            if (proposal) {
                await this._executeModification(proposal);
            }
        }
    }
    
    _proposeMutation(rule) {
        // Randomly mutate condition or conclusion
        const mutator = Math.random() < 0.5 
            ? this._mutateCondition
            : this._mutateConclusion;
        
        return new Task(
            this._parser.parse(`(Goal [modify-rule] [${rule.id}] [${mutator.name}])`),
            { priority: 0.6 }
        );
    }
    
    _mutateCondition(rule) {
        // Replace a term with a similar term from memory
        const terms = this.memory.getAllTerms();
        const similar = this._findSimilarTerms(rule.condition, terms);
        const replacement = similar[Math.floor(Math.random() * similar.length)];
        
        return this._replaceTerm(rule.condition, replacement);
    }
    
    _findSimilarTerms(term, candidates) {
        // Use embedding similarity if available
        if (this.embeddingLayer) {
            return this.embeddingLayer.findSimilar(term, candidates, 5);
        }
        // Fallback: structural similarity
        return candidates.filter(c => 
            c.length > 0 && c[0] === term[0]
        );
    }
}
```

**Milestone**: Rules evolve through mutation and crossover.

---

### Week 7-8: Selection Pressure and Fitness

**Goal**: Successful rules proliferate; failed rules die.

```metta
;; Fitness tracking

;; Record rule usage
(= (record-usage $rule-id $success)
   (seq
     (add-atom &self (Used $rule-id))
     (if $success
         (add-atom &self (Successful $rule-id))
         (add-atom &self (Failed $rule-id)))))

;; Compute fitness (success rate with recency weighting)
(= (rule-fitness $rule-id)
   (let* (($recent-uses (query &self (Recent-Used $rule-id 100)))
          ($recent-success (query &self (Recent-Successful $rule-id 100)))
          ($recent-fail (query &self (Recent-Failed $rule-id 100))))
     (if (== $recent-uses 0)
         0.5  ;; Prior for untested rules
         (/ (+ $recent-success 1) (+ $recent-uses 2)))))  ;; Laplace smoothing

;; Selection: keep high-fitness rules
(= (selection-step)
   (let* (($rules (all-rules))
          ($fitnesses (map (λ (r) (cons r (rule-fitness r))) $rules))
          ($mean-fitness (/ (sum (map cdr $fitnesses)) (length $rules))))
     ;; Remove rules below threshold
     (for-each (λ (rf)
                 (if (< (cdr rf) (* 0.5 $mean-fitness))
                     (remove-rule (car rf))))
               $fitnesses)))

;; Reproduction: duplicate high-fitness rules with mutation
(= (reproduction-step)
   (let* (($rules (all-rules))
          ($top-rules (top-n-by rule-fitness $rules 10)))
     (for-each (λ (r)
                 (if (> (rule-fitness r) 0.8)
                     (seq
                       (evolve-rule r)  ;; Create variant
                       (record-usage r #t))))  ;; Reward parent
               $top-rules)))
```

**JavaScript selection**:

```javascript
// In NAR.js - fitness-based selection
class NAR {
    async runSelectionCycle() {
        const rules = this.ruleEngine.getAllRules();
        const fitnesses = await Promise.all(
            rules.map(r => this._computeFitness(r))
        );
        
        const meanFitness = fitnesses.reduce((a, b) => a + b, 0) / rules.length;
        const threshold = meanFitness * 0.5;
        
        // Remove low-fitness rules
        for (let i = 0; i < rules.length; i++) {
            if (fitnesses[i] < threshold) {
                this.ruleEngine.removeRule(rules[i].id);
                this._recordEvent('rule_removed', { 
                    id: rules[i].id, 
                    fitness: fitnesses[i] 
                });
            }
        }
        
        // Duplicate high-fitness rules
        const topRules = rules
            .filter((_, i) => fitnesses[i] > 0.8)
            .slice(0, 10);
            
        for (const rule of topRules) {
            // Create mutated copy
            const mutant = this._createMutant(rule);
            this.ruleEngine.addRule(mutant);
            
            // Reward parent
            this._recordEvent('rule_reproduced', { 
                id: rule.id, 
                mutant: mutant.id 
            });
        }
    }
    
    async _computeFitness(rule) {
        const events = await this._getRuleEvents(rule.id, 100);
        const successes = events.filter(e => e.type === 'success').length;
        const failures = events.filter(e => e.type === 'failure').length;
        
        // Laplace smoothing
        return (successes + 1) / (successes + failures + 2);
    }
    
    _createMutant(rule) {
        const mutant = { ...rule, id: `rule-${Date.now()}` };
        
        // Apply random mutation
        if (Math.random() < 0.5) {
            mutant.condition = this._mutateCondition(rule);
        } else {
            mutant.conclusion = this._mutateConclusion(rule);
        }
        
        return mutant;
    }
}
```

**Milestone**: Rule population evolves toward higher utility.

---

## Phase 3: Open-Ended Intelligence (4 weeks)

### Week 9-10: Autonomous Goal Generation

**Goal**: System generates its own learning objectives.

```metta
;; Curiosity: explore uncertain regions

(= (find-uncertain-concepts)
   (match &self (Concept $c (Truth $f $c))
     (if (and (> $c 0.3) (< $c 0.7))  ;; Medium confidence = uncertain
         $c)))

(= (generate-exploration-goal)
   (let (($uncertain (find-uncertain-concepts)))
     (if (not (empty? $uncertain))
         (let (($target (random-element $uncertain)))
           `(Goal [explore] ,target))
         'no-op)))

;; Competence: master challenging skills

(= (find-skill-edges)
   (match &self (Skill $s (Success-Rate $r))
     (if (and (> $r 0.3) (< $r 0.8))  ;; Challenging but learnable
         $s)))

(= (generate-mastery-goal)
   (let (($edges (find-skill-edges)))
     (if (not (empty? $edges))
         (let (($skill (random-element $edges)))
           `(Goal [master] ,skill))
         'no-op)))

;; Coherence: resolve contradictions

(= (find-contradictions)
   (match &self 
     (and (Inh $s $p1 $tv1) (Inh $s $p2 $tv2))
     (if (contradictory? $p1 $p2)
         (cons $p1 $p2))))

(= (generate-coherence-goal)
   (let (($contras (find-contradictions)))
     (if (not (empty? $contras))
         (let (($pair (random-element $contras)))
           `(Goal [resolve] ,(car $pair) ,(cdr $pair)))
         'no-op)))

;; Meta-goal: improve own learning

(= (generate-meta-goal)
   (let (($learning-rate (compute-learning-rate)))
     (if (< $learning-rate 0.1)  ;; Learning too slow
         `(Goal [improve] [learning-algorithm])
         'no-op)))
```

**JavaScript goal manager**:

```javascript
// Simple autonomous goal generator
class GoalGenerator {
    constructor(nar) {
        this.nar = nar;
        this.goalTypes = ['exploration', 'mastery', 'coherence', 'meta'];
    }
    
    async generateGoals() {
        const goals = [];
        
        // Curiosity goals
        const uncertain = await this._findUncertainConcepts();
        for (const concept of uncertain.slice(0, 3)) {
            goals.push(this._createGoal('explore', concept));
        }
        
        // Competence goals
        const skillEdges = await this._findSkillEdges();
        for (const skill of skillEdges.slice(0, 2)) {
            goals.push(this._createGoal('master', skill));
        }
        
        // Coherence goals
        const contradictions = await this._findContradictions();
        for (const contra of contradictions.slice(0, 2)) {
            goals.push(this._createGoal('resolve', contra));
        }
        
        // Meta goals
        const learningRate = await this._computeLearningRate();
        if (learningRate < 0.1) {
            goals.push(this._createGoal('improve', 'learning-algorithm'));
        }
        
        return goals;
    }
    
    _createGoal(type, target) {
        return new Task(
            this.nar._parser.parse(`(Goal [${type}] [${target}])`),
            { priority: 0.7, durability: 0.5 }
        );
    }
    
    async _findUncertainConcepts() {
        const concepts = Array.from(this.nar.memory.concepts.values());
        return concepts
            .filter(c => {
                const tv = c.getAverageTruth();
                return tv.confidence > 0.3 && tv.confidence < 0.7;
            })
            .map(c => c.term);
    }
    
    async _findSkillEdges() {
        // Skills with 30-80% success rate
        const skills = await this._getAllSkills();
        return skills
            .filter(s => s.successRate > 0.3 && s.successRate < 0.8)
            .map(s => s.term);
    }
    
    async _findContradictions() {
        // Find conflicting beliefs
        const beliefs = Array.from(this.nar.memory.concepts.values());
        const contradictions = [];
        
        for (let i = 0; i < beliefs.length; i++) {
            for (let j = i + 1; j < beliefs.length; j++) {
                if (this._areContradictory(beliefs[i], beliefs[j])) {
                    contradictions.push([beliefs[i].term, beliefs[j].term]);
                }
            }
        }
        
        return contradictions;
    }
    
    _areContradictory(c1, c2) {
        // Simple contradiction: same subject, incompatible predicates
        if (c1.term.children?.[0]?.name !== c2.term.children?.[0]?.name) {
            return false;
        }
        const incompatible = [
            ['red', 'blue'], ['hot', 'cold'], ['alive', 'dead']
        ];
        const p1 = c1.term.children?.[1]?.name;
        const p2 = c2.term.children?.[1]?.name;
        return incompatible.some(pair => 
            (pair[0] === p1 && pair[1] === p2) ||
            (pair[0] === p2 && pair[1] === p1)
        );
    }
}
```

**Milestone**: System generates and pursues self-directed goals.

---

### Week 11-12: Integration and Emergence

**Goal**: All components work together; measure emergent intelligence.

```javascript
// Unified cognitive cycle
class CognitiveAgent extends NAR {
    constructor(config) {
        super(config);
        this.goalGenerator = new GoalGenerator(this);
        this.evolutionInterval = 1000;  // Run evolution every 1000 cycles
        this.goalInterval = 100;        // Generate goals every 100 cycles
    }
    
    async run() {
        let cycle = 0;
        
        while (this.isRunning) {
            // Standard NARS inference (inherited)
            await this.step();
            cycle++;
            
            // Autonomous goal generation
            if (cycle % this.goalInterval === 0) {
                const goals = await this.goalGenerator.generateGoals();
                for (const goal of goals) {
                    await this.input(goal);
                }
            }
            
            // Rule evolution
            if (cycle % this.evolutionInterval === 0) {
                await this.runEvolutionCycle();
                await this.runSelectionCycle();
            }
            
            // Metrics
            if (cycle % 100 === 0) {
                this._logMetrics(cycle);
            }
        }
    }
    
    _logMetrics(cycle) {
        const rules = this.ruleEngine.getAllRules();
        const avgUtility = rules.reduce((sum, r) => sum + r.utility, 0) / rules.length;
        
        console.log(`Cycle ${cycle}: ${rules.length} rules, avg utility: ${avgUtility.toFixed(3)}`);
    }
}
```

**Milestone**: Integrated system running autonomously.

---

## Evaluation: What Counts as AGI?

### Minimal AGI Tests

| Test | Description | Pass Criteria |
|------|-------------|---------------|
| **Transfer** | Learn task A, apply to similar task B | Solves B faster than from scratch |
| **Abstraction** | Learn specific rules, form general rule | General rule covers >80% of cases |
| **Self-improvement** | Start with random rules, improve | Utility increases >50% over 1000 cycles |
| **Goal pursuit** | Given goal, achieve it | Success rate >60% on achievable goals |
| **Curiosity** | No external goals, explore | Discovers >10 novel concepts per 100 cycles |

### RSI Tests

| Test | Description | Pass Criteria |
|------|-------------|---------------|
| **Self-model accuracy** | Query system about itself | >90% accuracy on rule/budget queries |
| **Safe modification** | Modify rules without breaking | System remains functional after 100 modifications |
| **Improvement rate** | Measure utility over time | Positive slope over 1000 cycles |
| **Goal stability** | Preserve goals across modifications | Core goals unchanged after self-mod |

---

## The Complete System (150 lines)

```javascript
// metta-agi.js - Minimal AGI/RSI implementation
import { NAR } from '@senars/core';
import { loadNALStdlib } from '@senars/metta/nal';

export class CognitiveAgent extends NAR {
    constructor(config = {}) {
        super({
            maxConcepts: 500,
            maxDerivationsPerStep: 100,
            enableSelfModeling: true,
            enableRuleEvolution: true,
            ...config
        });
        
        this.goalGenerator = new GoalGenerator(this);
        this.cycleCount = 0;
    }
    
    async initialize() {
        await super.initialize();
        
        // Load NAL reasoning rules
        loadNALStdlib(this.metta);
        
        // Load self-modeling rules
        await this.metta.run(`
            ;; Self-modeling primitives
            (= (rule-represent $id $cond $conc $util)
               (add-atom &self (Rule $id $cond $conc $util)))
            
            ;; Utility tracking
            (= (record-success $id) (add-atom &self (Successful $id)))
            (= (record-failure $id) (add-atom &self (Failed $id)))
            
            ;; Modification proposals
            (= (propose-evolution)
               (let* (($rules (match &self (Rule $id $c $u $util) $id))
                      ($low (filter (λ (r) (< (rule-utility r) 0.3)) $rules)))
                 (for-each (λ (r) (evolve-rule r)) $low)))
        `);
        
        // Seed initial rules
        this._seedInitialRules();
    }
    
    async run(duration = 10000) {
        const startTime = Date.now();
        const endTime = startTime + duration;
        
        while (Date.now() < endTime && this.isRunning) {
            await this.step();
            this.cycleCount++;
            
            // Goal generation every 100 cycles
            if (this.cycleCount % 100 === 0) {
                const goals = await this.goalGenerator.generateGoals();
                for (const goal of goals) {
                    await this.input(goal);
                }
            }
            
            // Evolution every 1000 cycles
            if (this.cycleCount % 1000 === 0) {
                await this._runEvolution();
            }
            
            // Metrics every 100 cycles
            if (this.cycleCount % 100 === 0) {
                this._logMetrics();
            }
        }
        
        return this._getFinalMetrics();
    }
    
    async _runEvolution() {
        const rules = this.ruleEngine.getAllRules();
        
        for (const rule of rules) {
            const utility = await this._getRuleUtility(rule.id);
            
            if (utility < 0.3) {
                // Mutate or remove
                if (Math.random() < 0.5) {
                    this.ruleEngine.removeRule(rule.id);
                } else {
                    this._mutateRule(rule);
                }
            } else if (utility > 0.7) {
                // Reproduce with mutation
                const mutant = this._createMutant(rule);
                this.ruleEngine.addRule(mutant);
            }
        }
    }
    
    _seedInitialRules() {
        // Basic inference rules
        this.ruleEngine.addRule({
            id: 'rule-deduce',
            condition: '(Inh $s $m) (Inh $m $p)',
            conclusion: '(Inh $s $p)',
            utility: 0.5
        });
        
        this.ruleEngine.addRule({
            id: 'rule-induce',
            condition: '(Inh $s $m) (Inh $p $m)',
            conclusion: '(Inh $s $p)',
            utility: 0.5
        });
    }
    
    _logMetrics() {
        const rules = this.ruleEngine.getAllRules();
        const avgUtility = rules.reduce((sum, r) => sum + r.utility, 0) / rules.length;
        const concepts = this.memory.stats.totalConcepts;
        
        console.log(`[${this.cycleCount}] Rules: ${rules.length}, Utility: ${avgUtility.toFixed(3)}, Concepts: ${concepts}`);
    }
}

// Usage
const agent = new CognitiveAgent();
await agent.initialize();
const metrics = await agent.run(60000);  // Run for 1 minute
console.log('Final metrics:', metrics);
```

---

## Why This Works

### 1. **Leverages Existing Infrastructure**
- SeNARS already has: inference, memory, attention, budgets
- We add: self-representation, evolution operators

### 2. **Minimal New Code**
- ~500 lines for full AGI/RSI
- Most logic in MeTTa rules (data, not code)

### 3. **Emergent, Not Engineered**
- Intelligence emerges from selection pressure
- No hand-crafted "intelligence modules"

### 4. **Safe by Design**
- Low-utility rules removed first
- Changes are incremental
- System can rollback via memory

### 5. **Measurable Progress**
- Rule utility tracks improvement
- Clear pass/fail tests

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| **Rule explosion** | Hard limit on rule count; selection pressure |
| **Utility hacking** | Multi-metric fitness (success + novelty + efficiency) |
| **Goal drift** | Core goals in protected memory region |
| **Evolution stagnation** | Minimum mutation rate; periodic random injection |

---

## Timeline Summary

| Phase | Weeks | Outcome |
|-------|-------|---------|
| **Self-Modeling** | 1-4 | System represents and queries itself |
| **Rule Evolution** | 5-8 | Rules mutate, crossover, selected |
| **Autonomous Goals** | 9-10 | Self-generated learning objectives |
| **Integration** | 11-12 | Full system running |

**Total: 12 weeks to minimal AGI/RSI**

---

## Conclusion

> **AGI is not a destination but a direction**. This system becomes more intelligent over time through:
> 1. **Learning** (NARS inference)
> 2. **Evolution** (rule variation + selection)
> 3. **Self-direction** (autonomous goals)
>
> **RSI is the same process, recursively applied**. The system improves its improvement process.
>
> **Start simple. Measure everything. Let intelligence emerge.**

---

*"The simplest thing that could possibly work—and then let it evolve."*
