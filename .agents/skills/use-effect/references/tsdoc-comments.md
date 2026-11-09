# TSDoc tags and comment samples

Read this when documenting any scoped code. Review existing comments throughout each complete file; add useful API contracts and implementation reasoning. For exported callable APIs and non-trivial internal functions, require a summary, `@param` for each parameter, `@returns` for returned values (including lazy effects), and `@typeParam` for generic roles, or accurately resolved inherited equivalents. Add `@remarks` for non-obvious contracts. Other tags are conditional choices, not a checklist to insert into every comment. A one-line summary alone does not pass function-contract acceptance. Document named interfaces/type aliases in their colocated `.types.ts` files and runtime schemas/services/errors in their implementation modules.

## Documentation tiers and substance

Match detail to the reader while retaining the callable requirements above:

| Location | Useful content |
| --- | --- |
| Authored file | Concrete purpose, owned behavior, inputs/outputs, neighboring modules, execution/resource/error boundaries as applicable; no hint-only headers |
| Public callable/service operation | Complete summary/parameter/return/generic contract; meaningful constraints, outcomes, failure/services, and non-obvious behavior in remarks |
| Configuration property | Meaning, units, actual default, override precedence, limits, and operational cost where these affect a caller's decision |
| Schema/service/error/companion type | Domain role, validated/encoded distinctions and type relationships; document each error field and non-obvious public member |
| Non-trivial internal function | Required callable tags plus concise local reasoning; link an owning contract instead of repeating its entire explanation |
| Pure leaf helper, fixture, or alias | Concise useful documentation; add detail for actual surprises and reuse a canonical example where applicable |

Keep summaries direct. Parameter descriptions should explain identity, units,
constraints, or relationships rather than repeat the name/type. Returns should
explain what execution yields and any meaningful absent/duplicate outcome.
Generic descriptions should explain roles, such as an adapter's service identity
or a schema's encoded representation, rather than say only "the generic type".

Use remarks for applicable guarantees: state transitions, atomic boundaries,
partial commits, ordering, retry/dedup lifetime, cancellation versus shutdown,
context ownership, and persistence privacy. Document the guarantee the code
actually implements; scope claims such as "exactly once" to the specific
transition. Keep ownership and failure information visible at its public seam.
Use the [contract guide](contracts-and-testing.md) for detailed behavioral tests.

Follow established release/version metadata and supported tags, including
`@since` when that is the project's convention; do not invent release versions
for ordinary helpers. A tag count does not establish useful documentation.

## Syntax and selection

Follow the official [tag kinds](https://tsdoc.org/pages/spec/tag_kinds/): block tags introduce sections; modifiers carry no descriptive body; inline tags use braces inside text. Use exact camelCase tag names. Check `tsdoc.json`, existing doc/lint tooling, and supported extended/discretionary tags. Do not add tooling or custom tags just to accommodate a sample.

All 25 tags from the requested reference are listed individually:

| Tag / official reference                                                    | Kind     | Appropriate use                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [@alpha](https://tsdoc.org/pages/tags/alpha/)                               | Modifier | Planned external API before release; use only under the project's release policy.                                                                                                                    |
| [@beta](https://tsdoc.org/pages/tags/beta/)                                 | Modifier | Preview API with an unstable contract; follow existing release policy.                                                                                                                               |
| [@decorator](https://tsdoc.org/pages/tags/decorator/)                       | Block    | Document an actual decorator expression, e.g. a backtick-quoted expression, when it is part of the API contract.                                                                                     |
| [@deprecated](https://tsdoc.org/pages/tags/deprecated/)                     | Block    | Explain migration and link the replacement; do not declare deprecation without an established decision.                                                                                              |
| [@defaultValue](https://tsdoc.org/pages/tags/defaultvalue/)                 | Block    | Actual defaults for class/interface fields or properties; verify fallback behavior.                                                                                                                  |
| [@eventProperty](https://tsdoc.org/pages/tags/eventproperty/)               | Modifier | A class/interface property exposing an event object with handler registration; do not automatically apply to an Effect Stream.                                                                       |
| [@example](https://tsdoc.org/pages/tags/example/)                           | Block    | Useful usage sample, optionally titled, with fenced code. Show the member and its relevant outcome; supply ordinary imports/provisioning in the checking harness.                                                                                   |
| [@experimental](https://tsdoc.org/pages/tags/experimental/)                 | Modifier | Preview designation with beta semantics for supporting tooling; follow project policy rather than combining arbitrary release stages.                                                                |
| [@inheritDoc](https://tsdoc.org/pages/tags/inheritdoc/)                     | Inline   | `{@inheritDoc Base.method}` for a compatible existing contract. Inherits summary/remarks/parameters/type parameters/returns, not examples/defaults; do not add a local summary or remarks beside it. |
| [@internal](https://tsdoc.org/pages/tags/internal/)                         | Modifier | API intended for internal consumers under the project's release/documentation policy; this does not enforce TypeScript access control.                                                               |
| [@label](https://tsdoc.org/pages/tags/label/)                               | Inline   | `{@label NAME}` for declarations selected by documentation references; use only where tooling supports the evolving notation.                                                                        |
| [@link](https://tsdoc.org/pages/tags/link/)                                 | Inline   | `{@link Symbol}` or `{@link Symbol \| label}` for related APIs; URL targets also work. Resolve declaration references with project tooling.                                                          |
| [@override](https://tsdoc.org/pages/tags/override/)                         | Modifier | Document an overridden inherited member where useful to tooling; prefer TypeScript's `override` keyword in implementation.                                                                           |
| [@packageDocumentation](https://tsdoc.org/pages/tags/packagedocumentation/) | Modifier | Package overview in the first doc comment of the package entry point; never attach it to an individual API.                                                                                          |
| [@param](https://tsdoc.org/pages/tags/param/)                               | Block    | `@param name - description`; explain meaning, constraints, and units, matching actual parameter names.                                                                                               |
| [@privateRemarks](https://tsdoc.org/pages/tags/privateremarks/)             | Block    | Maintainer notes excluded from generated public docs by compliant tools. Source remains readable; never place secrets here.                                                                          |
| [@public](https://tsdoc.org/pages/tags/public/)                             | Modifier | Stable released external API under project policy; exporting a symbol alone does not establish that promise.                                                                                         |
| [@readonly](https://tsdoc.org/pages/tags/readonly/)                         | Modifier | Document a read-only contract when the type surface does not express it; prefer actual `readonly` typing where applicable.                                                                           |
| [@remarks](https://tsdoc.org/pages/tags/remarks/)                           | Block    | Non-obvious semantics: required services, failure channels, laziness, idempotency, ordering, interruption, and resource ownership.                                                                   |
| [@returns](https://tsdoc.org/pages/tags/returns/)                           | Block    | Describe the returned value; for Effect, explain that it is lazy and what successful execution yields.                                                                                               |
| [@sealed](https://tsdoc.org/pages/tags/sealed/)                             | Modifier | Document a class/member that must not be extended/overridden under an established contract; not runtime enforcement.                                                                                 |
| [@see](https://tsdoc.org/pages/tags/see/)                                   | Block    | Related references; use `@see {@link Symbol}` for a hyperlink. Repeat for separate references.                                                                                                       |
| [@throws](https://tsdoc.org/pages/tags/throws/)                             | Block    | Actual thrown exceptions, one block per exception type. Effect's typed error channel belongs in returns/remarks, not here; distinguish synchronous throws from Promise rejection.                    |
| [@typeParam](https://tsdoc.org/pages/tags/typeparam/)                       | Block    | `@typeParam T - description` for generic type roles/constraints.                                                                                                                                     |
| [@virtual](https://tsdoc.org/pages/tags/virtual/)                           | Modifier | Document an intentionally overridable class member; follow inheritance/tooling policy.                                                                                                               |

## Comment samples

These are illustrative domain snippets, not ready-made application APIs. Adapt names and truthful contracts; verify Effect examples/types against the installed version and vendor source, and run existing documentation/example checks when available. Keep summaries concise, omit irrelevant tags, and avoid documenting behavior that the implementation does not guarantee.

### File scope headers

For each new or edited authored source file, put a useful scope overview after
licenses/directives and before imports/declarations. Explain its implemented
responsibility and how it participates in the domain. Readers should understand
what it accepts/produces and where decisions or resources are owned without
opening another file. Test paths alone, filename paraphrases, and vague hints
are insufficient. Use a short paragraph whose detail follows the actual role;
do not invent guarantees or repeat a fixed template. Keep symbol documentation
attached to declarations; reserve `@packageDocumentation` for true package entries.

```ts
/**
 * Exposes the Redis job-store service and its Layer as the adapter's public API.
 * Consumers provide Redis connection configuration through the owning runtime.
 * Script execution and subscriber cleanup remain private to RedisJobStore.
 */
```

```ts
/**
 * Implements job-store commands using the platform Redis service.
 * Atomic mutation scripts live in scripts.ts; this module decodes their results
 * and translates operational failures into the store's typed error contract.
 * The owning Layer acquires and finalizes the notification subscriber; individual
 * commands borrow that dependency and do not close it.
 */
```

```ts
/**
 * Defines the server-side mutations called by the Redis job-store adapter.
 * Each script documents its keys, ordered arguments, result shape and failure
 * conditions beside the implementation. Callers supply Clock-derived timestamps,
 * so scripts share the same time source as workflows and deterministic tests.
 */
```

These are adapted scope examples, not guarantees to copy. Review the actual
implementation before claiming atomicity, time ownership or shutdown behavior.
Use the scope-to-detail progression from effect-mq's
[barrel](https://github.com/TeamWarp/effect-mq/blob/main/packages/effect-mq/src/redis/index.ts),
[adapter](https://github.com/TeamWarp/effect-mq/blob/main/packages/effect-mq/src/redis/RedisJobStore.ts),
and [scripts](https://github.com/TeamWarp/effect-mq/blob/main/packages/effect-mq/src/redis/scripts.ts).
Do not copy unrelated key layouts, version tags or implementation history.
Headers and examples describe implemented service/error contracts; they cannot
replace runtime implementation/refactoring or its checks.

### Choosing and checking examples

Use @example to demonstrate the documented member, with a short call and the
meaningful result or recovery. State assumed instances/context in prose. Normal
imports, unrelated setup, Layer wiring, and runPromise wrappers belong in the
test harness, not every API comment. Show provisioning only for a member whose
subject is provisioning, and avoid turning its example into a full lifecycle.

Check each snippet in the real typed context with required imports/services and
execute meaningful behavior assertions. A short example is not permission to
omit verification. Related members may link to a canonical focused example;
`@inheritDoc` does not inherit examples. Architectural guides may show larger
composition examples, but they are not templates for member-level TSDoc.

### Error members

The class summary explains when a failure happens. Each payload property must
explain its own meaning and recovery role; a bare `cause`, `id`, or `message`
declaration is insufficient. For example:

```ts
/** A requested document could not be read from its backing source. */
class ReadFailure extends Data.TaggedError("Documents.ReadFailure")<{
  /** Tenant-local identity of the document whose read failed. */
  readonly id: string
  /** Safe adapter diagnostic; the original rejection is retained in Error.cause. */
  readonly cause: Error
}> {}
```

Use meaningful descriptions, not restatements of the property type. Explain
units, allowed values, retry eligibility or sensitive context when relevant.
Never author an unknown type in snippets; apply the strict type rule from the
code-style reference to examples and tests as well as runtime code.

### Effect operation contract

Assume the domain types and Effect are in scope, with UserRepository already provided by the caller. The harness supplies setup; the member example focuses on the lookup:

````ts
/**
 * Finds a user by their identifier.
 *
 * @param id - The stable user identifier.
 * @returns A lazy effect that yields the matching user when executed.
 *
 * @remarks
 * Requires UserRepository. The typed failure channel contains UserNotFound
 * when the identifier has no matching record. Calling this function only
 * constructs the effect; repository access happens during execution.
 *
 * @example With UserRepository provided:
 * ```ts
 * const user = yield* findUser("user-42");
 * ```
 *
 * @see {@link UserRepository}
 */
export declare function findUser(
  id: string,
): Effect.Effect<User, UserNotFound, UserRepository>;
````

Document scope/finalization, interruption support, retry eligibility, or cache semantics in remarks when they are part of the actual operation's contract. Do not add `@throws UserNotFound` to this effect-returning API.

### Pure generic helper

```ts
/**
 * Keeps a value's identity and inferred type.
 *
 * @typeParam T - The input and result type.
 * @param value - The value to preserve.
 * @returns The same value without copying it.
 */
export function identity<T>(value: T): T {
  return value;
}
```

### Configuration property

Use the stated default only when the implementation actually supplies it:

```ts
export interface WorkerOptions {
  /**
   * Maximum number of tasks processed concurrently.
   *
   * @remarks
   * Must be a positive integer. Limits active processing, not queue capacity.
   *
   * @defaultValue `4`
   */
  readonly concurrency?: number;
}
```

### Actual thrown exception

This synchronous guard throws; its exception is documented separately from an Effect failure channel:

```ts
/**
 * Validates a worker concurrency limit.
 *
 * @param value - The proposed number of simultaneous tasks.
 * @returns The supplied positive integer.
 *
 * @throws {@link RangeError}
 * When value is not a positive integer.
 */
export function validateConcurrency(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError("Concurrency must be a positive integer");
  }
  return value;
}
```

### Inline implementation reasoning

Use ordinary `//` comments for local decisions. In these illustrative fragments, the surrounding layer owns `events` and supplies the named handlers:

```ts
// The layer owns this consumer, so shutdown interrupts it before resources close.
yield * events.pipe(Stream.runForEach(handleEvent), Effect.forkScoped);

// Keep parallel writes below the provider's connection limit.
yield * Effect.forEach(records, persist, { concurrency: 4 });
```

Other useful comments explain why an operation is safe to retry, why a buffer may drop messages, why a failure remains visible, or why a state transition must be atomic. Verify each claim against code; remove stale comments instead of retaining misleading explanations.

### Decisions, invariants, and evidence

Place the explanation beside the decision whose correctness depends on it. Name
the invariant and failure prevented, keeping the comment as short as the
reasoning permits. For example, these comments explain specific tradeoffs:

```ts
// Awaiting handler cleanup here would block heartbeat renewal for other jobs.
// The handler's owner observes completion; this loop only delivers cancellation.

// Keep the established jobs-then-dedupe lock order; reversing it can deadlock
// a concurrent terminal transition.

// The runtime schema guard proves this branch of the generic union.
// TypeScript cannot narrow the unresolved generic parameter to that branch.
```

These are illustrative reasoning fragments, not permission to add unsafe APIs,
SQL locks, or assertions. An assertion explanation must identify the actual
guard, construction invariant, or checked type relationship. It cannot establish
the shape of unvalidated external data or repair an incorrect service graph.
Use the repository's existing comment format; a `SAFETY` label alone proves
nothing. Prefer schemas, narrowing, and precise types when they remove the cast.

Before finishing, compare comments with implementation, configuration defaults,
and tests. Check sibling descriptions for contradictions after behavior changes
(for example, delayed trace linking versus a blanket producer-parent claim).
Preserve useful reasoning when moving code and remove obsolete history or
comments that merely narrate syntax. Follow the existing formatter and comment
placement conventions instead of adding documentation/lint tooling by default.

### Inherited and deprecated documentation

When a project has established a replacement and the old/new contracts match, a comment can be:

```ts
/**
 * {@inheritDoc UserRepository.find}
 *
 * @deprecated Use {@link UserRepository.find} instead.
 */
```

Keep release/inheritance modifiers conditional on the actual project contract; ordinary service functions rarely need them.
