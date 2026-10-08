# Contributor launcher implementation

Author: /root/native_gate. Status: frozen for independent root review.
Scope: all contributor launcher entrypoints and narrow new helpers, 18 changed
TypeScript files including the supporting historical workspace acceptance test
and the borrowed
signal reason regression. Executable and local outer numeric-result owners also
receive the existing JSON/stderr cleanup-presentation policy.

ContributorWorkspace captures CliFileSystem, GeneratorPaths and CliProcess.
Schema validates owned manifest/creation fields while retaining unrelated JSON.
Canonical catalog resolution is consumed through create-relkit's portable public
export. Four independent manifest reads run concurrently; finite traversal owns
private Ref state, handles cycles and discovers fresh state on every request.
Link writes and registrations retain order and full stdout/stderr. CLI inspector
web dependencies remain application-local; stale links use concrete package-owned
catalog metadata.

ContributorTerminal owns one native process group under acquireRelease. Terminal
streams stay borrowed. Cancellation signals the group, waits five seconds,
escalates to SIGKILL, and reaps with a second five-second deadline. Each waiting
release restores interruptibility so Scope.close's mask does not disable the
deadline. Primary failures retain separate cleanup evidence. Native callbacks
retain physical settlement before their captured contributor graph is released.
Callback runners use shared captured-context execution without reacquiring graphs.
The CLI library index is now passive; src/bin.ts preserves executable routing.
No Cache/RcMap is warranted for fresh finite contributor discovery.

Applied use-effect and repository Effect guidance. Vendor core Scope/Ref/Effect
sources are absent; installed4.0.1 and exact upstream references were inspected
for acquireRelease, close mask, interruption, concurrency, Ref and timeout.
No vendor modifications. All new implementation leaves remain <=250 lines.
Checked public Layer example is included in the strict virtual consumer.

Verification:
- CLI no-emit typecheck passed; CLI tsc-b declaration/JS emit passed.
- 13/13 controlled Vitest tests: ordering, catalog propagation/failure, cycles,
  metadata, mismatch retention, no stale cache, four-read admission and physical
  callback cancellation; includes executed strict positive/negative compiler
  probes and environment-erasure mutation.
- Strict skipLibCheck:false compilation of all six test files passed, including
  the borrowed-signal cancellation regression.
- Three real Bun acceptance tests passed: complete captured output/nonzero status,
  ignoring parent plus descendant process-group termination, source executable
  version output and passive library import.
- Four focused existing native-link/doctor regressions passed.
- Prettier check passed.
- Logs: /tmp/relkit-contributor-{typecheck,build,tests,strict,native,baseline,format}.log.
- Final strict six-file log: /tmp/relkit-contributor-strict-final.log (exit 0).
- Native acceptance command: bun test ./packages/cli/tests/contributor/native.acceptance.ts.
  Initial direct bun execution and bare filename filter were runner-selection
  mistakes, corrected to the explicit Bun test path before successful acceptance.
- Full local add/install and interactive project acceptance belongs to combined
  coordinator gates; their stale concrete metadata/bin/removed prompt expectations
  were updated without changing separate Docker consent.

Independent supporting rereview accepted both root release bin guards:
scripts/release-check-support.ts and scripts/pack-and-smoke-exports.ts were read
through EOF after CLI bin changed to dist/bin.js.

| File | Classification |
| --- | --- |
| `packages/cli/src/bin.ts` | Effect domain/native compatibility edge |
| `packages/cli/src/contributor-callback.ts` | Effect domain/native compatibility edge |
| `packages/cli/src/contributor-launcher.ts` | Effect domain/native compatibility edge |
| `packages/cli/src/contributor-process.service.ts` | Effect domain/native compatibility edge |
| `packages/cli/src/contributor-process.types.ts` | pure Schema/type contract |
| `packages/cli/src/contributor-workspace.service.ts` | Effect domain/native compatibility edge |
| `packages/cli/src/contributor.schemas.ts` | pure Schema/type contract |
| `packages/cli/src/contributor.types.ts` | pure Schema/type contract |
| `packages/cli/src/index.ts` | pure barrel |
| `packages/cli/src/local-workspaces.ts` | Effect domain/native compatibility edge |
| `packages/cli/src/local.ts` | Effect domain/native compatibility edge |
| `packages/cli/tests/contributor/concurrency.test.ts` | controlled or native acceptance |
| `packages/cli/tests/contributor/domain.test.ts` | controlled or native acceptance |
| `packages/cli/tests/contributor/native.acceptance.ts` | controlled or native acceptance |
| `packages/cli/tests/contributor/type-probes.test.ts` | controlled or native acceptance |
| `packages/cli/tests/contributor/workspace.fixture.ts` | controlled or native acceptance |
| `tests/generator/local-workspace.test.ts` | controlled or native acceptance |
| `packages/cli/tests/contributor/cancellation.test.ts` | controlled borrowed-signal identity regression |
