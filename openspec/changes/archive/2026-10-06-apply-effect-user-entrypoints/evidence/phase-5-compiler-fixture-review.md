# Independent compiler fixture review

Author: `/root/compiler_fixture_author`. Reviewer:
`/root/compiler_fixture_reviewer`. The sole changed TypeScript file,
`tests/compiler/project-typecheck.test.ts`, was read completely through EOF
after the author's final correction. Its accepted hash and line count are in
`phase-5-compiler-fixture-files.json`. No source edit was made by the reviewer.

## Problem and preserved checks

The previous module-global roots array registered a parent before asynchronous
fixture preparation finished. Its `afterEach` could remove that directory while
timed-out native fixture operations continued. The latest failed repository
verification included three compiler timeouts and an ENOENT during fixture
writing. This ownership defect does not establish why the compiler cases became
slow, and the focused result does not replace complete repository acceptance.

The original three compiler scenarios, both generated-directory alternatives,
all seven calls to `typecheckProject`, and their assertions remain. The explicit
15,000 ms route-assertion deadline and the verification command's 15,000 ms
limit are unchanged. No production compiler code, caching, scenario selection,
or TypeScript validation was modified.

## Effect and resource review

- `withFixture` acquires a unique parent and immediately gives its lifetime to
  `Effect.acquireUseRelease`. Preparation happens inside the already-owned
  parent, so partial preparation failures also reach its finalizer.
- Acquisition and release inherit the bracket's interruption mask. Its use
  boundary explicitly masks the finite native Promise encompassing preparation
  and the test body. Those filesystem Promises and synchronous compiler calls
  do not offer physical cancellation; waiting for their actual settlement
  prevents cleanup from racing a logical fiber interruption. The test runner's
  deadline still determines test failure.
- Cleanup closes over that invocation's parent. There is no global mutable
  fixture registry, cross-test cleanup, detached cleanup fiber, retry or cache.
  The bracket retains body and release failure evidence in Effect's Cause.
- The native Promise boundary is appropriate for this Bun compiler acceptance
  fixture. No application service, Schema model, TaggedError, Ref, Queue,
  Cache or RcMap is introduced merely to wrap test setup. This finite test
  fixture has one explicit resource owner and no reusable domain authority.
- The final helper comments describe lazy execution, inputs, native settlement
  and ownership accurately. The file is 173 lines and has no unsafe casts.

## Findings and verification

The initial new regression checked only whether its fiber failed. The reviewer
requested an assertion that the original body Error survives interruption, and
an independent fixture completion while the first fixture remains blocked. Both
were added. The final regression uses explicit Promise gates rather than sleeps:
it requests interruption, completes and releases a second distinct fixture,
reads the still-live first fixture, permits its native write to settle, throws
the original Error, joins the fiber, checks that Error as a Die reason, and
checks the first fixture has been removed. No review finding remains open.

The reviewer inspected `/tmp/relkit-effect-compiler-fixture-final-tests.log`:
Bun 1.3.10 passed four tests with sixteen assertions in 5.75 seconds. The original
cases took 1,824.42 ms, 2,781.95 ms and 685.49 ms; the new ownership regression
took 19.35 ms. The author also reported exit 0 for strict compilation of the
actual test file using strict, exactOptionalPropertyTypes and
noUncheckedIndexedAccess, and exit 0 for the final formatting check. The strict
log `/tmp/relkit-effect-compiler-fixture-types.log` contained no diagnostics.
The reviewer ran no duplicate heavy test process.

## Reference evidence

Installed `effect` is 4.0.1. Its `src/internal/effect.ts` at 1083–1123 shows
Promise wrappers observe settlement; at 1144–1173 logical interruption marks
the callback resumed and may abort a supplied signal, without joining arbitrary
native work. Lines 4396–4408 show `acquireUseRelease` masks acquisition and
release while restoring use. Lines 5751–5781 show `runPromise` observes the
fiber exit and squashes failure evidence at the Promise edge.

The documented resource example and lifetime contract were inspected in
installed `src/Effect.ts` at 13111–13189. Version-matched upstream tests cached
at `/tmp/relkit-effect-4.0.1-Effect.test.ts` at 317–398, 657–663, 2254–2308
and 2915–3007 cover bracket release, native signal limitations, inherited
interruption masks, and combined usage/release failures. The read-only vendor
checkout at `/Users/mustafaelsayed/Workspace/relkit/repos/effect` lacks these
core implementation/test files, its `.agents/AGENTS.md` and its `LLMS.md`.
No vendor file was changed or installed. CodeGraph was attempted and reported
that this candidate has no usable index; ordinary source reads followed.
