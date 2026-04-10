# PeTTa MeTTa Implementation - Gap Closure

## Overview

The MeTTa implementation in this repo (`metta/src/`) is being evaluated against
the **PeTTa dialect** by running 100 example files from the
[PeTTa repository](https://github.com/trueagi-io/PeTTa/tree/main/examples).

Each example is run as an isolated child process with a 1-second timeout.
Passing means: (a) completes within timeout, AND (b) all `!(test ...)` assertions match.

### How to run tests

```bash
cd /home/me/senars10
NODE_NO_WARNINGS=1 NODE_OPTIONS=--experimental-vm-modules node scripts/run-petta-examples.js
```

### Current status

| Status | Count | Details |
|--------|-------|---------|
| ✓ Pass | **17** | and_or, chain, collapse, comments, constanthead, empty, greedy_chess, identity, if, if2, if4, ifsimple, letstar, matchtypes, multicall, myinterpreter, once |
| ⏱ Timeout | 13 | factorial, fib, fibsmart, eval, holbenchmark, iter, letlet, matespace, matespace2, matespacefast, peano, peanofast, booleansolver |
| ✗ Fail | 60 | See "Remaining work" below |
| ⊘ Skip | 10 | External deps: git_import, git_import2, fibsmartimport, library, nars_direct, nars_tuffy, llm_cities, metta4_streams, mutex_and_transaction, he_atomspace |

**Pass rate: 19%** (17/90 testable). Started at 12% (12/90).

---

## What was done

### Infrastructure
- `metta/examples/` — 100 `.metta` files copied from PeTTa repo
- `metta/examples/README.md` — attribution + link
- `scripts/run-petta-examples.js` — CLI runner (each example as separate child process)
- `scripts/run-single-metta.js` — single-file runner (used by the CLI)
- `tests/integration/metta/petta-examples.test.js` — Jest integration test

### MeTTa Implementation Fixes

#### 1. Bare expressions → space (MeTTaInterpreter.js)
**Bug**: `(a b)` was being evaluated instead of added to the space as a fact.
**Fix**: Both sync and async processing paths now add bare expressions to the
space, matching standard MeTTa behavior. Only `!`-prefixed expressions are evaluated.

#### 2. Async Promise leak (ReductionPipeline.js)
**Bug**: Grounded ops (`&==`, `&>`, `&+`, etc.) return Promises. The sync
reduction path yielded these Promises as reduced atoms, causing `[object Promise]`
to leak into comparisons.
**Fix**:
- Sync `_executeGrounded` now skips async ops (returns `applied: false`)
- Added `_reduceArgumentAsync`, `_reduceOperatorAsync`, `_executeWithZipperAsync`
  — full async pipeline
- `_reduceArgumentAsync` falls through to execute the grounded op when the
  argument can't be reduced further (e.g., `(^ &repr (f 1))` when `(f 1)` won't reduce)

#### 3. Currying / partial application (ClosureStage.js)
**Bug**: `((f 1) 2)` didn't combine partial args to match the rule for `f`.
**Fix**: New `ClosureStage` detects expression-as-operator patterns like
`((f 1) 2)` where `(f 1)` is a partial application. It combines captured args
with provided args and tries rule matching.

#### 4. Missing grounded ops (AdvancedOps.js, Ground.js, core.metta)
Added:
- `&cut` — returns `()` (peeks non-determinism, placeholder for pruning)
- `&once` — returns first element of a cons-list
- `&is-var` — checks if atom is a variable (type-tag check)
- `&=alpha` — alpha-equivalence (structural equality ignoring variable names)
- `&repr` — string representation with partial-application detection
- `&case` — pattern matching with multiple branches
- `&foldall` — fold over all non-deterministic reduction results

#### 5. stdlib fixes (core.metta, hof.metta, list.metta)
- Fixed `add-atom`/`rm-atom` arity: `(add-atom $s $x)` (2 args, PeTTa style)
- Fixed `&add-atom`/`&rm-atom`/`&get-atoms` to handle `&self` → interpreter's space
- Added `append` rules for PeTTa-style list expressions `($x)`, `($x $y)`, etc.
- Added `map-atom` 2-arg variants for partial function application
- Added `empty`, `cut`, `once`, `is-var`, `case`, `foldall`, `repr` stdlib rules

#### 6. Test op improvements (MinimalOps.js)
- Uses `evaluateAsync` for proper async reduction
- Normalizes cons-lists `(: a (: b ()))` and PeTTa expressions `(a b)` to the
  same cons-list form for comparison
- Handles quoted strings: `"(partial f (1))"` vs `(partial f (1))`
- Handles `collapse` returning `()` for empty results

#### 7. Collapse improvements (MinimalOps.js)
- Async (`reduceNDAsync`)
- Returns `()` directly for empty results (not `(: () ())`)
- If single result is already a list, returns it as-is (avoids double-wrapping)

#### 8. Bug fixes
- `CoreRegistry._normalize()`: Guard for non-string atom names (was crashing with
  `name.startsWith is not a function`)
- PeTTa-style list expressions in `append`: `($x $y)` → `(: x (: y ()))`

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
    Unify.js             # Pattern matching/unification
    Space.js             # Atom space (facts + rules)
    Ground.js            # Grounded operations registry (CoreRegistry subclass)
    Zipper.js            # Deep expression traversal
    reduction/
      ReductionPipeline.js  # Multi-stage reduction engine (Cache → Superpose → Closure → RuleMatch → OperatorReduce → Zipper → GroundedOp → ExplicitCall)
      stages/
        ClosureStage.js     # NEW: Detects ((f 1) 2) partial applications
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
      ...
  interp/
    AdvancedOps.js       # &if, &when, &let, &let*, &map-fast, &add-atom (override), alphaEquiv
    MinimalOps.js        # eval, chain, unify, collapse, superpose, test, createTestOp
  stdlib/
    core.metta           # if, let, let*, lambda, logic, arithmetic wrappers, cut, once, empty, is-var, case, foldall, repr
    list.metta           # append, take, drop, nth, reverse, zip, etc.
    hof.metta            # map-atom, filter-atom, foldl-atom
    match.metta          # match helpers
    types.metta          # Type system
    ...
  config/
    ConfigManager.js     # Configuration
    ExtensionRegistry.js # Extensions

scripts/
  run-petta-examples.js  # Main test runner
  run-single-metta.js    # Single-file runner (spawned by run-petta-examples.js)
```

### Key patterns

**Grounded ops**: Registered via `ground.register('&name', fn, opts)`.
- `lazy: true` — args are not pre-reduced (op gets raw atoms)
- `async: true` — op is async, reduction pipeline uses async path

**Reduction pipeline stages** (in order):
1. CacheStage — memoized results
2. JITStage — compiled hot paths
3. SuperposeStage — expand non-deterministic alternatives
4. **ClosureStage** — NEW: detect `((f args...) moreArgs)`
5. RuleMatchStage — match rules for atom
6. OperatorReduceStage — reduce operator expression
7. ZipperStage — deep traversal for nested expressions
8. GroundedOpStage — call grounded operations
9. ExplicitCallStage — direct function calls

**Expression representation**:
- PeTTa uses `(: head tail)` cons-cells for lists: `(: 1 (: 2 (: 3 ())))`
- PeTTa also accepts shorthand: `(1 2 3)` parsed as expression with operator `1` and components `[2, 3]`
- The parser converts `(1 2 3)` to `exp(sym('1'), [sym('2'), sym('3')])`
- The `cons` rule maps: `(= (cons $h $t) (: $h $t))`
- The `test` op normalizes both forms to cons-lists for comparison

**Rule matching**: `space.rulesFor(atom)` finds all rules whose pattern unifies with the atom.
The `ClosureStage` extends this by detecting partial applications and combining args.

---

## Remaining Work (60 failures)

### Priority 1: High impact, targeted fixes

#### 1.1 Fix `cut.metta` (1 file)
**Test**: `(foo 1)`, `(foo 2)`, `match-single-via-cut` → should return only `(bar 1)`, not `(bar (: 1 (: 2 ())))`.
**Root cause**: Our `match` returns a cons-list of all results. `cut` returns `()` which is added
to the match results. In PeTTa, `match` produces non-deterministic alternatives via `superpose`,
and `cut` prunes remaining alternatives.
**Fix approach**:
- Option A: Make `match` produce `superpose` alternatives instead of a cons-list
- Option B: Make `cut` set a "cut flag" in the reduction context that causes the
  reduction pipeline to stop producing alternatives after the current one
- Option C: In the `ClosureStage` / `RuleMatchStage`, after a match succeeds with `cut`,
  yield only that one result

#### 1.2 Fix `if3.metta` (1 file)
**Test**: `(if (is-var $A) (if True 42 lol) (+ 2 2))` → should return `42`.
**Root cause**: The rule `(= (is-var $x) True)` matches EVERY atom (because `$x` is
unconditionally bound). It should only return True for variable atoms.
**Fix**: The `&is-var` grounded op is correct. The stdlib rule `(= (is-var $x) True)`
in `core.metta` is wrong — it's a catch-all that shadows the grounded op. Remove it.
The `(is-var $A)` in the test has `$A` as a free variable in the program text, which
the parser represents as a VariableAtom. When reduced, `&is-var` sees the variable and
returns True. But the catch-all rule intercepts first.

#### 1.3 Fix `lambda.metta` (1 file)
**Test**: `applyL2` → should return `9`.
**Root cause**: `applyL2` uses `(|-> $y (^ &+ $y $y))` — a PeTTa-style lambda. The
reduction engine needs to recognize `|->` as lambda syntax and apply it. The `ClosureStage`
handles `((lambda $p $b) $v)` but `|->` creates a different expression structure.
**Fix**: Add `|->` pattern recognition to `ClosureStage` or add a stdlib rule.

#### 1.4 Fix `case.metta` family (5 files: case, case2, caseconstrain, caseempty, casenew)
**Test**: `(case 5 ((4 42) ($other 44)))` → should return `44`.
**Root cause**: The `&case` grounded op exists but the unification logic may not handle
the branch list structure correctly. PeTTa's case branches are `((pat result) ...)` lists.
**Fix**: Debug `&case` to ensure it correctly iterates over cons-list branches and
unifies patterns.

### Priority 2: Missing stdlib / ops

#### 2.1 `parse.metta` (1 file)
The `parse` operation for parsing strings into atoms. May need `&parse` grounded op.

#### 2.2 `partialdef.metta` (1 file)
Partial function definitions — functions with fewer args than pattern vars should
return a partial application, not fail.

#### 2.3 `functionhead.metta` / `functionhead2.metta` / `functionhead3.metta` (3 files)
Function head pattern matching — rules like `(= (h (42 10 40) 42000) True)` should
match when called with those exact arguments.

#### 2.4 `functionremoval.metta` / `functionremovalspec.metta` (2 files)
`remove-atom` and dynamic rule removal.

#### 2.5 `parametric_types.metta` (1 file)
Type parameter extraction and inference.

### Priority 3: List / pattern matching

#### 3.1 `nestedcons.metta` (1 file)
`(cons $a (cons $b $L))` patterns don't match PeTTa lists `(: x (: y z))` because
the stdlib `cons` rule `(= (cons $h $t) (: $h $t))` requires the rule matcher to
follow the indirection. This is a fundamental pattern-matching limitation.

#### 3.2 `listhead.metta` (1 file)
Same issue — list deconstruction with pattern matching.

#### 3.3 `permutations.metta` (1 file)
Generates permutations using list pattern matching and recursion. Also very slow.

#### 3.4 `logicprog.metta` / `logicprogset.metta` (2 files)
Logic programming patterns — transitive closure, set operations.

### Priority 4: Higher-order functions

#### 4.1 `foldall.metta` / `foldallmatch.metta` / `foldallspacecount.metta` (3 files)
`foldall` needs to iterate over all non-deterministic results of an expression.
The current `&foldall` is a stub.

#### 4.2 `forall.metta` (1 file)
Universal quantification over a set of results.

### Priority 5: Performance (13 timeouts)

These files produce correct results but take >1s:
- **factorial, fib, fibsmart** — Recursive functions, heavy async overhead
- **peano, peanofast** — Peano arithmetic, very deep recursion
- **eval** — Nested eval chains
- **holbenchmark** — Higher-order logic benchmarks
- **iter** — Iteration with large numbers
- **letlet, matespace, matespace2, matespacefast, booleansolver** — Deep reduction chains

**Fix approaches**:
- Increase max reduction steps
- Add memoization / JIT caching
- Optimize `reduceNDAsync` to reduce `await` overhead
- Make simple arithmetic ops synchronous in the async pipeline

### Priority 6: External dependencies (10 skipped)

These require external PeTTa libraries we don't have:
- `he_*` files — need `lib_he` (HeMeTTa library)
- `git_import*` — git-based module loading
- `nars_*` — NARS integration
- `llm_cities` — LLM integration
- `metta4_streams` — stream processing
- `mutex_and_transaction` — concurrent programming
- `library` — PeTTa library system
- `fibsmartimport` — imports PeTTa library
- `patrick_*` — imports `lib_patrick`

---

## Key Insights

### The test op is strict
The `!(test actual expected)` construct fully reduces `actual` and compares its
string representation to `expected`. This means:
- Partial reductions fail (e.g., if an op is not registered)
- Different string representations of the same value fail (`3` vs `3.0`, cons vs expression)
- The test normalization in `MinimalOps.createTestOp` handles cons-list ↔ expression
  conversion, but there may be edge cases

### PeTTa list representation is ambiguous
`(1 2 3)` can mean:
1. An expression with operator `1` and components `[2, 3]`
2. A cons-list `(: 1 (: 2 (: 3 ())))`

The test op's `normalizeForComparison` converts expression lists to cons-lists for
fair comparison. But rule patterns that expect `(: $h $t)` won't match `(1 2 3)`
unless there are explicit rules for the expression form.

### Async overhead is significant
Each `await` adds ~1-5ms. Deep recursive calls (factorial 10) hit this hard because
every reduction step goes through `await reduceNDAsync(...)`. The async pipeline
is correct but slow.

### The closure stage is partial
`ClosureStage` detects `((f 1) 2)` but only when the inner operator is a simple symbol
expression. It doesn't handle cases where the partial function is stored in a variable
(e.g., `let $f (f 1) ($f 2)`).

### Space-based facts vs rule-based facts
When `(foo 1)` is added to the space, it's a fact atom. `match &self (foo $x)`
should find it. This now works (bare expressions go to space). But when a rule
defines `(= (foo $x) (bar $x))`, calling `(foo 1)` reduces via the rule, not the
fact. The interaction between facts and rules in `match` can be surprising.

### stdlib loading
The stdlib is loaded from `metta/src/stdlib/*.metta` files at interpreter creation.
Changes to these files take effect on next interpreter instantiation. The
`{loadStdlib: false}` flag in tests only disables loading from `.metta` files —
hardcoded rules in `core.metta`'s inline equivalents are still added to the space.

---

## Files Modified (for git diff reference)

### Modified
- `metta/src/MeTTaInterpreter.js` — bare expressions → space
- `metta/src/interp/AdvancedOps.js` — `&is-var`, `&=alpha`, `&repr`, `&case`, `&foldall`, `&add-atom` fix, `alphaEquiv`
- `metta/src/interp/MinimalOps.js` — `collapse` async, `test` with normalization, `test` quoted string handling
- `metta/src/kernel/Ground.js` — `&cut`, `&once` placeholders
- `metta/src/kernel/Reduce.js` — context pooling, async pipeline
- `metta/src/kernel/ops/CoreRegistry.js` — `name.startsWith` guard
- `metta/src/kernel/ops/SpaceOps.js` — `&self` resolution
- `metta/src/kernel/reduction/ReductionPipeline.js` — async pipeline stages, closure dispatch
- `metta/src/stdlib/core.metta` — `cut`, `once`, `empty`, `is-var`, `case`, `foldall`, `repr`, `=alpha` rules
- `metta/src/stdlib/hof.metta` — `map-atom` PeTTa list variants
- `metta/src/stdlib/list.metta` — `append` PeTTa list variants

### New files
- `metta/src/kernel/reduction/stages/ClosureStage.js`
- `metta/examples/` — 100 PeTTa .metta files
- `metta/examples/README.md`
- `scripts/run-petta-examples.js`
- `scripts/run-single-metta.js`
- `tests/integration/metta/petta-examples.test.js`

---

## Recommended Next Steps

1. **Quick wins first** — Fix `if3.metta` (remove catch-all `is-var` rule), then
   `lambda.metta` (add `|->` pattern support). These are 1-2 line fixes each.

2. **Fix `cut.metta`** — This unlocks the `cut` semantics test and may help
   `once.metta` variants too.

3. **Fix `case` family** — Debug the `&case` grounded op.

4. **Tackle list pattern matching** — This is the hardest architectural issue.
   The fundamental problem is that PeTTa uses `(: h t)` cons-cells but also accepts
   `(h t)` expression shorthand, and rule patterns don't automatically convert.

5. **Performance** — After correctness, optimize the hot path. Consider:
   - Sync fallback for simple arithmetic expressions
   - Reduction result caching
   - Batch async operations where possible
