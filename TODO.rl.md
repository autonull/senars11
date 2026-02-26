# Neuro-Symbolic RL Framework Development Plan

## Vision

A general-purpose neuro-symbolic RL agent framework that leverages **SeNARS**, **MeTTa**, and **Tensor Logic** to transcend conventional ML RL capabilities through:

- **Compositional Generalization** - Systematic generalization to unseen state/action compositions
- **Symbolic Abstraction** - Lift neural perceptions to symbolic representations for reasoning
- **Program Induction** - Discover interpretable symbolic policies from neural executions
- **Causal Understanding** - Learn causal models enabling counterfactual reasoning and interventions
- **Hierarchical Skills** - Composable skill libraries with symbolic termination conditions

---

## Target Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                     NeuroSymbolicRLAgent                            │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐   │
│  │  Perception  │────▶│  Abstraction │────▶│  Symbolic Memory │   │
│  │   Encoder    │     │   (Lifting)  │     │   (SeNARS/MeTTa) │   │
│  │              │     │  obs→symbols │     │  - Entities      │   │
│  │  • MLP       │     │  - Objects   │     │  - Relations     │   │
│  │  • CNN       │     │  - Relations │     │  - Rules         │   │
│  │  • Transformer│    │  - Attributes│     │  - Beliefs       │   │
│  └──────────────┘     └──────────────┘     └──────────────────┘   │
│         ▲                                         │                │
│         │                                         ▼                │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐   │
│  │   Action     │◀────│  Grounding   │◀────│    Reasoning     │   │
│  │   Decoder    │     │   Layer      │     │    Engine        │   │
│  │              │     │  symbols→    │     │  - Planning      │   │
│  │  • Policy    │     │  vectors     │     │  - Inference     │   │
│  │  • Value     │     │  - Bindings  │     │  - Search        │   │
│  │  • Options   │     │  - Constraints│    │  - Analogy       │   │
│  └──────────────┘     └──────────────┘     └──────────────────┘   │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### Core Design Principles

1. **Single Responsibility** - Each module has one clear purpose
2. **Compositional** - Components combine flexibly without tight coupling
3. **Extensible** - New strategies plug in without modifying core
4. **Bidirectional** - Symbols ↔ Vectors conversion is lossless where possible
5. **Incremental** - Symbolic knowledge grows from experience

---

## Phase 1: Core Foundation

### 1.1 Module Structure

```
rl/
├── src/
│   ├── core/
│   │   ├── RLAgent.js              # Abstract base (unchanged)
│   │   ├── RLEnvironment.js        # Abstract base (unchanged)
│   │   ├── SymbolGrounding.js      # NEW: obs↔symbol bidirectional
│   │   ├── WorkingMemory.js        # NEW: episodic buffer with symbolic annotations
│   │   └── SkillLibrary.js         # NEW: composable skill repository
│   │
│   ├── agents/
│   │   ├── RandomAgent.js          # Baseline (unchanged)
│   │   ├── TabularAgent.js         # RENAME: q-learning, tabular methods
│   │   ├── PolicyGradientAgent.js  # Neural policy (REINFORCE, Actor-Critic)
│   │   ├── NeuroSymbolicAgent.js   # REDESIGN: unified architecture
│   │   └── ProgrammaticAgent.js    # NEW: MeTTa program as policy
│   │
│   ├── environments/
│   │   ├── GridWorld.js            # (unchanged)
│   │   ├── Continuous1D.js         # (unchanged)
│   │   └── CompositionalWorld.js   # NEW: test compositional generalization
│   │
│   ├── reasoning/
│   │   ├── SymbolicPlanner.js      # NEW: MCTS over symbolic states
│   │   ├── RuleInducer.js          # NEW: learn rules from trajectories
│   │   └── CausalLearner.js        # NEW: discover causal structure
│   │
│   └── strategies/
│       ├── q-learning.js           # MOVE: from .metta to .js
│       ├── model-based.js          # NEW: learned world model + planning
│       └── hierarchical.js         # NEW: options framework
│
├── strategies/                     # DEPRECATED: move to src/strategies/
├── examples/
└── tests/
```

### 1.2 Key Implementations

#### SymbolGrounding.js
```javascript
// Bidirectional mapping between neural and symbolic representations
export class SymbolGrounding {
  // Perception → Symbols
  lift(observation)      // obs → {entities, relations, attributes}
  
  // Symbols → Action
  ground(symbols)        // symbolic decision → action vector/tensor
  
  // Learn grounding from data
  updateGrounding(obs, symbols)
}
```

#### WorkingMemory.js
```javascript
// Episodic buffer enriched with symbolic annotations
export class WorkingMemory {
  store(trajectory)              // {(s,a,r,s')} with symbolic labels
  query(pattern)                 // symbolic pattern matching
  retrieveSimilar(current)       // analogical retrieval
  consolidate()                  // extract rules/skills from episodes
}
```

#### NeuroSymbolicAgent.js (Unified)
```javascript
export class NeuroSymbolicAgent extends RLAgent {
  constructor(env, config = {
    encoder: 'mlp',           // perception encoder
    reasoning: 'metta',       // 'metta' | 'senars' | 'none'
    grounding: 'learned',     // 'learned' | 'handcoded'
    planning: true,           // enable symbolic planning
    skillDiscovery: false     // enable hierarchical skill learning
  })
  
  // Core interface
  async act(observation)
  async learn(transition)
  
  // Neuro-symbolic specific
  async plan(goal)            // symbolic planning
  async explain(decision)     // generate symbolic explanation
  transferTo(newEnv)          // compositional transfer
}
```

### 1.3 Deliverables

- [ ] `src/core/SymbolGrounding.js` - Bidirectional grounding
- [ ] `src/core/WorkingMemory.js` - Annotated episodic memory
- [ ] `src/core/SkillLibrary.js` - Composable skill repository
- [ ] `src/agents/NeuroSymbolicAgent.js` - Unified architecture
- [ ] `src/agents/ProgrammaticAgent.js` - Program synthesis agent
- [ ] `src/reasoning/SymbolicPlanner.js` - MCTS over symbols
- [ ] `src/reasoning/RuleInducer.js` - Rule learning from trajectories
- [ ] `src/environments/CompositionalWorld.js` - Generalization testbed
- [ ] `src/index.js` - Clean public API exports
- [ ] Move `strategies/*.metta` → `src/strategies/*.js` (or keep as `.metta` with loader)

---

## Phase 2: Reasoning & Learning

### 2.1 Symbolic Reasoning Integration

| Component | Purpose | Implementation |
|-----------|---------|----------------|
| **SeNARS Bridge** | Uncertain reasoning, belief revision | Integrate `@senars/core` NAL inference |
| **MeTTa Interpreter** | Symbolic execution, program synthesis | Use `@senars/metta` with extended primitives |
| **Hybrid Search** | Neural-guided symbolic planning | MCTS with neural policy priors |

### 2.2 Rule Induction Pipeline

```
Trajectories → Pattern Mining → Candidate Rules → Validation → Rule Library
     │              │                │              │
  (Working      (frequent         (simulate       (test on
   Memory)       substructures)     in MeTTa)       held-out)
```

### 2.3 Deliverables

- [ ] `src/reasoning/SeNARSBridge.js` - NAL inference integration
- [ ] `src/reasoning/RuleInducer.js` - Automatic rule discovery
- [ ] `src/strategies/model-based.js` - Learned symbolic world model
- [ ] `src/strategies/hierarchical.js` - Options with symbolic termination
- [ ] Skill discovery from policy execution traces
- [ ] Counterfactual query interface: `whatIf(action, context)`

---

## Phase 3: Advanced Capabilities

### 3.1 Beyond Conventional RL

| Capability | Conventional RL | Neuro-Symbolic Approach |
|------------|-----------------|------------------------|
| **Generalization** | IID test distributions | Systematic composition of known elements |
| **Sample Efficiency** | 10⁶-10⁹ samples | 10²-10⁴ via symbolic abstraction |
| **Interpretability** | Black box | Symbolic policy explanations |
| **Transfer** | Fine-tuning required | Zero-shot via analogy |
| **Causal Reasoning** | Correlational | Structural causal models |
| **Compositionality** | Limited | Productive recombination |

### 3.2 Deliverables

- [ ] `src/reasoning/CausalLearner.js` - Causal graph discovery
- [ ] Analogical transfer: solve new tasks via structural mapping
- [ ] Program synthesis: generate MeTTa policies from demonstrations
- [ ] Interactive teaching: accept symbolic hints/constraints
- [ ] Verification: prove properties of symbolic policies

---

## Phase 4: Ecosystem & Validation

### 4.1 Benchmark Suite

| Environment | Tests |
|-------------|-------|
| **GridWorld** | Basic navigation, obstacles |
| **CompositionalWorld** | Unseen entity/rerelation combinations |
| **Multi-Room** | Hierarchical planning, subgoals |
| **CausalWorld** | Interventions, counterfactuals |
| **ProgrammaticTasks** | Rule induction, program synthesis |

### 4.2 Deliverables

- [ ] Comprehensive test suite (unit + integration)
- [ ] Benchmark comparisons vs. conventional RL baselines
- [ ] Documentation: API reference, tutorials, examples
- [ ] Example notebooks demonstrating key capabilities

---

## Implementation Timeline

| Phase | Duration | Milestone |
|-------|----------|-----------|
| **Phase 1** | Weeks 1-2 | Core architecture, grounding, unified agent |
| **Phase 2** | Weeks 3-4 | Reasoning integration, rule induction |
| **Phase 3** | Weeks 5-6 | Advanced capabilities, causal reasoning |
| **Phase 4** | Weeks 7-8 | Validation, documentation, release |

---

## Design Decisions

### What We're NOT Building

- ❌ **Separate neural and symbolic agents** - True integration, not parallel tracks
- ❌ **Fixed architecture** - Modular design allows component swapping
- ❌ **Domain-specific solution** - General-purpose framework
- ❌ **Purely symbolic or purely neural** - Synergistic combination

### What We ARE Building

- ✅ **Unified architecture** - Neural and symbolic components interoperate seamlessly
- ✅ **Extensible platform** - New reasoning engines, encoders, strategies plug in easily
- ✅ **Research vehicle** - Test hypotheses about neuro-symbolic RL
- ✅ **Production-ready** - Clean APIs, documentation, testing

---

## Open Questions

1. **Grounding representation** - Should symbols be MeTTa atoms, SeNARS terms, or a unified format?
2. **Learning vs. reasoning balance** - When to use gradient descent vs. symbolic inference?
3. **Skill representation** - Options as MeTTa programs, neural policies, or both?
4. **Memory bounds** - How to manage working memory size while retaining useful episodes?

---

## References

- Lake & Baroni (2018) - Generalization without systematic induction
- Garnelo & Shanahan (2019) - Reconciling deep learning and symbolic AI
- Weiss et al. (2021) - Thinking Fast and Slow with Deep Learning and Systematic Reasoning
- Bengio et al. (2021) - A Consciousness-Inspired Planning Agent
