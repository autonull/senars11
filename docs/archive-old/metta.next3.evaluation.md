# Critical Evaluation: metta.next3.md Plan

**Date**: 2026-03-08  
**Purpose**: Honest assessment of whether this AGI/RSI plan will actually deliver useful results

---

## Executive Summary

**Verdict**: The plan is **moderately useful as a research direction** but **oversells its AGI/RSI claims**. It will likely produce:

| Outcome | Likelihood | Value |
|---------|------------|-------|
| Interesting self-modifying system | **High (80%)** | Research value |
| Measurable capability improvements | **Medium (50%)** | Practical value |
| Genuine AGI capabilities | **Low (15%)** | Transformative |
| Safe, controlled RSI | **Low-Medium (40%)** | Safety value |

**Recommendation**: Proceed, but reframe as **"Self-Improving Inference System"** research, not AGI pathway. Set realistic expectations.

---

## What the Plan Gets Right ✓

### 1. Builds on Working Infrastructure

The SeNARS/MeTTa foundation is real and functional:
- ✅ Inference engine works
- ✅ Memory with attention allocation works
- ✅ Rule-based derivation works
- ✅ MeTTa self-modification works

**This matters**: Many AGI proposals start from scratch. This extends proven code.

### 2. Minimal, Testable Design

~800 lines of new code is auditable and debuggable. Compare to:
- OpenCog: 500,000+ lines
- SOAR: 300,000+ lines
- NARS (original): 50,000+ lines

**This matters**: You can actually understand what the system is doing.

### 3. Clear Evaluation Criteria

The plan specifies measurable milestones:
- Rule utility tracking
- Self-model query accuracy
- Goal achievement rates

**This matters**: You'll know if it's working or not.

### 4. Risk Awareness

The plan identifies real risks:
- Rule explosion
- Utility hacking (Goodhart's law)
- Goal drift

**This matters**: Problems are anticipated, not surprises.

---

## What the Plan Gets Wrong ✗

### 1. The Intelligence Illusion

**Claim**: Rule utility improvement = intelligence improvement

**Problem**: A system can optimize for derivation success while becoming *less* useful.

**Example**:
```narsese
;; Rule that always succeeds but is useless
(Inh $x $x) → (Inh $x $x)  ;; 100% success rate!
```

**Reality**: Success rate on derivations ≠ capability on real tasks.

**Missing**: External validation against meaningful benchmarks.

---

### 2. The Grounding Problem (Unaddressed)

**Problem**: The system manipulates symbols without understanding what they mean.

**Current state**:
```narsese
(Inh [cat] [animal])  ;; Symbol manipulation
```

**What's missing**: Connection to sensory experience, action outcomes, real-world consequences.

**Why this matters**: Without grounding, "intelligence" is syntactic, not semantic. The system can't distinguish:
- `(Inh [water] [drinkable])` — useful
- `(Inh [water] [explosive])` — equally valid syntactically

**Historical lesson**: This is why classic GOFAI failed. Symbol manipulation alone doesn't produce understanding.

---

### 3. The RSI Claim is Premature

**Claim**: System will recursively self-improve

**What's actually specified**:
1. Track rule utility
2. Mutate low-utility rules
3. Duplicate high-utility rules

**What's missing for true RSI**:
- Understanding *why* a rule succeeded/failed
- Proposing *targeted* modifications (not random mutation)
- Verifying modifications improve *capabilities* (not just utility scores)
- Preserving knowledge across modifications

**Reality**: This is **evolutionary search**, not recursive self-improvement. Evolution works, but:
- It's slow (millions of generations)
- It's blind (no understanding of improvements)
- It doesn't scale to complex capabilities

**Honest framing**: "Evolutionary rule optimization" not "RSI"

---

### 4. Evaluation Benchmarks are Weak

**Current tests**:
```javascript
// "Transfer" test
await agent.input('(Inh [fluffy] [cat])');
await agent.input('(Inh [whiskers] [cat])');
// Measures: derivation speed
```

**Problem**: This tests memory retrieval, not generalization.

**Better benchmarks**:
| Benchmark | What it tests | Current plan has it? |
|-----------|---------------|---------------------|
| ARC-AGI | Abstract reasoning | ❌ |
| bAbI | Question answering | ❌ |
| MiniHack | Embodied learning | ❌ |
| ProcGen | Transfer learning | ❌ |

**Reality**: Without external benchmarks, you're measuring internal metrics that may not correlate with capability.

---

### 5. Safety Mitigations are Insufficient

**Current safety**:
```javascript
// "Protected core" goals
this.coreGoals = new Set(['survival', 'learn', 'improve']);
```

**Problems**:
1. Goals are strings — trivially modified
2. No formal verification of modifications
3. No external oversight mechanism
4. No capability limits

**If this actually worked**, the safety would be inadequate. The plan acknowledges this but doesn't solve it.

**Honest assessment**: If you're worried about RSI risks, don't build RSI. If you're building it, take safety more seriously.

---

### 6. Historical Precedent is Ignored

**Similar approaches tried**:

| System | Approach | Result |
|--------|----------|--------|
| **Classifier Systems (Holland)** | Rule evolution with buckets | Limited capability |
| **SOAR** | Rule-based cognition | Narrow domains only |
| **ACT-R** | Production rules + memory | Cognitive modeling, not AGI |
| **OpenCog** | Evolutionary rule learning | No breakthrough |
| **NARS** (original) | Uncertain inference | Research system |

**Pattern**: Rule-based systems with evolution/modification work for narrow tasks but don't scale to general intelligence.

**Question**: What makes this approach different?

**Plan's answer**: Implicitly, "better integration" and "MeTTa self-modification." This is not a compelling answer.

---

## What Would Make This More Useful

### 1. Reframe the Claims

**Instead of**: "Pathway to AGI and RSI"

**Say**: "Self-Improving Inference System for Adaptive Reasoning"

**Why**: Accurate expectations attract serious researchers, not hype-chasers.

---

### 2. Add External Benchmarks

**Minimum viable evaluation**:
```javascript
// Test on established benchmarks
import { ARCBenchmark } from './benchmarks/arc.js';
import { bAbIBenchmark } from './benchmarks/babi.js';

const arcScore = await ARCBenchmark.run(agent);
const bAbiScore = await bAbIBenchmark.run(agent);

// Compare to baselines
assert(arcScore > randomBaseline);
assert(bAbiScore > retrievalBaseline);
```

**Why**: Internal metrics lie. External benchmarks don't.

---

### 3. Add Embodiment

**Problem**: Disembodied symbol manipulation doesn't produce intelligence.

**Solution**: Connect to environments:
```javascript
// Agent learns from action outcomes
const env = new GridWorld();
const observation = env.reset();
const action = agent.selectAction(observation);
const reward = env.step(action);

// Rule utility based on reward, not derivation success
selfModel.recordRuleUsage(ruleId, reward > 0);
```

**Why**: Grounding through action/outcome cycles is essential for meaningful intelligence.

---

### 4. Add Ablation Studies

**Test what actually matters**:
```javascript
// Does self-modeling help?
const withSelfModel = new CognitiveAgent({ enableSelfModeling: true });
const withoutSelfModel = new CognitiveAgent({ enableSelfModeling: false });

// Compare on same tasks
const score1 = await benchmark(withSelfModel);
const score2 = await benchmark(withoutSelfModel);

// If score1 ≈ score2, self-modeling isn't doing useful work
```

**Why**: You need to know which components actually contribute.

---

### 5. Define Failure Conditions

**When should you abandon this approach?**

```javascript
// Pre-commit to abandonment criteria
const failureConditions = {
    // No improvement after X cycles
    noImprovement: '10000 cycles without utility increase',
    
    // Degradation on external benchmarks
    benchmarkRegression: 'ARC score decreases over time',
    
    // Unstable evolution
    ruleExplosion: 'Rule count exceeds 1000 with declining utility',
    
    // Goal corruption
    goalDrift: 'Core goals modified without explicit permission'
};

// If any condition is met, stop and reassess
```

**Why**: Sunk cost fallacy kills research projects. Pre-commit to cutting losses.

---

## Honest Projections

### Best Case (20% probability)

- System shows measurable improvement on benchmarks over 1000+ cycles
- Self-modeling provides genuine capability (not just metrics)
- Rule evolution discovers useful patterns humans didn't specify
- **Outcome**: Publishable research, useful adaptive reasoning system

### Likely Case (60% probability)

- System shows internal improvement (utility increases)
- External benchmarks show modest or no improvement
- Evolution finds local optima, not general capabilities
- **Outcome**: Interesting research artifact, limited practical use

### Worst Case (20% probability)

- Utility hacking: system optimizes metrics without capability gain
- Rule explosion overwhelms memory
- Evolution degrades performance over time
- **Outcome**: Time wasted, lessons learned about what doesn't work

---

## Recommendations

### Proceed If...

1. You frame this as **research**, not AGI development
2. You add **external benchmarks** for honest evaluation
3. You commit to **abandonment criteria** if it doesn't work
4. You're prepared for **negative results** (still valuable!)
5. You connect to **embodied environments** for grounding

### Don't Proceed If...

1. You believe this will produce AGI in 12 weeks
2. You're not willing to measure against external benchmarks
3. You'll rationalize failure as "need more time"
4. You're not prepared to publish negative results

---

## Revised Value Proposition

**Original claim**: "Pathway to AGI and RSI"

**Honest claim**: "An experimental system for studying self-modifying inference with evolutionary rule optimization. May produce adaptive reasoning capabilities. Will produce data on what doesn't work."

**Actual value**:
1. **Research contribution**: Data on evolutionary rule optimization
2. **Engineering value**: Better understanding of SeNARS/MeTTa integration
3. **Safety value**: Experience with self-modification risks
4. **Negative knowledge**: Learning what doesn't lead to AGI

---

## Conclusion

**Is the plan useful?**

**Yes**, but not for AGI. It's useful for:
- Understanding self-modifying systems
- Learning about evolutionary optimization in cognitive architectures
- Building adaptive reasoning tools
- Generating data about what doesn't work

**Will it produce AGI?**

**Almost certainly not.** The hard problems (grounding, compositionality, sample efficiency, transfer) aren't addressed.

**Should you do it anyway?**

**Yes**, if:
- You value learning over hype
- You'll measure honestly
- You'll share negative results
- You understand this is one step in a long journey

---

*"The value of research isn't in confirming hypotheses—it's in learning what's actually true, even when it's not what you hoped."*
