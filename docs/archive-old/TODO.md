# SeNARS Strategic Roadmap

This plan focuses on the "Essential Triad": **NAL** (Logic), **LLM** (Intuition), and **MeTTa** (Meta-Cognition). It adheres to a philosophy of "Radical Minimalism"—achieving cognitive sophistication through architectural constraint.

---

## Phase 4: Memory Compression (In Progress)
**Objective**: Achieve "infinite" memory within fixed bounds via competitive forgetting and compression.

### 4.1 Dual-Store Architecture
Replace complex memory hierarchies with two distinct structures:
- **Focus (Working Memory)**: A probabilistic priority queue (`TaskBagPremiseSource`) that holds active `Tasks` for immediate processing.
- **Archive (Long-Term Memory)**: A **Merkle DAG** of compressed MeTTa expressions. This allows content-addressable storage where widely-used concepts are stored once and referenced by hash, eliminating redundancy.

### 4.2 Consolidation as Compilation
- **Mechanism**: When Tasks decay from Focus and are moved to the Archive, they are not just stored; they are **compiled**.
- **Transformation**: Convert evidence chains into **MeTTa rewrite rules** (implications).
- **Benefit**: Compresses the *deductive history* into *executable logic*, preserving the semantic outcome without storing the full derivation tree.

### 4.3 Bloom Filter Stamps
- **Problem**: Storing full `Stamp` lineage for cycle detection is O(N) space.
- **Solution**: Implement `BloomFilter` stamps.
- **Trade-off**: Trades perfect circularity detection for **constant O(1) space**. We accept a small false-positive rate (rejecting valid deductions) to guarantee zero false negatives (never accepting circular logic).

---

## Phase 5: Distributed Minimalism (Next)
**Objective**: Scale horizontally without central coordination or consensus algorithms.

### 5.1 Gossip-Based Belief Sharing
- **Protocol**: Agents communicate via **delta-encoded beliefs** (sending only `(Term, Value)` updates that differ from the last sync).
- **Transport**: JSON-over-WebSocket via the MCP `Server.js` or direct P2P streams.
- **Philosophy**: No central "Truth" database. Truth is local and relative to the agent's experience.

### 5.2 Conflict Reconciliation
- **Mechanism**: On receiving a conflicting belief, do NOT block for consensus.
- **Action**: Immediately apply **NAL Revision Rule** locally:
  ```metta
  (Revision (Term F1 C1) (Term F2 C2)) -> (Term NewF NewC)
  ```
- **Result**: Divergent agents naturally converge on shared truths over time as high-confidence evidence propagates through the network.

---

## Capability Gaps: The Missing Pieces

### Temporal Reasoning (NAL-7)
**Objective**: Move beyond current stubs to simple but powerful temporal logic.
- **Primitives**: Implement `Seq` (Sequence), `Per` (Persistence), and `Cau` (Causation) as first-class MeTTa atoms in `nal.metta`.
- **Inference Rules**: Implement `Induction` over time:
  ```
  (Seq A B) + (Seq A B) -> (Cau A B)
  ```
- **Goal**: Enable the system to learn causal models of its environment (e.g., "If I run `npm test`, then `Task X` succeeds").

### LLM Truth Calibration
**Objective**: Replace heuristic "magic numbers" with statistically grounded confidence.
- **LMStats**: Connect `LMStats.js` to `Truth.js`.
- **Mapping**: Map token log-probabilities (uncertainty) and model reputation (reliability) to NAL `Confidence`.
  - High LogProb from GPT-4 -> High Confidence.
  - Low LogProb from Local LLM -> Low Confidence.
- **Input Rules**: Update `LMNarseseTranslationRule` to apply this mapping dynamically.

---

## Ambitious Long-Term Goals

### Reinforcement Learning (RLFP)
**Objective**: Evolve from passive data collection to active **Policy Optimization**.
- **Trajectory Learning**: Upgrade `RLFPLearner.js` to train a lightweight policy model on `rlfp_training_data.jsonl`.
- **Action Selection**: Use the policy to predict the best **Reasoning Strategy** (e.g., "Use Prolog Strategy" vs "Use LLM Analogy") for a given Task type, minimizing compute while maximizing confidence.

### Metacognitive Feedback Loop
**Objective**: Enable real-time self-tuning of the architecture.
- **Rule Representation**: Ensure all NAL rules are represented as **MeTTa atoms** (data) so the system can inspect them.
- **Parameter Tuning**: Extend `MetacognitionRules.js` to observe system pressure (Queue length, Forget rate) and dynamically adjust:
  - `Attention Allocation` thresholds.
  - `Budget` decay rates.
  - `CircuitBreaker` sensitivity.
- **Self-Modification**: The system should be able to "think" about its own thinking and optimize its configuration without restart.

---

## Success Metrics
- **Epistemic Transparency**: Every conclusion has a traceable derivation path viewable as a MeTTa reduction trace.
- **Graceful Degradation**: System functions effectively (at lower capability) with LLM layer completely disabled.
- **Memory Constancy**: Memory usage plateaus under load; the system forgets low-value knowledge rather than crashing.

----

 Here is the **revised strategic development plan**, stripped of Tensor Logic complexity and focused on the essential triad: **NAL** (rigorous logic), **LLM** (intuitive subconscious), and **MeTTa** (meta-cognitive reflection). This architecture achieves greater cognitive depth through architectural restraint—leveraging each layer's native strengths without duplicating functionality.

---

## Phase 1: The Immutable Core (Weeks 1-6)
**Objective**: Establish a hardened, resource-aware symbolic kernel that cannot fail, even under extreme AIKR constraints.

### 1.1 Canonical Foundation (`core/src/term/`, `core/src/Truth.js`)
- **Term Immutable Canonicalization**: Finalize `TermFactory.js` and `TermCache.js` to ensure O(1) structural equality. All terms must be interned; identity is memory address.
- **Truth-Value Semantics**: Harden the `(frequency, confidence)` pair calculus. Implement revision, choice, and expectation functions exactly as defined in NAL spec.
- **Stamp Lineage**: Complete `Stamp.js` to prevent circular reasoning in derivation chains. Implement strict vector-clock semantics for evidence tracking.

### 1.2 Stream Reasoning Pipeline (`core/src/reason/`)
- **EventBus Hardening**: Finalize `core/src/util/EventBus.js` with backpressure handling. If the pipeline exceeds cycle time limits, apply CPU throttling and priority decay.
- **Rule Engine Core**: Complete `RuleProcessor.js` for synchronous NAL rules (deduction, induction, abduction, revision). Target: 100K derivations/second single-threaded.
- **Derivation Limits**: Enforce derivation depth caps and complexity penalties in `BudgetManager.js` to prevent combinatorial explosion.

### 1.3 Competitive Memory (`core/src/memory/`)
- **Dual-Layer Architecture**: Harden `Focus.js` (working memory) and `Bag.js` (long-term) with the consolidation pipeline.
- **Dynamic Sampling**: Implement Priority/Recency/Novelty sampling objectives in `FocusSetSelector.js`. 
- **AIKR Compliance**: Ensure `MemoryResourceManager.js` enforces strict memory caps with intelligent forgetting (forgetting strategies in `core/src/memory/forgetting/`).

**Deliverable**: A pure-NAL reasoner that runs indefinitely without memory leaks, capable of real-time operation on resource-constrained devices.

---

## Phase 2: The Subconscious Integration (Weeks 7-12)
**Objective**: Integrate LLMs as an asynchronous, fallible intuition layer—the "Dreamer" to NAL's "Calculator"—without compromising real-time constraints.

### 2.1 Async Neural-Symbolic Bridge (`core/src/reason/rules/lm/`, `core/src/lm/`)
- **Non-Blocking Architecture**: LLM calls must never block the NAL cycle. Use `TaskBagPremiseSource.js` to defer LLM results as new tasks injected into the Stream Pipeline.
- **LMRule Framework**: Generalize `LMRule.js` base class. All LLM interactions are rules, not function calls. Examples:
  - `LMNarseseTranslationRule.js`: NL ↔ Narsese bidirectional translation
  - `LMAnalogicalReasoningRule.js`: LLM suggests similarities for NAL to validate
  - `LMHypothesisGenerationRule.js`: LLM proposes hypotheses; NAL tests via deduction
- **Circuit Breaker Protection**: Harden `core/src/util/CircuitBreaker.js`. If LLM latency exceeds threshold or API fails, seamless fallback to pure NAL mode.

### 2.2 Epistemic Calibration (`core/src/lm/LMStats.js`, `core/src/Truth.js`)
- **Truth Calibration**: Map LLM log-probabilities/confidence scores to NAL `(f, c)` pairs. A high-temperature LLM output receives low confidence; high-agreement outputs receive high confidence.
- **Hallucination Bounding**: When LLM generates conclusion `X`, NAL checks against existing beliefs. If `X` contradicts high-confidence beliefs, apply revision to downgrade `X`'s confidence or reject it.
- **Provider Abstraction**: Finalize `BaseProvider.js`, `HuggingFaceProvider.js`, and `WebLLMProvider.js` with unified `LMStats.js` tracking for per-model reliability metrics.

### 2.3 Semantic Layer (`core/src/lm/EmbeddingLayer.js` [if exists] or semantic similarity via LLM)
- **Lazy Semantic Evaluation**: Instead of maintaining embedding vectors (expensive), use LLM for on-demand similarity judgments: "Is concept A similar to concept B?" → NAL creates `Similarity(A, B)` with calibrated truth-value.
- **Predicate Invention**: Use `LMConceptElaborationRule.js` to suggest new relational terms, which NAL then integrates into the ontology via `TermFactory.js`.

**Deliverable**: Hybrid system where LLM provides "soft" suggestions and NAL provides "hard" verification, operating in real-time with graceful degradation when LLM is unavailable.

---

## Phase 3: The Meta-Cognitive Layer (Weeks 13-18)
**Objective**: Achieve self-modification and cross-system interoperability via MeTTa, using it as the universal metalanguage rather than building custom meta-facilities.

### 3.1 MeTTa Bridge (`metta/src/SeNARSBridge.js`)
- **Universal Translator**: Implement bidirectional translation between Narsese and MeTTa atoms. MeTTa serves as the "lingua franca" between SeNARS and other AI systems (OpenCog, etc.).
- **Pattern Matching Delegation**: Delegate complex unification and pattern matching to MeTTa's `kernel/Unify.js` rather than reimplementing in JavaScript. Use `MeTTaStrategy.js` as a reasoning strategy within the Stream Pipeline.

### 3.2 Self-Modifying Reasoning (`metta/src/nal/stdlib/`, `agent/src/`)
- **Rule Representation as Data**: Represent NAL inference rules as MeTTa atoms (in `metta/src/nal/stdlib/nal.metta`), allowing the system to inspect and modify its own logic.
- **Dynamic Strategy Selection**: Use MeTTa to script high-level control strategies. Instead of hardcoding when to use Bag vs. Prolog strategy, express this as MeTTa rules that the system can learn and modify.
- **Metacognition**: Implement `core/src/self/Metacognition.js` using MeTTa to monitor the reasoner's own performance and adjust parameters (budget decay rates, sampling objectives).

### 3.3 Tool Integration & RL (`agent/src/mcp/`, `agent/src/rlfp/`)
- **MCP Ecosystem**: Complete `agent/src/mcp/Server.js` to expose SeNARS as a Model Context Protocol server, enabling tool use and multi-agent collaboration.
- **RLFP (Reinforcement Learning from Preferences)**: Implement `PreferenceCollector.js` and `RLFPLearner.js` to learn which reasoning strategies (NAL vs. LLM vs. MeTTa) work best for specific problem types, optimizing the hybrid cognitive architecture.

**Deliverable**: A self-aware system capable of rewriting its own reasoning strategies, interoperating with external tools via MCP, and learning to optimize its cognitive resource allocation.

---

## Architectural Principles: Achieving More with Less

### 1. **MeTTa as the Meta-Layer** (Avoid Custom Infrastructure)
- **Don't build**: Custom tensor operations, complex metaprogramming frameworks, or distributed consensus algorithms.
- **Do use**: MeTTa's existing `Space.js`, `Unify.js`, and `Reducer.js` for all meta-cognitive operations. MeTTa handles self-modification; NAL handles truth; LLM handles intuition.

### 2. **LLM as Semantic Layer** (Avoid Embedding Databases)
- **Don't build**: Vector databases, custom embedding training, or similarity indexes.
- **Do use**: LLM for on-demand semantic queries. Cache results as NAL `Similarity` statements with confidence decay. This is "lazy semantics"—computed only when needed, stored with provenance.

### 3. **NAL as the Single Source of Truth** (Avoid Probabilistic Graphs)
- **Don't build**: Parallel probabilistic reasoning systems or Bayesian networks.
- **Do use**: NAL's `(frequency, confidence)` calculus as the *only* truth representation. LLM outputs are converted to this format immediately upon ingestion. All reasoning reduces to NAL inference rules.

### 4. **EventBus as the Nervous System** (Avoid Hard Coupling)
- **Don't build**: Direct function calls between subsystems or complex dependency injection.
- **Do use**: The existing `EventBus.js` for all communication. Components (NAL, LLM, MeTTa) are loosely coupled via events, enabling hot-swapping and fault isolation.

---

## Critical Path & Risk Mitigation

### Immediate Actions (Week 1-2)
1. **Seal the Immutable Core**: Ensure `Term.js`, `Truth.js`, and `Task.js` are strictly immutable and serializable. Any mutability here corrupts the entire pipeline.
2. **Circuit Breaker First**: Before adding any LLM calls, implement the circuit breaker pattern. The system must survive LLM API failures, timeouts, and hallucinations.

### Quality Gates
- **AIKR Stress Test**: Use `core/src/testing/CycleLimitedTest.js` to verify the system operates correctly under severe memory constraints (e.g., 1000 item limit).
- **Epistemic Consistency**: Verify that LLM hallucinations are caught by NAL's belief revision. Test: Inject falsehoods via LLM; ensure NAL confidence in falsehood decays to zero.

### Excluded (Intentionally)
- **Tensor Logic**: Deferred indefinitely. NAL's symbolic rules + LLM intuition + MeTTa meta-control provide sufficient expressiveness without the complexity of differentiable logic.
- **Custom GPU Kernels**: Unnecessary for symbolic NAL. Standard JS/WebAssembly is sufficient; focus budget on algorithmic efficiency, not hardware acceleration.
- **Distributed Belief Revision**: Single-node focus until Phase 3 MCP integration demands otherwise.

---

## Summary

This plan delivers a **cognitive architecture** that is:
- **Minimal**: Three layers (NAL for logic, LLM for intuition, MeTTa for reflection) with no redundant tensor infrastructure.
- **Robust**: AIKR-compliant at every level, with circuit breakers ensuring graceful degradation.
- **Extensible**: MeTTa provides self-modification; MCP provides ecosystem integration.

The system thinks in **NAL**, dreams in **LLM**, and reflects on its thinking in **MeTTa**—achieving hybrid intelligence through architectural clarity rather than computational brute force.

----

 Here is a strategic development plan for SeNARS that embraces **radical minimalism**—achieving cognitive sophistication through architectural constraint rather than computational proliferation. By excluding Tensor Logic, we force the system to rely on the elegant interplay of three lightweight, complementary substrates.

---

## **Strategic Philosophy: The Subtractive Advantage**

The exclusion of Tensor Logic is not a loss but a **strategic filter**. It prevents the architecture from collapsing into opaque numerical optimization, forcing us to maintain crisp symbolic boundaries where:
- **NAL** provides epistemic rigor and resource-aware truth maintenance
- **LLMs** provide generative intuition and semantic fluidity  
- **MeTTa** provides the metacognitive glue and self-modifying infrastructure

This triad achieves "more with less" by ensuring no capability is implemented twice. NAL handles uncertainty; LLMs handle ambiguity; MeTTa handles reflection.

---

## **Phase 1: The Minimal Viable Kernel (MVK)**

**Objective:** Establish the irreducible core—Stream Reasoning + Immutable Data + Circuit Breakers.

### **Core Architecture (Single Thread)**
1. **Immutable Term Space**: Canonicalize all terms via hash-consing (TermCache.js). This eliminates duplication and enables O(1) equality checks without tensor embeddings.
2. **EventBus as Nervous System**: Loose coupling via events (not function calls) allows components to fail independently—critical for LLM integration.
3. **Stamp-Based Lineage**: Implement evidence tracking (Stamp.js) as a Merkle-like structure. This is your "anti-hallucination" mechanism without requiring vector similarity search.

**Resource Constraint:** The MVK must run on a single CPU core with <512MB RAM. If it doesn't fit, it's not AIKR-compliant.

### **NAL Simplification**
- Implement only **NAL-1 through NAL-3** (inheritance, similarity, compound terms) in the kernel.
- Defer higher-order logic (NAL-5+) to MeTTa metaprogramming.
- **Truth values** remain simple `(frequency, confidence)` pairs—no need for tensor contractions when probabilistic logic suffices.

---

## **Phase 2: Asymmetric LLM Integration (The "Dreamer" Boundary)**

**Objective:** Treat LLMs as **unreliable oracles**, not reasoning engines. Maximize value per token.

### **The Circuit Breaker Pattern (Critical)**
Implement three-state circuit breakers for all LLM calls:
- **Closed**: Normal operation
- **Open**: LLM fails/hallucinates; system falls back to pure NAL symbolic reasoning
- **Half-Open**: Test recovery with small queries

This achieves "more reliability with less compute" by ensuring the system never stalls waiting for API timeouts.

### **Translation, Not Integration**
Instead of embedding LLM vectors into NAL:
1. **Narsese Translation Layer**: Use LLMs solely to convert natural language → Narsese (the formal language), then disconnect.
2. **Hypothesis Generation Only**: LLMs propose `(Term, Truth)` pairs; NAL validates them via existing beliefs.
3. **Budget-Aware Prompting**: Tie LLM API calls to the **Budget** system. High-priority tasks get rich prompts; low-priority tasks get cached or symbolic approximations.

**Anti-Pattern to Avoid:** Do not allow LLMs to directly modify memory structures. All LLM outputs must pass through NAL's revision rules.

---

## **Phase 3: MeTTa as Meta-Controller**

**Objective:** Avoid building new infrastructure for reflection and distributed reasoning. Use MeTTa's self-modifying capabilities.

### **MeTTa-NAL Bridge (The "Space" Unification)**
Treat SeNARS memory as a **MeTTa Space**:
- **Terms** = MeTTa Atoms
- **Rules** = MeTTa subgraphs that rewrite themselves
- **Strategies** = MeTTa higher-order functions

This collapses two layers (NAL engine + meta-interpreter) into one. NAL rules become executable MeTTa code:

```metta
;; NAL Induction encoded as MeTTa reduction
(-> ( premise $A (inheritance $B $C) ($f1 $c1) )
    ( premise $A (inheritance $A $B) ($f2 $c2) )
    ( conclusion (inheritance $A $C) (induction-truth $f1 $c1 $f2 $c2) ) )
```

### **Dynamic Strategy Loading**
Instead of hardcoding reasoning strategies (Bag, Prolog, Analogical), implement them as **MeTTa modules** loaded on demand:
- **Less code**: No strategy factory patterns or class hierarchies
- **More flexibility**: Strategies self-optimize by rewriting their own selection heuristics based on success metrics

---

## **Phase 4: Memory Compression via Competitive Forgetting**

**Objective:** Achieve "infinite" memory within fixed bounds.

### **The Dual-Bag Simplification**
Replace complex memory hierarchies with two structures:
1. **Focus**: A probabilistic bag (priority queue) of active Tasks
2. **Archive**: Compressed MeTTa expressions stored via content-addressable hashing (Merkle DAG)

**Consolidation as Compilation**: When Tasks move from Focus → Archive, compile them into **MeTTa rewrite rules** that capture their inferential consequences. This compresses evidence chains into executable transformations, preserving semantic content without storing every derivation.

### **Stamp Pruning**
Instead of keeping full derivation trees, use **Bloom filters** for Stamp overlap detection. This trades perfect circularity detection for massive memory savings (constant space vs. linear).

---

## **Phase 5: Distributed Minimalism (Multi-Agent)**

**Objective:** Scale horizontally without central coordination.

### **Gossip-Based Belief Sharing**
Agents communicate via **delta-encoded beliefs** (only changes, not full state). Use MeTTa's pattern matching to reconcile conflicting truths:
- No consensus algorithm (too heavy)
- Instead, **truth-value revision** on receipt: merge incoming beliefs using NAL rules locally

### **SeNARS-as-MCP-Server**
Expose the kernel via Model Context Protocol (MCP) rather than custom APIs:
- **Less boilerplate**: Leverage existing MCP clients
- **More ecosystem**: Immediate integration with Claude, Cursor, etc.
- The system appears as a "reasoning tool" that external agents invoke, maintaining AIKR by externalizing resource management to the client

---

## **Implementation Roadmap: The "Less" Checklist**

| Quarter | Deliverable | "Less" Principle |
|---------|-------------|------------------|
| **Q1** | Immutable MVK + NAL-1/2 | Zero mutable state in core |
| **Q2** | LLM Circuit Breaker + Narsese Translator | No LLM reasoning chains; single-shot translation only |
| **Q3** | MeTTa Bridge + Dynamic Strategies | No hardcoded rule engines |
| **Q4** | MCP Server + Distributed Gossip | No custom networking layer; no central coordinator |

---

## **Success Metrics: The "More" Verification**

- **Epistemic Transparency**: Every conclusion must have a derivation path viewable as a MeTTa reduction trace (no black boxes)
- **Graceful Degradation**: System must function (in reduced capacity) with LLM layer completely disabled
- **Memory Constancy**: Memory usage must plateau under load (AIKR compliance), not grow linearly with input
- **Code Volume**: Total codebase <50k lines by leveraging MeTTa metaprogramming instead of boilerplate

This architecture achieves artificial general intelligence not by adding layers of mathematical complexity, but by **orchestrating three minimal, well-understood systems** (NAL, LLM, MeTTa) through the disciplined application of immutable data, asynchronous streams, and self-modifying code.
