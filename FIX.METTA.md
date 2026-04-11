# PeTTa MeTTa Implementation — Debug Log & Gap Analysis

## Overview

The MeTTa implementation in this repo (`metta/src/`) is evaluated against the
**PeTTa dialect** by running 100 example files from the
[PeTTa repository](https://github.com/trueagi-io/PeTTa/tree/main/examples).

Each example runs as an isolated child process with a 1-second timeout.
Passing requires: (a) completes within timeout, AND (b) all `!(test ...)` assertions match.

### How to run tests

```bash
cd /home/me/senars10
NODE_NO_WARNINGS=1 NODE_OPTIONS=--experimental-vm-modules node scripts/run-petta-examples.js
```

### Current status

| Status | Count | Details |
|--------|-------|---------|
| ✓ Pass | **19** | and_or, chain, collapse, comments, constanthead, curry, empty, greedy_chess, identity, if, if2, if3, if4, ifsimple, letstar, matchtypes, multicall, myinterpreter, once |
| ⏱ Timeout | 9 | booleansolver, eval, factorial, fib, fibsmart, holbenchmark, iter, peano, peanofast |
| ✗ Fail | 62 | See "Remaining work" below |
| ⊘ Skip | 10 | External deps: git_import, git_import2, fibsmartimport, library, nars_direct, nars_tuffy, llm_cities, metta4_streams, mutex_and_transaction, he_atomspace |

**Pass rate: 21%** (19/90 testable). Baseline was 12% (12/90).

---

## Changes Applied

### 1. `&is-var` — Fixed variable detection (`AdvancedOps.js`)
**Bug**: Used `a._typeTag === 3` (Nar reasoner type constant) but VariableAtom in this codebase uses `.type === 'variable'`, not `._typeTag`.
**Fix**: `a.type === 'variable' || a.name?.startsWith('$')` — covers both standard VariableAtom instances and PeTTa-style `$var` symbols.
**Impact**: `if3.metta` now passes (was failing because `(is-var $A)` returned False).

### 2. Lambda: `&subst` → `&let` (`core.metta`)
**Bug**: Lambda rules used `(^ &subst $param $val $body)` which performs bare textual substitution without running the body through the reduction pipeline. Expressions like `(+ $x $y)` with substituted values were never reduced to `9`.
**Fix**: Changed `(^ &subst $p $v $b)` to `(^ &let $p $v $b)`. The `&let` grounded op reduces the value first, substitutes, then the pipeline reduces the resulting body expression.
**Impact**: `applyL1` in `lambda.metta` now returns `3` (was returning unevaluated `(+ 2 1)`).

### 3. `&let` — Enhanced binding resolution (`AdvancedOps.js`)
**Bug**: Only checked `vari?.name`, missing PeTTa variable forms like expression-wrapped variables `($x)`.
**Fix**: Multi-path binding detection:
- `vari.type === 'variable'` — standard VariableAtom
- `vari.name?.startsWith('$')` — PeTTa-style `$var`
- `vari.components?.length === 0` with variable operator — expression-form `($x)`
- `vari.components?.length === 1` with variable component
- Falls back to `Unify.unify(vari, resolved)` for expression patterns

### 4. `&subst` — 3-arg form fallback (`AdvancedOps.js`)
**Bug**: `(&subst a b c)` with 3 args only checked `a.name`, failing when `a` is an expression-form variable.
**Fix**: Added `Unify.unify(a, b)` fallback and component-level binding detection.

### 5. `ClosureStage` — Multi-level rule lookup (`ClosureStage.js`)
**Bug**: Only looked up rules for `funcAtom.name` directly. Nested partial applications like `(((f 1) 2) 3)` have the function atom several levels deep.
**Fix**: Walk up the operator chain:
- `atom.operator.operator.operator` for 3-deep nesting
- `atom.operator.operator.operator.operator` for 4-deep
- `funcAtom.operator` when funcAtom is an expression
- `context.space?.all()` when funcAtom is a variable

### 6. `_matchClosure` — Dynamic rule fallback (`ReductionPipeline.js`)
**Bug**: When `ClosureStage` passed an empty `rules` array, `_matchClosure` had no way to find rules.
**Fix**: Added dynamic rule lookup inside `_matchClosure` that walks the operator chain when `rules.length === 0`.

### 7. PeTTa `|->` lambda syntax (`core.metta`)
**Added**:
```
(= ((|-> $param $body) $val) (^ &let $param $val $body))
(= (((|-> $param $body) $val1) $val2) ((|-> $param $body) ($val1 $val2)))
```

### 8. All grounded ops → `lazy: true` (`AdvancedOps.js`)
**Bug**: Many ops had `opts: {}` (empty), causing the reduction pipeline to pre-reduce arguments before calling the op. For control-flow ops like `&if`, `&let`, this causes premature evaluation of unevaluated branches.
**Fix**: All ops in AdvancedOps.js now have `opts: {lazy: true}`.

---

## Architecture Reference

### File structure
```
metta/src/
  MeTTaInterpreter.js    # Main interpreter (run, runAsync, evaluate, evaluateAsync)
  Parser.js              # MeTTa parser
  MeTTa.js               # Builder API (createMeTTa, evaluate, MeTTaBuilder)
  kernel/
    Reduce.js            # Core reduction: reduceND, reduceNDAsync, reduceAsync, step, match
    Term.js              # Term factory: sym, exp, grounded, variable, isExpression, isList, equals
    Unify.js             # Pattern matching/unification (safeSubstitute, unifiedUnify)
    Space.js             # Atom space (facts + rules)
    Ground.js            # Grounded operations registry (CoreRegistry subclass)
    Zipper.js            # Deep expression traversal
    reduction/
      ReductionPipeline.js  # Multi-stage reduction engine
      stages/
        ClosureStage.js     # Detects ((f 1) 2) partial applications
        GroundedOpStage.js  # Grounded op invocation
        RuleMatchStage.js   # Rule matching
        SuperposeStage.js   # Non-deterministic alternatives
        ...
    ops/
      CoreRegistry.js       # Base operation registry
      SpaceOps.js           # &add-atom, &rm-atom, &get-atoms
      ArithmeticOps.js      # &+, &*, &-, &/
      ComparisonOps.js      # &==, &>, &<
      LogicalOps.js         # &and, &or, &not
  interp/
    AdvancedOps.js       # &if, &when, &let, &let*, &map-fast, &add-atom, alphaEquiv
    MinimalOps.js        # eval, chain, unify, collapse, superpose, test, createTestOp
  stdlib/
    core.metta           # if, let, let*, lambda, logic, arithmetic, cut, once, case, ...
    list.metta           # append, take, drop, nth, reverse, zip, ...
    hof.metta            # map-atom, filter-atom, foldl-atom
```

### Key patterns

**Grounded ops**: Registered via `ground.register('&name', fn, opts)`.
- `lazy: true` — args are not pre-reduced (op gets raw atoms). Critical for control-flow.
- `async: true` — op is async, reduction pipeline uses async path.

**Reduction pipeline stages** (order):
1. CacheStage → 2. JITStage → 3. SuperposeStage → 4. ClosureStage → 5. RuleMatchStage → 6. OperatorReduceStage → 7. ZipperStage → 8. GroundedOpStage → 9. ExplicitCallStage

**Expression representation**:
- PeTTa uses `(: head tail)` cons-cells: `(: 1 (: 2 (: 3 ())))`
- Shorthand: `(1 2 3)` parsed as `exp(sym('1'), [sym('2'), sym('3')])`
- The test op normalizes both forms to cons-lists for comparison

---

## Remaining Work (62 failures)

### Priority 1: Case, cut, lambda multi-arg

#### 1.1 `case` family (5 files: case, case2, caseconstrain, caseempty, casenew)
**Root cause**: `&case` walks cons-list structure (`operator === ':'`) but branches may be expression-form `(pat result)` not cons-cells.
**Fix**: Make `&case` handle both cons-list and expression-form branch lists.

#### 1.2 `cut.metta` (1 file)
**Root cause**: `cut` returns `()` which gets added to match results. In PeTTa, `cut` prunes remaining non-deterministic alternatives.
**Fix**: Implement cut flag in reduction context, or make `match` produce `superpose` alternatives.

#### 1.3 `lambda.metta` multi-arg (partial: applyL1 passes, applyL2 fails)
**Root cause**: `(lambda ($x $y) body)` has list-style parameters. `&let` needs to decompose `($x $y)` into nested single-variable lets.
**Also**: `|->` curried application tests fail — the `(((|-> $x $y) $a) $b)` pattern isn't being reduced through properly.

#### 1.4 `ifcasenondet.metta` (1 file)
Depends on `case` fix above.

### Priority 2: Missing ops / stdlib

- **`parse.metta`** — Need `&parse` grounded op for string→atom parsing
- **`partialdef.metta`** — Partial function definitions (fewer args than pattern vars)
- **`functionhead.metta/2/3`** (3 files) — Function head pattern matching with exact args
- **`functionremoval.metta/removalspec`** (2 files) — `remove-atom` and dynamic rule removal
- **`parametric_types.metta`** — Type parameter extraction

### Priority 3: List / pattern matching

- **`nestedcons.metta`** — `(cons $a (cons $b $L))` patterns don't match cons-lists
- **`listhead.metta`** — List deconstruction with pattern matching
- **`permutations.metta`** — List pattern matching + recursion (also slow)
- **`logicprog.metta/logicprogset`** (2 files) — Transitive closure, set operations

### Priority 4: Higher-order functions

- **`foldall.metta/foldallmatch/foldallspacecount`** (3 files) — `&foldall` needs full implementation
- **`forall.metta`** — Universal quantification over results

### Priority 5: Performance (9 timeouts)

- **factorial, fib, fibsmart** — Recursive functions, async overhead
- **peano, peanofast** — Peano arithmetic, deep recursion
- **eval** — Nested eval chains
- **holbenchmark** — Higher-order logic benchmarks
- **iter** — Large iteration counts
- **booleansolver** — Deep reduction chains

### Priority 6: External dependencies (10 skipped)

External PeTTa libraries not available: `he_*`, `git_import*`, `nars_*`, `llm_cities`, `metta4_streams`, `mutex_and_transaction`, `library`, `fibsmartimport`, `patrick_*`.

---

## Key Insights & Debugging Procedures

### Debugging procedure that worked

```bash
# 1. Run all tests for overview
NODE_NO_WARNINGS=1 NODE_OPTIONS=--experimental-vm-modules node scripts/run-petta-examples.js

# 2. Run single file for detailed output (exits 0=pass, 1=fail)
NODE_NO_WARNINGS=1 NODE_OPTIONS=--experimental-vm-modules node scripts/run-single-metta.js lambda.metta

# 3. Interactive debugging with node -e (bypasses runner's silent error handling)
node -e "
import {createMeTTa} from './metta/src/MeTTa.js';
import fs from 'fs';
const code = fs.readFileSync('./metta/examples/lambda.metta', 'utf-8');
const m = createMeTTa({loadStdlib: false});
const results = await m.runAsync(code);
console.log(JSON.stringify(results.map(r => r.toString()), null, 2));
"
```

The runner (`run-single-metta.js`) only exits 0/1 without printing diagnostics on failure. The `node -e` approach with `JSON.stringify(results.map(r => r.toString()))` reveals the actual reduction results, which is essential for diagnosing why tests fail.

### Insight: VariableAtom detection is inconsistent
VariableAtom instances have `.type === 'variable'` but NOT `._typeTag === 3`. The `_typeTag` constant comes from the Nar reasoner (`@senars/nar`) and isn't set on VariableAtom in this codebase. Always use `.type === 'variable'` or `.name?.startsWith('$')` for PeTTa compatibility.

### Insight: Lambda needs `&let` not `&subst`
`&subst` is a pure substitution function — it replaces variables with values but does NOT reduce the resulting expression through the pipeline. `&let` reduces the value first, substitutes, then returns the body which gets reduced by the caller (through `reduceNDAsync`). For nested expressions like `(+ $x $y)` where the result should be `9`, `&let` is required.

### Insight: `&let` must handle PeTTa variable forms
PeTTa variables appear in three forms:
1. `VariableAtom` with `.type === 'variable'` (standard MeTTa parser output)
2. Symbols starting with `$` — `.name.startsWith('$')` (PeTTa style)
3. Expression forms like `($x)` — a VariableAtom as operator with zero components

The `Unify.unify(pattern, value)` fallback handles the most complex cases. Always try unify first, then fall back to name/type checks.

### Insight: Closure detection needs deep operator chain walking
For `(((f 1) 2) 3)`, the structure is:
```
exp( exp( exp(f, [1]), [2] ), [3] )
```
The base function `f` is at `atom.operator.operator.operator`. `ClosureStage` must walk up the chain to find rules. When `funcAtom` is itself an expression (not a simple symbol), also check `funcAtom.operator`.

### Insight: `_matchClosure` needs dynamic rule fallback
Even when `ClosureStage` detects a closure, the `rules` array it passes may be empty if the function atom lookup returned nothing. `_matchClosure` must do its own rule lookup walking the operator chain.

### Insight: `lazy: true` is critical for control-flow ops
Without `lazy: true`, the reduction pipeline pre-reduces all arguments before calling the grounded op. For `&if`, this means BOTH branches get evaluated before the condition is checked — wrong semantics and wasteful. For `&let`, pre-reducing the body before substitution means variables in the body are never replaced. All control-flow and binding ops must be `lazy: true`.

### Insight: Async overhead is significant
Each `await` adds ~1-5ms. Deep recursive calls (factorial 10, Peano arithmetic) hit this because every reduction step goes through `await reduceNDAsync(...)`. The async pipeline is correct but slow. Consider sync fallback for simple arithmetic.

### Insight: PeTTa list representation is ambiguous
`(1 2 3)` can be:
1. An expression with operator `1` and components `[2, 3]`
2. A cons-list `(: 1 (: 2 (: 3 ())))`

The test op's `normalizeForComparison` converts expressions to cons-lists, but rule patterns expecting `(: $h $t)` won't match expression-form `(1 2 3)` unless explicit rules bridge the gap.

### Insight: The `test` op is strict
`!(test actual expected)` fully reduces both sides and compares string representations. Partial reductions, different representations (`3` vs `3.0`, cons vs expression), and un-evaluated expressions all cause mismatches.

### Insight: stdlib loading
`createMeTTa({loadStdlib: false})` skips loading `.metta` files but does NOT prevent hardcoded rules from being added. Rules in `core.metta`'s inline equivalents are still added to the space via the builder API.

### Insight: `_matchClosure` baseFunc resolution
The `_matchClosure` method in ReductionPipeline.js needs to resolve `baseFunc` from deeply nested structures. The while loop:
```js
while (!baseFunc?.name && baseFunc?.type !== 'variable' && !baseFunc?.operator?.name && currentAtom?.operator) {
    baseFunc = currentAtom.operator;
    currentAtom = currentAtom.operator;
}
```
This walks up the chain until it finds an atom with a `.name` or `.type === 'variable'`.

### Insight: `&let` substitution for expression-form variables
When the variable is an expression like `($x)` (operator=VariableAtom, no components), the binding check needs to look at `vari.operator?.name` or `vari.operator?.type`. The enhanced `&let` uses `Unify.unify(vari, resolved)` as a universal fallback that handles all forms.

---

## Files Modified

- `metta/src/interp/AdvancedOps.js` — `&is-var` fix, `&let` binding resolution, `&subst` 3-arg fallback, all ops → `opts: {lazy: true}`
- `metta/src/kernel/reduction/ReductionPipeline.js` — `_matchClosure` dynamic rule lookup, baseFunc resolution
- `metta/src/kernel/reduction/stages/ClosureStage.js` — multi-level rule lookup
- `metta/src/stdlib/core.metta` — lambda → `&let` (not `&subst`), `|->` rules
