# Tasks

> Fix groups (3 and later) are added by task 2.3 from the baseline report. A box is checked only after the verification named in its task has run.

## 1. Baseline audit on the published 0.9.0 packages

- [x] 1.1 Prepare two clean worktrees of the application (npm install, Bun install), each with its own database, port and environment file; verify each install completes and record what each package manager did with the patched dependency.
- [x] 1.2 Write the request harness (authentication, 25 routes by actor, declared errors, validation edges, full create/read/update/delete lifecycles, event reaction, realtime channel, signed-URL upload, system routes); verify it runs on Node and on Bun and writes one JSON line per request plus a summary.
- [x] 1.3 Run the harness in the npm environment and in the Bun environment; verify both summaries exist and every failed row keeps its request, response and request id.
- [x] 1.4 Run the command surface in both environments (install, check, typecheck, migrate, dev with reload and clean stop, graph, build, start, inspector, unit and integration tests); verify output, exit code and duration are recorded for each.
- [x] 1.5 Walk every Inspector page against the harness traffic, launched under npm and under Bun; verify each page has a verdict (correct, wrong, missing, ambiguous) with a screenshot and any console or network error.

## 2. Report and triage

- [ ] 2.1 Trace every failure to its cause in source and classify it (RelKit, Inspector, application, documentation, by design); verify a sample of each class by re-running it.
- [x] 2.2 Write `evidence/baseline-report.md` with the RelKit list and the Inspector list, each finding with id, environment, reproduction, expected and actual result, cause and severity; verify it contains no machine paths.
- [ ] 2.3 Add one task group per file-ownership area and one spec delta per affected capability, update the proposal's change list; verify `openspec validate fix-logistics-audit-findings --strict` passes.
