# Historical verification checkpoints

These are retained intermediate observations. See [current acceptance](stage-2.md).

## Verification observed

- Original configuration regression run: 14 failures against the old behavior.
- Original doctor selection regression run: three failures against UI-port probing.
- Focused Vitest run: 83 tests passed across 16 files, covering all application
  tests, compiler configuration/alignment/inspection tests, doctor selection, and
  existing optional HTTP transport protections. This includes real HTTP dispatch
  for disabled/production rich routes and independently available core routes.
- `bun test packages/cli/dev-inspector-installation.test.ts packages/cli/doctor.test.ts`:
  five tests passed.
- At this initial configuration checkpoint, the CLI build still packaged its
  legacy Inspector. Subsequent ownership changes above remove that producer.
- `bun x tsc -b --pretty false`: passed.
- `bun run check`: passed after correcting a test-only app-to-compiler relative
  import by placing compiler assertions under their own package.
- `bun run scripts/package-create-relkit-templates.ts`: passed.

The final focused rerun after the runtime-metadata extraction passed all 83
tests. Its log is `/tmp/relkit-s2-config-20261023-01a1663e/focused.log`; the final
five-case CLI rerun and lint logs are in that same directory. TypeScript project
build, boundary validation, `konsistent -- validate`, formatting of the changed
files, whitespace validation and strict OpenSpec validation pass. The AST-based
review found zero authored `any`/`unknown` types or file/function size violations
across the 35 changed TypeScript files. These source checks do not substitute
for the remaining runtime acceptance.

`bun run test:generator` **failed** at
`creation capability evidence > pins the certified source template bytes`:
recorded digest `c9604a3cc86e4f7cce3b2fcaf23f9fb8d645cf0e1b9932f3ff6fdaa34238aefc`,
current source digest `08268b1d74422aa05a86cfcb03dcf3b11a62874223d6fd45982a76bcb8dc6f4c`.
The Effect-service cohort had 22 passes and this one failure; the umbrella did
not run its later cohorts. Full failed output is retained as `generator.log` in
the directory above. The existing certification and historical readiness reports
were not rewritten. Fresh/restart packed template evidence must be reproved and
the existing `scripts/certify-create.ts` producer used before this gate closes;
changing the expected digest alone would not establish that evidence.

Intermediate TypeScript diagnostics from schema value/type export naming and a
missing telemetry-operation label were corrected before the final passing build.
The original failing configuration/doctor tests and cross-package test boundary
failure remain recorded above; no earlier failure is represented as a pass.

## Remaining acceptance obligations

Independent tool distribution, complete discovery/security fault coverage,
inspector-owned history/replay/limits, Docker distribution, complete docs/release
reconciliation, external packed measurements and final gates remain pending.
No acceptance checkbox is closed on the strength of the focused checkpoint alone.

Prepared receipts now carry validated bridge configuration and no UI port or
session credentials. Generated rich registration requires explicit development
selection and the runtime session credential; production emission omits it.
The focused real production proof closes S2.1 task 11.2; the final packed
production matrix remains part of S2.8.

Required browser/Docker/external-consumer and whole-repository acceptance remain
incomplete. Scoped native results above do not close them. Final consumer-policy
exceptions have not yet been reconciled across the complete final fixture matrix;
no package/image has been published, and no cloud work or Git mutation was run.
The unrelated concurrent root `AGENTS.md` addition is preserved.

The browser owner now starts the actual standalone package and its own DuckDB
collector instead of a direct Next dev server. The first run failed because its
new fixture entry imported an undeclared platform adapter; the entry now uses
the existing root Effect boundary. The second run passed resource previews,
cache and graph assertions, then exposed agent RPC controls missing the bridge's
generation fence (`409 generation.stale`). Responses now identify their serving
generation and the native client carries that observed ID. Twelve bridge
security cases and three UI generation cases pass; the rebuilt UI browser rerun
is ongoing. Logs retain both failures (`standalone-browser-1.log`,
`standalone-browser-2.log`) and the focused RED/GREEN regression. A manual browser
diagnostic initially used the global CLI version; subsequent commands use the
repository's installed CLI, and only the owned session was closed.

React source review followed the repository React guidance. React Doctor is not
installed locally, so its scan was not run; no package was downloaded for it.

## Source guidance

The implementation uses the required `use-effect` guidance and owning package
conventions. Shared configuration decoding is a pure Result boundary; application
normalization and doctor workflows retain named Effect operations. Public sample
descriptors remain ordinary TypeScript. The initial configuration files passed
the 200-line and function-size review. The new runtime files still require
formatting and the same per-file review; the initial review does not close the
whole-stage obligation.

The read-only Effect checkout lacks the core `Schema.ts`, `Effect.ts`, `Data.ts`
and `Result.ts` files used here and has no `.agents/AGENTS.md` or `LLMS.md`.
Available vendor schema compiler tests were inspected. Installed Effect 4.0.1
implementation and embedded examples govern decoder, Result, tagged-error and
`Effect.fromResult` compatibility. No reference checkout or dependency pin changed.
