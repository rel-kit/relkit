# CLI native implementation freeze

The CLI author lane is frozen across 102 client/deploy/local/dev files and 55 shared project/capability/execution files. The complete package matrix includes 378 authored TypeScript files and retains all 150 baseline files. `phase-3-cli-domain-files.json` and `phase-3-cli-shared-files.json` record current SHA-256 values, line counts and explicit classifications for these two exclusive review groups.

The native domain Services capture narrow filesystem/compiler/module/process/HTTP/consent/SDK/watch/telemetry contracts through live or test Layers. Public Promise and synchronous APIs retain their existing behavior. Clack remains the prompt implementation. Resource owners join native process groups, listener acquisition, queued compiler calls, source subscriptions and generation drains before release completes. Failed publication retains its original primary error alongside separate bounded cleanup evidence. Standalone operations use shared execution observation; ordinary command edges retain their existing quiet and JSON output channels.

Module and recipe caches remain session-local and success-only. Invalidation replaces the current Effect Cache instance: a controlled regression established that stable Effect 4.0.1 can otherwise let an older pending lookup overwrite a newer accepted value. Namespace validation retains the original dynamic import object and live bindings. No RcMap is introduced for these pure cached values.

Final author verification:

- `bun x vitest run packages/cli/tests/services`: 37 tests across 13 files passed, including controlled cache, activation/watch/listener races, physical cleanup, observation, strict composition and mutation probes.
- `bun x vitest run packages/cli/tests/services/process.test.ts`: 3 tests passed under Node-default Vitest.
- `bun x --bun vitest run packages/cli/tests/services/process.test.ts`: the same 3 tests passed under Bun 1.3.10. Normal stdout/stderr and nonzero status, output-limit primary failure with process-group reaping, and interruption-only Cause with parent/descendant disappearance all retain zero cleanup issues.
- The prior focused legacy domain run passed 46 tests and 269 assertions across 11 files.
- `bun x tsc -p packages/cli/tsconfig.json --noEmit --composite false --incremental false`: passed without emitting or mutating source.
- All 157 author-owned leaves pass Prettier; every named source callable and callable contract member has purpose, parameter and return documentation. Every implementation source stays at or below 250 lines.

The final documentation and format sweep preserves the comment-free TypeScript printer hashes in 101 of 102 domain files against the independent reviewer's pre-documentation snapshot. The sole changed test fixture uses the real SupervisorProxy instance with Object.assign so inherited members remain typed; the reviewer independently accepted it and reran its strict four-body compiler gate and two controlled tests.

Against the root reviewer's earlier shared snapshot, canonical AST comparison preserves semantics in 52 of 54 files. The two deliberate changes are the independently accepted owned Readable cancellation seam in process.service.ts and the independently accepted SourceWatch capability/composition additions in type-probes.test.ts. The new process.test.ts is independently reviewed as the 55th shared file. Canonical comparison ignores comments, formatting and redundant expression parentheses while retaining literal values, operators, modifiers and declaration authority.

Independent reviewers retain final acceptance authority. No task status is changed by this author receipt. Source, test, documentation and inventory writes stop after the explicit freeze notification so the coordinator can run mutation-sensitive repository verification.
