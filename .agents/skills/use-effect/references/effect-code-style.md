# Effect code style and composition

Read before new implementation or runtime refactoring. Apply these choices with
all existing service, error, concurrency, documentation and size requirements.
The six guides describe tools, not a requirement to put every API in every module.
Prefer the smallest readable composition that preserves the domain contract.

## 1. Runtime boundaries and explicit callbacks

Use the installed platform's runMain at an executable application boundary, with
Layers provided and the main Scope owned there. Keep runPromise/runSync out of
domain methods; Promise interoperability remains a deliberate outer adapter.
Signal-driven shutdown must interrupt owned work and await resource finalizers.
Verify a CLI/server with a real child-process signal test, not just a mocked runner.

Prefer explicit callback parameters when passing application functions to map,
flatMap, tap, forEach or similar combinators. This protects generic inference and
avoids forwarding unwanted index/optional arguments. Avoid point-free application
callback chains and flow used merely for brevity. A library-supplied pipe operator
such as Effect.scoped or Match.exhaustive is different: use its supported operator
form, or an explicit lambda when inference requires it. Do not wrap all operators
mechanically or replace precise functions with casts.

Guide: [Guidelines](https://effect.website/docs/v4/code-style/guidelines).
Verify Runtime.ts, the selected platform runtime and its signal/teardown usages.

## 2. Dual APIs: choose the readable call shape

Use data-first for a clear isolated operation and data-last in a readable pipe.
Both are legitimate; preserve local conventions and actual overload inference.
Confirm support rather than assuming every function is dual. Preserve callback
laziness, errors and service requirements in either shape.

Only author a custom Function.dual helper when callers actually benefit from both
forms. Keep explicit overloads in the owning type companion, one implementation,
and the verified arity or predicate dispatch. Test both forms, generics and partial
application; overloads must not erase E/R or permit invalid inputs. Do not create
dual versions of every service method, or add wrappers around existing Effect APIs.

Guide: [Dual APIs](https://effect.website/docs/v4/code-style/dual).
Verify Function.ts dual implementation/tests and each selected API's overloads.

## 3. Brands: semantic separation plus truthful validation

Use distinct brands where same-shaped values must not be interchangeable, such as
account IDs and document IDs. Put named types in type companions. Prefer constrained
Schema values followed by Schema.brand for decoded domain boundaries; decode again
after serialization. Branding alone does not validate, authorize or sanitize data.

Brand.nominal is appropriate for trusted identity construction without validation.
For constructor-based validation in 4.0.1, inspect Brand.make or Brand.check; use
result/option/is when invalid input is expected. Direct validating constructors
throw, so do not turn ordinary bad input into a defect accidentally. Brand.all
combines compatible-base constructors and their checks. Reuse Schema.fromBrand
when integrating an existing constructor; do not duplicate divergent predicates.
Arithmetic/transforms can invalidate an invariant: validate the result rather than
casting its brand back. Never fabricate brands with assertions or copy broad types
from tutorial internals. Test runtime boundaries and compile-time non-interchangeability.

Guide: [Branded types](https://effect.website/docs/v4/code-style/branded-types).
Verify Brand.ts, Schema.ts and brand tests; the guide's “refined” heading is not
an instruction to use an unverified legacy Brand.refined API.

## 4. Pattern matching: make variant handling complete

Use Match for meaningful shape/predicate/tag branching. Keep a simple guard or if
when clearer. Prefer an existing Data.TaggedEnum/Schema tagged-union matcher when
it already expresses the domain; do not add a second representation just for Match.
Match.type builds a reusable matcher; Match.value handles one value. Patterns are
ordered, so overlapping predicates require deliberate precedence and tests.

Use tag/tags for _tag unions and verified discriminator APIs for another field.
Finish closed unions exhaustively. Put withReturnType first when enforcing one
branch result contract. A fallback must represent a real domain default, not hide
a newly added variant. option/result are appropriate when absence/unmatched input
is an intended outcome. Match selects values or lazy Effects; it does not itself
run Effects or replace catchTag/catchTags failure recovery. Keep branch effects lazy
and test that unselected branches do not execute. Exhaustiveness is not runtime
validation of foreign payloads: decode first.

Guide: [Pattern matching](https://effect.website/docs/v4/code-style/pattern-matching).
Verify Match.ts, ordered predicates, finalizers and compile-time exhaustiveness tests.

## 5. Flatten nesting with generators or small Do pipelines

Default multi-step service workflows to named Effect.fn and Effect.gen. Bind values
with yield* and keep a straight sequence of domain steps. Use short pipes for
transformations and cross-cutting operation wrappers, not deeply nested flatMaps.

Effect.Do with bind/bindTo and let is useful for a short named-record pipeline.
bind executes an Effect; let/map compute pure values. Do not hide an effectful call
inside let/map or return an unexecuted nested Effect. In 4.0.1, binding an existing
key replaces its value/type; avoid accidental shadowing and test deliberate replacement.
Sequential binds do not acquire concurrency automatically; express independent
work with bounded all/forEach as required by the concurrency reference. Choose gen
when the growing record or callbacks obscure the workflow. Do is optional in
application code; a focused contract test can teach it without distorting services.
Use Effect Clock for timing, even where a tutorial uses Date or console directly.

Guide: [Excessive nesting](https://effect.website/docs/v4/code-style/do).
Verify Effect.ts Do/bind/bindTo/let signatures and their tests.

## 6. Control flow: preserve execution semantics

Use ordinary guards inside generators for simple decisions. Use when for a
conditional Effect with an intentional Option result. zip/zipWith sequence by
default; their verified concurrent option is distinct from traversal concurrency.
all preserves tuple/record shape; forEach handles effectful collections with
ordered results, explicit limits and discard when unused. A fail-fast concurrent
batch can already have performed side effects; it is not a transaction.

For a stateful loop, choose clear generator control flow or the installed
whileLoop contract. In 4.0.1 it is whileLoop({ while, body, step }): Effect<void>;
while reads state, body runs an Effect, and step receives its successful result.
The guide's initial-state/collected-array description does not match that signature.
Allocate mutable loop state inside each execution (gen/suspend), bound termination,
and preserve interruption and early failure. Use Schedule for retry/repeat policies
instead of a custom polling loop. Result collection propagates pure defects/interruption, but typed extraction in
4.0.1 can discard sibling reasons in mixed Causes. Inspect complete Exits/Causes
when that distinction matters; apply the mixed-Cause policy in errors-and-recovery.md
and the ownership rules in concurrency-and-coordination.md.

Guide: [Control flow](https://effect.website/docs/v4/code-style/control-flow).
Verify Effect.ts and internal/effect.ts whileLoop/when/zip/all/forEach behavior.

## Acceptance alongside the existing core

- Check both dual call forms without broad casts; verify generic/error/requirement
  inference and callback arity when relevant.
- Test brand decoding, invalid input and wrong-brand compile-time rejection;
  cover serialization and invariant-changing operations where they occur.
- Exercise every meaningful match branch, overlap precedence and intentional
  fallbacks. Include compile-time exhaustiveness and unselected-effect laziness.
- Check gen/Do sequencing, skipped when branches, correct Option handling, loop
  termination and fresh state on repeated execution, failure and cancellation.
- Retain the existing concurrency, Context, error, telemetry and documentation
  gates. Readable composition does not relax <=200 file lines or <50 body lines.
- For a runnable application, include real live Layer composition and execute its
  local I/O path. Test the same service contract with substitutable test Layers.
  “Live” in a name is not evidence: verify emitted files/responses, acquisition,
  failure and cleanup. Isolate test paths/ports and avoid touching user data.

Review baseline: the six linked v4 guides plus installed Effect 4.0.1 source and
matching upstream tests. Installed compatibility governs discrepancies. Keep
conditional integration references conditional; do not introduce infrastructure
merely to claim every skill branch was exercised.
