# Tasks

Implementation: GPT-6.1 Sol. Checkboxes track completed implementation and evidence. No commit, push, release, deployment or automatic migration of user databases is included.

Final scope decision (2026-10-18): the user explicitly directed completion of the full change while retaining the Drizzle patch as-is. Section 2 now verifies preservation and portable patched acceptance, replacing its former removal tasks. This is a scope revision, not a claim that rejected unpatched tuples pass. All other acceptance remains required. Run heavy work serially, waiting for resource headroom rather than ending the task at each checkpoint.

Earlier reports in `evidence/independent-verification.md` and `evidence/acceptance-verification.md` are historical checkpoints. Their patch-removal blockers are superseded by the final scope decision; their incomplete runtime/packaging checks still require completion.

Final acceptance (2026-10-18): see `evidence/final-verification.md` and its exact command/result records. Both packed entrypoints and SQLite auth flows passed 49 commands against 53 archives identical to certification. Real PostgreSQL/MySQL migration and auth checks, corrected guidance fixtures, production frontend/browser acceptance, scoped source gates, and 20 fresh plus 20 restart measurements passed. Final native-process inventory and temporary-file cleanup are complete. Historical resource/setup failures remain recorded separately.

## 1. Establish the implementation baseline

- [x] 1.1 Re-read the proposal, design, both delta specs, current AGENTS.md/RTK guidance, affected subtree instructions, and relevant skills; record current revision, dirty-file boundaries, affected template/skill/sample inventory, and requirement-to-task evidence mapping. Read konsistent guidance before structural edits and the Effect skill/reference sources before any Effect implementation, including generator changes.
- [x] 1.2 Audit every Drizzle patch hunk and trace creation/add injection, catalog hashes, package assets, and lockfile registrations; deliver a compatibility matrix with exact dependency versions and a reproduction/check for each distinct failure class.
- [x] 1.3 Record CPU capacity/load, available memory, and memory pressure before heavy work; choose bounded single-worker commands and isolated test resources, and verify the process/resource inventory supports later owned cleanup.

## 2. Preserve and verify the current Drizzle repair

- [x] 2.1 Preserve exact ORM/Kit/Effect pins, all Drizzle patch bytes, registrations and strict compiler settings; retain rejected unpatched-version evidence without claiming removal or upstream compatibility.
- [x] 2.2 Verify the retained patched declaration classes and database/auth contracts without new type suppression, hidden repair or integration redesign.
- [x] 2.3 Verify authoritative catalog/sync-release idempotency and unchanged lockfiles/versions; prove clean/frozen standalone installation using only the explicit repair extracted from candidate generator assets.
- [x] 2.4 Verify portable repair generation/add/package assets, unrelated-registration preservation, collision handling and transaction rollback with existing focused tests; remove no patch machinery.
- [x] 2.5 Document retained exact versions/patch hash and verify the actual packed consumer path, unchanged current history, no-op rerun and subsequent migration without format conversion or reset.

## 3. Centralize migration execution

- [x] 3.1 Implement the relkit db migrate parser/dispatcher and packaged finite worker with --config and default drizzle.config.ts, using existing invocation ownership; verify help does not evaluate config and missing/unsupported configuration or missing history fails before opening a database.
- [x] 3.2 Move SQLite execution into RELKIT tooling using the consumer-compatible native migrator and authoritative config values; test nested/absolute config paths, config-vs-env target disagreement, output/log overrides, dotenv precedence, empty/in-memory targets, foreign keys, 5000 ms busy timeout, no-op rerun, and cleanup without a Node-only driver.
- [x] 3.3 Delegate PostgreSQL/MySQL through consumer-installed Drizzle tooling under Bun with the same cwd/environment and explicit config; verify both dialects, paths with spaces, a failed migration, and absence of implicit package downloads or workspace resolution.
- [x] 3.4 Add command metadata, completion coverage, and source documentation; regenerate affected CLI reference output through existing tooling and verify the documented commands and output/exit conventions agree with the implementation.
- [x] 3.5 Test JSON output with noisy config/tool diagnostics, errors containing credentials, and cancellation during an active owned worker/child; verify one secret-safe JSON result, exit 0/2/1/130 as appropriate, completed cleanup before success, and no automatic SQL retry or unsupported rollback claim.
- [x] 3.6 Test lazy consumer dependency resolution and package the worker through existing build/listing machinery; verify no-database CLI help/check/dev without ORM/Kit and actual packed db:migrate execution without copied scripts or repository-relative assets.

## 4. Update generated ownership and repository samples

- [x] 4.1 Derive migration output from the selected database service directory, retain explicit root configuration, and emit db:generate/db:migrate scripts targeting installed tools; verify database-only, auth-created database, and auth reusing an existing database for SQLite/PostgreSQL/MySQL, preserving existing schema/history and avoiding a second singleton or copied runner.
- [x] 4.2 Replace partial framework-output ignores with .relkit/ across applicable templates and remove migration-history ignores from scaffolding; test actual generated Git ignore behavior for a new .relkit subdirectory, SQL, required metadata, secret files, and local database files.
- [x] 4.3 Update affected repository samples directly while preserving SQL/metadata bytes, order, identifiers, and applied-log state; compare recorded hashes/log rows and prove a no-op migration after the move, using a disposable applied-history fixture where samples have no persisted history.
- [x] 4.4 Extend existing sqlite-app-tooling/add acceptance tests and replace hard-coded ORM/Kit store versions with catalog-derived fixture resolution; verify backend-only output, preserved explicit fullstack output, and accurate next steps, with no SQL applied, secrets generated, or database opened by scaffolding.
- [x] 4.5 Update sample READMEs and database/auth/placement guidance to show tracked service-owned history and shared tooling; execute the documented generation and migration workflow without adding legacy upgrade machinery.

## 5. Refine and evaluate application guidance

- [x] 5.1 Extend the shipped skill's existing workflow for feature, bug, discussion, and mixed requests, including plan-before-editing and evidence-based diagnosis; verify representative transcripts distinguish hypotheses from confirmed causes and leave discussion-only fixtures unchanged.
- [x] 5.2 Add contextual database/auth onboarding and relevant optional-module recommendations with installed-version checks; evaluate missing choices together, supplied choices, explicit no-database, auth/persistence conflicts, unrelated small changes, optional suggestions, and already-requested capabilities without redundant permission prompts.
- [x] 5.3 Add backend-only and resource-specific endpoint guidance while preserving explicit frontend work, auth protocol handlers, infrastructure privacy, service ownership, and route placement; evaluate users/orders requests, internal services, existing frontend files, and explicit fullstack requests against a concrete file/route rubric.
- [x] 5.4 Extend verification/completion guidance to include diff review, applicable checks/typecheck/build/tests, relevant existing end-to-end coverage, original bug replay, and honest failed/skipped/blocked reporting; evaluate a route bug and a partially verified task to prove function-only success is not reported as full completion.
- [x] 5.5 Synchronize maintained minimal/api/agent/fullstack/tasks skill trees and relevant repository-owned references; run parity/link/packaging checks and the minimum scenario matrix in design.md against the shipped skill using disposable fixtures. Record prompts, model/version, response/file evidence, and rubric results; leave behavior acceptance open if live evaluation is unavailable rather than inventing transcripts or a new evaluation platform.
- [x] 5.6 Add the experimental-status note to root AGENTS.md and align affected contributor guidance; review the diff to confirm direct sample updates are allowed without authorizing data deletion, new legacy compatibility layers, or unrelated global skill changes.

## 6. Complete integrated acceptance and evidence

- [x] 6.1 Run focused generator/CLI/package/docs tests, including sqlite-app-tooling, add-transaction, sync-release, and release-check-listing, plus applicable check/typecheck/build gates with bounded resources; record exact commands/results and replay patch-related failures against the final candidate without treating workspace-linked tests as packed proof.
- [x] 6.2 Use the existing candidate registry/packing harness for both create entrypoints outside the monorepo; record installed candidate hashes and prove clean/frozen installation, check/typecheck/test/build/start and expected HTTP responses for no-database, database-add, auth-chained, and existing-database-auth flows. Exclude accidental published-version fallback, source symlinks, inherited repairs, and copied runners.
- [x] 6.3 Exercise SQLite/PostgreSQL/MySQL sequentially; verify persisted business rows, signup/sign-in/session cookies, denied and allowed protected-route access, current-version applied history, candidate fresh history, a subsequent migration, and repeat-run schema/data/log invariance. Unavailable dialect infrastructure keeps acceptance blocked.
- [x] 6.4 Check files/skills/ignore behavior across all maintained templates via the internal candidate harness where needed, then regenerate affected identities and current packed/readiness evidence from final bytes for admitted public tuples; verify no gate bypass, new tuple promotion, threshold changes, historical relabeling, or edits to the separate readiness change.
- [x] 6.5 Review the final diff and run strict OpenSpec validation; deliver a verification report mapping every delta requirement to its tasks and exact evidence, separately identifying local checks, packed behavior, and model evaluations. Keep failed/skipped/blocked required tasks open and report limitations before declaring completion.
- [x] 6.6 Stop all owned test servers, subprocesses, browsers, and infrastructure; verify against the recorded ownership inventory that no task-owned process remains and unrelated user services were preserved.
