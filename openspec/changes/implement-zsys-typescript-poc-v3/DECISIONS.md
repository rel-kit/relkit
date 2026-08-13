# Decisions

## Iterator handoff correction

- Put the project discriminator inside `target`: `target: { type: "project", projectId, environment: { type: "local" } }`. A local same-directory task needs neither a worktree target nor `startingState`.
- Do not use `spawn_agent` or a project-local Cipay subagent when `create_thread` fails. Re-read the live schema, retry once with only `prompt` and `target`, then record a real blocker.
- Treat all earlier nested-worktree payloads and subagent fallbacks below as historical evidence, not current instructions.

## Task 2.12 decisions

- Keep checkbox `2.12` test-only: reuse the completed diagnostics model/reporter and add no dependency, redaction abstraction, or runtime behavior.
- Use one fixture with absolute source paths under the repository root and a second absolute root. Compare canonical JSON, human text, ANSI-colored text, and CI annotations so the goldens prove project-relative normalization and stable ordering.
- Keep the source excerpt callback in the test so snapshot generation remains deterministic and performs no hidden filesystem reads. Store the plain/color/CI text forms in one JSON golden so ANSI escapes remain portable and Prettier-checked.
- Treat CI annotations as the safe sink: snapshot only code, severity, message, and normalized location fields, and assert suggestion/documentation fields cannot carry the synthetic secret into the annotation.

## Task 2.11 decisions

- Reuse `@zsys/contracts` source-location, stable-ID, and canonical-JSON contracts instead of duplicating path or serialization rules. The diagnostics package therefore declares only that existing workspace dependency and keeps its public values plain TypeScript.
- Keep the public diagnostic shape flat (`file`, `line`, `column`, and `descriptorId`) to match the v3 compiler contract, while accepting a `location` input convenience and a `docs` alias that normalize to the stable `documentationPath` field.
- Normalize and deep-freeze diagnostics at construction; sort related locations and diagnostic collections by project-relative location/content so compiler discovery order cannot change JSON or human output. Source excerpts use a caller-provided relative-path callback, avoiding hidden filesystem reads in compiler, inspector, or CI adapters.
- Use canonical JSON for machine output and GitHub-compatible `notice`/`warning`/`error` annotations for CI. Durable text/JSON snapshots and secret-sink scans remain checkbox `2.12` scope; the focused assertion is sufficient for this non-trivial implementation unit.

## Task 2.10 decisions

- Keep checkbox `2.10` test-only: reuse `@zsys/config`'s existing `defineEnv`, `resolveEnv`, and `projectEnv` seams rather than changing the verified 2.9 resolver or private Effect adapter.
- Store the durable environment contract evidence under `tests/config`: one focused suite, one value-free declaration fixture, and one JSON projection golden. The golden contains metadata only; recursive assertions also scan definition metadata, projection, and serialized snapshots for synthetic secret content.
- Observe declaration purity with explicit `process.env` and `Bun.file` guards plus a narrow source check for process/file APIs. This proves the declaration call is value-free without adding a filesystem/process abstraction or runtime instrumentation to the package.
- No project-local Cipay subagent was used because no callable `multi_agent_v1`/Cipay tool was exposed in this fallback context; the bounded test scope was small enough to complete locally.
- Historical handoff note: the prior worker did not implement checkbox `2.11` because the earlier saved-project/local `create_thread` attempts returned `create_thread received invalid arguments`; the corrected project-target dispatch above is now the authoritative lifecycle path.

- Task `2.9` keeps runtime environment resolution plain and synchronous at its public contract boundary; `resolve.ts` owns parsing, validation, immutable output, and safe projection while `packages/config/src/internal/config.ts` is the only Effect adapter. This lets later runtime code use Effect internally without leaking Effect types or APIs through `@zsys/config`.
- Pin `effect` to `4.0.0-beta.107` because it matches the vendored reference APIs and the worker's verified dependency resolution. The vendored `repos/effect` tree remains reference-only and unmodified.
- The completed 2.9 fallback worker `019ff827-4223-70f1-aff2-cf967768e755` owned only implementation files and the package/lockfile dependency update; the coordinator owns task/lifecycle state and did not widen the unit into task `2.10` tests.
- The normal `create_thread` connector rejected both documented checkbox `2.10` payloads, so the iterator used the required same-checkout `multi_agent_v1` fallback `019ffada-adf6-7343-9c45-10fd3f500bd8` with `fork_context=false`; its single bounded 10-second wait timed out without a reported blocker. This is a lifecycle/tool limitation, not a product decision or implementation blocker.

- Task `2.8` keeps declaration-time environment work dependency-free and side-effect-free. `env.ts` owns the builder DSL, `env-types.ts` owns public type declarations, and `env-json.ts` owns recursive JSON-safe example/value conversion so every implementation file stays under 200 lines; `index.ts` re-exports the documented `@zsys/config` surface.
- Builder metadata is immutable and graph-safe: it records type, required environments, optional/default presence, sensitivity, literal values, descriptions, and safe examples, but never resolved values or default contents. Secret examples use `[redacted]`; default factories remain closures and are not evaluated by `defineEnv`.
- The 2.8 worker implemented locally because no callable project-task or multi-agent connector was exposed. It did not implement 2.9 or later work and alone updated `tasks.md`, `PROGRESS.md`, `DECISIONS.md`, and `BLOCKERS.md`.

- Use `fix/implement-zsys-typescript-poc-v3` in the normal checkout so progress remains visible. Preserve existing planning-artifact edits and the supplied iterator skill; do not stage or commit.
- Middleware is function-backed metadata only: `defineMiddleware` stores a stable ref, normal target function, serializable request mapping, and route-declared continue/respond decision. It never owns a handler or exposes a framework context.
- Route transforms are named stable IDs bound to Standard Schema-compatible validators/transforms. The graph stores only ID and deterministic schema projections; executable validators belong in the hash-matched manifest. Duplicate, missing, or unsupported deterministic transforms are compile errors.
- Environment declarations remain value-free. Evaluation records rules, metadata, sensitivity, and typed `EnvRef` tokens; generation startup resolves values only after immutable validation. Public contracts expose plain values/types/Promises, not Effect types.
- Providers are selected globally per environment and logical profile. Graph metadata contains only safe capability/profile data and non-secret variable names; generation-scoped executable recipes construct one provider set and release it in reverse order.
- Cache topology is local opaque state for development/tests and ElastiCache Serverless for Valkey in AWS, accessed through Bun's native `RedisClient`; canonical JSON keys and generation-local single-flight are required, with no extra Redis SDK/dependency.
- Model execution uses the v3 OpenAI logical profile through a small secret-safe `fetch` adapter owned by `packages/cloud-aws`; no model vendor SDK or public provider-client type is added.
- Iterator boundaries are one fresh same-directory task per checkbox, using Luna at max reasoning when available. Phase gates require a committed candidate, clean review checkout, reproducible evidence, and merged prerequisite; missing Git publication authority is a gate blocker, not a reason to weaken the rule.
- Linear lifecycle hooks are skipped because this repository has no `openspec/linear.yaml` or configured binding. No Linear write is authorized or required for this run.
- Task `1.1` is inventory-only: retain the starter files and all user/planning edits, defer Konsistent configuration until the complete Phase 0 shell cohort exists, and make no implementation or normative-document changes.
- The existing starter checks (`bun run lint`, `bun run check-types`, and `bun run build`) are the baseline evidence for this preflight; later Phase 0 checks must replace the starter scripts and update `AGENTS.md` in the same phase.
- Task `1.2` removes only the five inventoried starter roots after confirming they had no dirty or untracked user files. Their ignored `.next`, `.turbo`, and package-local install links were disposable generated outputs and were removed with those roots; no unrelated path was touched.
- Git cannot represent empty directories, so each requested Phase 0 root is represented by one empty `.gitkeep`; no package manifest, runtime code, or root tooling was added ahead of its owning task.
- The iterator profile set is intentionally minimal: `cipay-implementation.toml` for bounded implementation work, `cipay-branch-review.toml` for the required read-only gate review, and `cipay-db-ledger-engineer.toml` for the iterator's explicit database-migration safety rule. No other project-local profiles were invented.
- Bootstrap delegation was unavailable at task `1.2` start because the project-local profile directory did not exist. The worker created the profiles directly as the task's requested output and used no subagent for this trivial, disjoint filesystem replacement.
- Task `1.3` pins the observed compatible root tool versions exactly: Bun and `@types/bun` `1.3.10`, TypeScript `5.9.2`, Turbo `2.10.9`, Prettier `3.9.6`, ESLint `9.39.5`, and Konsistent `1.0.0-beta.4`. Exact pins make the Phase 0 lockfile reproducible; no runtime dependency is added.
- Keep the root `dev` script as `turbo run dev`, the actual available workspace dispatcher, until the later package/CLI tasks own ZSys supervisor behavior. With no package shells yet, a successful zero-task dispatch is the truthful Phase 0 result; no fake server or placeholder runtime was added.
- Use a minimal root flat ESLint config for JavaScript configuration files and the existing Prettier binary/config. No parser/plugin dependency is added before a package owns TypeScript lint rules; later lint implementation remains task `1.11` scope.
- Keep the root TypeScript project reference list empty until package/app shells exist. The shared base already enforces `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax`; shell references are task `1.7` scope.
- Add the Konsistent dependency and root command now because task `1.3` owns required structural tooling, but defer `konsistent.json` and its evidence-based audit until the complete shell cohort exists in task `1.8`.
- The task `1.3` read-only profile review found no must-fix issues. Keep the TOML check separate from Prettier because the installed Prettier version has no TOML parser; `Bun.TOML.parse` is the focused syntax/configuration check.
- Task `1.4` uses one uniform public-shell manifest: `@zsys/<name>` at version `0.0.0`, ESM, a root-only `types`/`import` export to `src/index.ts`, and `build`/`check`/`typecheck` scripts backed by the shared TypeScript config. No package dependencies or runtime behavior are introduced.
- Each task `1.4` package contains exactly `package.json`, `tsconfig.json`, and `src/index.ts`; the entry is `export {};` so importing a shell has no registration, environment read, client construction, or other side effect. Build output remains ignored under each package's `dist/` directory.
- Adding the 12 workspace manifests necessarily updates `bun.lock`; the regenerated lockfile contains the new workspace package entries but no runtime dependency. The initial frozen install correctly rejected the pre-shell lockfile, and the regenerated lockfile passed frozen installation.
- A root-level package import smoke is deferred until a dependent workspace fixture exists because the root intentionally has no `@zsys/*` dependencies. Package-local self-reference imports pass, and deep `@zsys/*/src/*` imports are rejected by each shell's export map.
- Task `1.5` applies the same three-file shell convention to the 13 foundation/internal packages: `@zsys/<name>` version `0.0.0`, ESM, root-only `types`/`import` exports to `src/index.ts`, shared TypeScript config, and no dependencies or runtime behavior. This keeps internal ownership explicit without implementing task `1.6` or later package APIs.
- Task `1.5` stayed local because its package cohort is a uniform, trivial filesystem change with no independent specialist scope. Node's package resolver is the export-map smoke authority because Bun's source-workspace resolver permits an existing deep source path during evaluation.
- Task `1.6` reuses the three-file shell convention for `packages/{deploy,deploy-pulumi,cloud-aws,cli,create-zsys}`. The first four package names use `@zsys/<name>`; `create-zsys` remains unscoped because the approved `bunx create-zsys@latest` entry point depends on that published package name.
- Task `1.6` exposes `zsys` from `@zsys/cli` and `create-zsys` from `create-zsys` through manifest `bin` entries pointing at the existing side-effect-free `src/index.ts`. No command implementation, runtime dependency, extra source file, or task `1.7` configuration was added.
- Task `1.6` stayed local because its five package shells are a trivial, uniform filesystem change with no independent specialist scope. Node's package resolver remains the export-map smoke authority for package-local entry imports and deep-source rejection.
- Task `1.7` keeps the four strict options in the shared base and adds one root TypeScript project reference for each app/package. The empty app roots receive only `files: []` configs extending that base; no app runtime or package export surface is introduced ahead of its owning task.
- Task `1.7` stayed local because the reference/configuration change is uniform and mechanically verifiable. The root graph intentionally has no cross-root relative imports; package export resolution and deep-source rejection remain task `1.8` scope.
- Task `1.8` changes every package's root-only export map from source targets to publishable `./dist/index.d.ts` and `./dist/index.js` targets. The two approved bin keys remain unchanged by name and now point at the built `./dist/index.js`; `create-zsys` remains the only unscoped package.
- The export smoke builds and packs `@zsys/app` and `@zsys/compiler`, installs the tarballs in a temporary directory outside the workspace, and uses Node's package resolver because Bun's workspace resolver can accept existing deep source paths. The root exports resolve; `src/index.ts` and `dist/index.js` subpaths fail through the root-only export map. No runtime implementation or extra package dependency was added.
- Konsistent evidence is recorded against the complete 30-package cohort: 30/30 package directories own the three shell files, and 30/30 package entries are pure side-effect-free barrel stubs with no parent/current value imports. The config enforces only those structural patterns; package names/bin fields were intentionally skipped because Konsistent does not inspect JSON. Validation passed and the audit result is reported independently; no post-audit rule weakening was made.
- Task `1.9` uses the installed TypeScript compiler API for import extraction and Bun's native globbing for root/workspace/template discovery. Regex-only source parsing and a new dependency were unnecessary; the parser covers static imports, re-exports, import-equals, dynamic imports, import types, and `require` calls.
- The checker scans `packages/*`, `apps/*`, `templates/*`, and root `scripts/**`; scripts use the root manifest, while app/template dependency declarations are enforced when their own manifest exists. `tests/**` is intentionally outside the ordinary scan because task `1.14` owns persistent negative fixtures that must be invoked as test inputs rather than fail every baseline run.
- Fixture/template imports use the v3 Section 6.2 public application packages as an allowlist for `@zsys/*`; raw Effect/Hono/Next/Pulumi/AWS SDK packages and all other ZSys implementation packages are rejected. Inspector rules allow its own Next.js dependency but reject application packages, the fixture package, and runtime/provider/deployment implementations.
- The parser/discovery helper is split from the CLI only to satisfy the repository's 200-line implementation limit; no reusable framework or configuration layer was introduced. Root verification wiring and permanent boundary fixture coverage remain tasks `1.11` and `1.14` respectively.
- Task `1.10` integrates the scope scan into the existing `scripts/check-boundaries.ts` entry point so the established boundary command cannot silently omit scope enforcement; no second root command or dependency was added.
- The scope scan uses the approved v3 Section 6 package/app/template roots and focused structural/API patterns rather than rejecting ordinary explanatory prose. Its explicit prose allowlist covers the current normative, planning, and historical documentation paths; the scope helper is excluded only from its own content scan to avoid self-matching rule vocabulary.
- Task `1.10` stayed local because the change is a small deterministic checker extension with no independent write scope. Transient negative files were used for validation and removed; persistent fixtures remain task `1.14`.
- Task `1.11` keeps verification in one 125-line `scripts/verify.ts`: current Phase 0 checks are real and ordered, while unavailable test/build suites are visible `NOT RUN` placeholders naming their future phase/task owners. This preserves truthful status without adding dependencies or speculative suite implementations.
- The verifier runs scoped Prettier over repository implementation/config roots, the currently configured ESLint file check, the combined dependency/scope checker, the repository-wide implementation-file ceiling for `apps`, `packages`, `scripts`, and `templates`, `konsistent validate`, the Konsistent audit as separately reported advisory output, root typecheck, and `git diff --check`.
- Full source lint remains a placeholder because Phase 0 has only the root flat ESLint configuration and no TypeScript lint implementation; the direct ESLint configuration check is the current runnable gate. Future suites retain their existing root command names and are not reported as tested.
- Task `1.11` stayed local because the driver has one shared write target and lifecycle artifacts require integration by the worker; no implementation subagent was needed after reading the matching Cipay profile.
- Task `1.12` uses one `quality` CI job with the exact Phase 0 install/typecheck/verify commands and Bun `1.3.10`. Future job names are omitted until their underlying checks exist; successful placeholder jobs would mislead reviewers about Phase 0 coverage.
- Task `1.13` records each approved architecture decision in its own sequential `ZSYS-ADR-001` through `ZSYS-ADR-007` file. The ADRs use `Accepted — reviewed Phase 0 baseline` because the v3 documents are already approved and the records document implementation constraints rather than propose new scope.
- Task `1.14` keeps guardrail coverage in one serial root Bun test with temporary isolated fixtures. This gives every negative boundary/scope case exact path and rule assertions without adding forbidden vocabulary to files scanned by the production scope checker.
- Task `1.14` reuses the existing packed export smoke and verification driver, extracting only the line-limit scan as an import-safe helper. The focused test is a real Phase 0 verify step; later suite placeholders remain unchanged and truthful.

## Task 1.15 ignore policy

- Use root-anchored, directory-specific `.zsys` patterns with trailing slashes so generated/build/runtime data is ignored without broad patterns that could hide checked-in fixtures, goldens, templates, or OpenSpec/review evidence.
- Verify the policy with `git check-ignore --no-index` in the existing Phase 0 guardrail suite; this tests Git's actual matching behavior without creating disposable files or changing tracked state.
- Skip project-local delegation because this is a minimal `.gitignore` plus one focused assertion in the existing test harness; no independent non-trivial scope exists.

## Task 1.16 clean verification

- Preserve the user's dirty worktree while proving a fresh dependency install. The shell safety policy rejected the literal `rm -rf node_modules`, so the exact disposable directory was moved to a recoverable `/tmp` path before `bun install --frozen-lockfile`; the required install/typecheck/verify results and final status capture remained unchanged.
- Treat the 11 later verification suites as not run because the Phase 0 verifier explicitly labels them with their future owners; do not turn placeholder output into Gate 0 evidence.

## Task 1.17 Gate 0 packet

- Keep the review packet in `PROGRESS.md` beside the durable lifecycle notes; no extra review-document format is needed for this evidence-only checkbox.
- Assign the design's package ownership groups to role owners rather than inventing individual names. The v3 sources provide responsibilities, while named release sign-off is a later gate concern.
- Describe `bun.lock` as tracked and frozen-install verified, while explicitly preserving the user's uncommitted checkout. The packet does not claim a commit or stage files.
- Revalidate the passed task 1.16 evidence with the focused Phase 0 guardrail test, typecheck, verify, package-list assertion, tool versions, and strict OpenSpec validation; keep the 11 future suites visibly `NOT RUN`.
- Task `1.18` accepted the Gate 0 rejection review only after the exact workspace, shell, command-alignment, lockfile, import-boundary, fixture, and deployment-engine checks all passed; no implementation change was needed.
- After the task `2.1` prerequisite review passed, dispatch checkbox `2.2` to fallback worker `019ff783-7acd-7453-84be-f41e75a970dd` because the saved-project `codex_app__create_thread` connector rejected its documented arguments. The coordinator made no Phase 1 implementation edits; the single bounded worker snapshot timed out without a result.
- Task `2.2` keeps the JSON boundary in one recursive serializer. `serializeJson` is the implementation and `canonicalJson` is only an alias to that same operation; guards reuse the serializer so validation and canonical output cannot disagree.
- Task `2.2` accepts only finite JSON primitives, ordinary dense arrays, and plain or null-prototype objects. It rejects symbols and accessors, rejects non-JSON object prototypes, tracks only the active recursion path so repeated acyclic references remain valid, and reports stable paths in `JsonValueError` messages.
- The saved-project `codex_app__create_thread` connector remains unavailable after its documented arguments were rejected, so this scoped fallback worker implemented checkbox `2.2` locally. No later checkbox was started or dispatched from this unit.

## Task 2.3 contracts

- Keep stable IDs explicit and path-independent: trim surrounding whitespace, accept only alphanumeric segments separated by `.`, `_`, or `-`, and expose nominal stable/protocol ID types plus typed descriptor refs. Case is preserved so normalization cannot silently merge distinct explicit IDs; style warnings remain a later compiler concern.
- Normalize source paths with a small platform-independent parser so POSIX and Windows separators produce the same project-relative `/` form. Absolute paths must be inside the supplied absolute root; relative paths remain relative and never contribute to identity.
- Use one-based positive integer source coordinates and stable error prefixes (`Invalid stable ID:` and `Invalid source location:`). The contracts barrel re-exports JSON, ID, source-location, and version modules because the package has a root-only export map.
- Set the initial contract, generator, graph, manifest, API, and shared protocol versions to numeric `1`; the v3 sources define these as versioned v1 protocols and do not specify independent later values.
- Keep task `2.3` local: the three files and one barrel are a small, tightly coupled public-contract edit with no independent specialist scope. Task `2.4` owns the durable test matrix.

## Task 2.4 contracts tests

- Keep the canonical contract matrix in `tests/contracts/canonical-contracts.test.ts`, the existing contracts test owner, and import through the contracts barrel so the supported public surface is exercised without adding package scripts or dependencies.
- Assert exact JSON and source/ID error strings at stable paths/prefixes. The invalid-value matrix covers the serializer's explicit JSON boundary rather than relying on native `JSON.stringify` behavior, including accessors, sparse arrays, symbols, cycles, and non-plain objects.
- The ID matrix exposed that the completed 2.3 regex accidentally accepted `:`. Remove that separator from `packages/contracts/src/id.ts`; this is the smallest correction needed for the already-recorded `.`, `_`, `-` grammar and does not expand 2.4 into new contract behavior.
- A project-local implementation subagent was attempted for the single test file, but subagent `019ff7b9-44b9-7ae3-a1ce-0175495af3ec` remained active across bounded waits without writing a file. Close it and complete the same bounded scope locally; lifecycle notes remain worker-owned.
- Preserve the known unscoped `bun test` limitation: the focused contracts suite and Phase 0 suite are the applicable checks while vendored Effect tests require upstream-only dependencies.

## Task 2.5 schema bridge and default builder

- Keep the Standard Schema boundary local and dependency-free. The repository has no installed schema runtime yet, and the v3 public contract only requires the `~standard` v1 shape plus the approved familiar builder; adding a vendor dependency would leak its types or expand the lockfile before a concrete need.
- Mirror the official v1 result/type vocabulary, including optional validator options, input/output type advertising, direct or structured path segments, and the `StandardSchemaV1` namespace aliases. Third-party validators are executed through the same `validate`/`validateSync` helpers and receive path prefixes when nested in a ZSys builder.
- Keep JSON Schema projection out of this unit. The builder intentionally does not invent a `zsys.jsonSchema` result; task `2.6` owns deterministic extraction and the structured unavailable outcome.
- Use a private implementation class behind the exported `Schema` interface. The root package exports plain schema types, `z`, and validation helpers, so no concrete implementation/vendor type is part of the supported authoring contract.
- Split the bridge/runtime and builder/composite helpers into implementation files only to satisfy the repository's 200-line ceiling. The supported package surface remains the root index; no deep source export was added.
- Preserve omission semantics for optional object properties and apply defaults during validation. Defaulting and transformation behavior are implementation support for the v3 examples; durable assertions/goldens remain task `2.7` scope.
- When the project-local subagent did not return a patch after several bounded waits, close it and complete the same non-overlapping scope locally. This avoids waiting indefinitely while preserving the iterator's single-worker file ownership.

## Task 2.6 JSON Schema projection

- Keep projection dependency-free and behind the existing `zsys.jsonSchema` compatibility hook. The repository has no schema vendor dependency, and adding one would expand the public boundary before a concrete runtime need.
- Store built-in projection metadata separately from validation behavior. This lets object/array/union composition preserve deterministic schemas and optional/default semantics without exposing the implementation class or changing the Standard Schema v1 surface.
- Canonicalize third-party and built-in output recursively by sorting object keys and set-like `required` names, while preserving ordered JSON Schema arrays such as `anyOf`/`enum`. `$defs` and `definitions` therefore remain stable without inventing references or deduplication.
- Return the stable `ZSYS_SCHEMA_UNAVAILABLE` code for absent hooks, invalid JSON Schema values, custom refinements, transforms, and non-deterministic default factories. Compiler/source-location diagnostics remain the compiler owner's responsibility.
- Keep task `2.7` responsible for durable schema tests and goldens; this unit leaves its test roots and fixtures untouched.

## Task 2.7 schema tests and goldens

- Keep the schema suite under `tests/schema` and import the official package through its existing public source barrel. The current shared Phase 0 checkout does not create workspace symlinks, and relying on ignored `dist` output would make the test gate depend on generated state.
- Use one third-party fixture with a deterministic `zsys.jsonSchema` hook and a separate compatible fixture without that hook. This proves both Standard Schema validation compatibility and the structured `ZSYS_SCHEMA_UNAVAILABLE` result without adding a schema dependency.
- Keep two JSON goldens: one combines built-in and third-party JSON Schema projections, and one captures sync/async validation, defaults, transforms, and nested issue paths. Comparing serialized parsed JSON preserves key and array order while the repository formatter owns human-readable layout.
- A project-local implementation subagent was attempted for the disjoint `tests/schema/**` scope, but `019ff7ee-3b80-7b63-b446-c384616fb2b2` remained active across three bounded waits without returning a patch and was closed; the worker completed the scope locally.

## Historical iterator connector workaround (superseded)

- Earlier workers used an invalid nested-worktree payload, misclassified the resulting argument errors as a connector outage, and substituted shared-checkout subagents. The iterator handoff correction at the top of this file replaces that workaround.

## Task 2.13 public declaration boundary

- Reuse the shared strict TypeScript declaration settings already inherited by every package. The scanner invokes incremental `tsc -b` for the four Phase 1 public packages so declaration emission is a checked prerequisite rather than relying on ignored, pre-existing `dist` output.
- Treat only declarations reachable from each package's exported `types` entry as public. Follow relative `.d.ts` references so re-exported types are covered while the unexported config adapter is not treated as application API.
- Match the exact forbidden internal symbols required by the v3 boundary (`Effect`, `Layer`, `Context.Tag`, `Schema.Schema`, `Fiber`, and `Cause`) and report project-relative locations. Keep the future `test:types` command reserved for Phase 2 type fixtures; the declaration scan is a distinct root verification step.

## Task 2.14 package documentation

- Keep the examples in the nearest public package READMEs rather than adding duplicate executable fixtures or dependencies. The existing focused tests remain the behavioral evidence for the APIs.
- Use `@zsys/schema` as the documented schema entry point, with `z`, Standard Schema validation, structured issues, and deterministic JSON Schema projection. Do not document internal schema implementations.
- Keep `@zsys/config` declaration and resolution visibly separate: `defineEnv` builds immutable metadata without runtime reads, `projectEnv` is safe metadata, and `resolveEnv` receives an explicit source inside startup code.
- The README snippets contain no process/file value reads or import-time resolution calls. Checkbox `2.15` owns the package-test and Gate 1 evidence run; this unit adds no implementation behavior.

## Task 2.15 Gate 1 evidence

- Keep this checkbox evidence-only. The exact assigned `bun test packages/contracts packages/schema packages/config packages/diagnostics` command was run unchanged and exits `1` because those package roots contain no test files; do not move tests or add package scripts here. The owning Phase 1 suites under `tests/{contracts,schema,config,diagnostics}` pass with 20 tests and 317 assertions.
- Treat the JSON Schema and diagnostic golden assertions as the behavioral evidence: the focused suite reports stable JSON Schema/validation output, cross-root diagnostic text/JSON, and safe CI annotations. Both staged and unstaged Git diffs for the four golden files are empty; the files are untracked in this intentionally uncommitted checkout, so their SHA-256 values are recorded in `PROGRESS.md` instead of claiming a tracked baseline diff.
- Reuse the existing public declaration scanner and its root verification wiring. `bun run scripts/check-public-declarations.ts` emits/scans the four Phase 1 public packages and passes without changing the public boundary. Gate 1 approval/rejection remains task `2.16` scope.

## Task 2.16 Gate 1 decision

- Keep the checkbox evidence-only: the focused Phase 1 roots are sufficient to inspect behavior, but they do not replace the exact Gate 1 reproduction command when that command exits `1` because its package filters match no test files.
- Do not move tests or add package-local scripts in this review. The test-discovery mismatch is a prerequisite follow-up, not permission to broaden the gate unit.
- Reject/hold Gate 1 until the candidate can be reproduced from a committed clean checkout. The current Phase 1 implementation and all four goldens are uncommitted, and the goldens are untracked; the user explicitly prohibited staging or committing here.
- The individual rejection checks pass: canonical JSON and JSON Schema are order-independent, diagnostic output is project-relative across roots, validation issues retain structured paths, secret defaults are absent from serializable metadata, declarations contain no forbidden Effect symbols, and public examples use `@zsys/schema`.
- Mark checkbox `2.16` complete as the review/decision unit while keeping Gate 1 unapproved and blocking `3.1`; no later-phase handoff is made.

## Gate 1 package-root test remediation

- Keep the durable suites under `tests/{contracts,schema,config,diagnostics}` and add one minimal forwarding test entrypoint in each owning package root. The mandated package-root command now discovers the existing suites, while the focused test-root command remains unchanged.
- Use imports rather than copied test files or package scripts: each command runs the same four suites once, avoids duplicate coverage, preserves the existing golden paths, and keeps package source exports unchanged.
- Include the four JSON Schema/diagnostic goldens in the candidate so a committed clean checkout reproduces the passing assertions. This remediation changes test discovery/tracking only; it does not approve Gate 1 or advance checkbox `3.1`.
