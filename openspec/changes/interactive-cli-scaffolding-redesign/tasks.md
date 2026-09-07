## 1. Compiler and local provider foundations

- [x] 1.1 Add and unit-test exact inverse route-path generation for root, static, dynamic, required catch-all, and optional catch-all paths.
- [x] 1.2 Extend compiler source facts and tests to recognize callable function `.asTool()` declarations without changing graph or manifest formats.
- [x] 1.3 Export `localEvent()` and `localJob()` authoring adapters plus runtime registrations backed by existing durable local providers, with lifecycle tests.

## 2. Shared scaffolding core

- [x] 2.1 Add public `AddKind`, discriminated `AddRequest`, `ScaffoldPlan`, warning, verification, failure, and `AddResult` types to `create-relkit`.
- [x] 2.2 Implement and test friendly-name normalization, command option parsing/defaults, route maps, and stable failure codes.
- [x] 2.3 Implement canonical project discovery and byte-preserving edit planning for services, public members, events, tools, prompts, profiles, app configuration, and imported environment definitions.
- [x] 2.4 Implement conflict detection and snapshot-backed atomic application with injected install/check failures, exact rollback, `--no-install`, and unrelated dirty-file preservation tests.
- [x] 2.5 Add the synchronized first-party dependency/profile catalog and manifest drift test.

## 3. Artifact renderers

- [x] 3.1 Implement service, function, error, event, event-function, job, prompt, constants, and custom/full bundle renderers with coherent service edits.
- [x] 3.2 Implement cache and bucket renderers for discovered and supported Redis, S3, Cloudflare, Docker, connected, and eligible AWS profile sources.
- [x] 3.3 Implement derived tool and agent renderers with target, side-effect, approval, model, selected tools, service prompt, and inline instruction handling.
- [x] 3.4 Implement normal route, service route, middleware, and transform renderers with method/path/member collision validation.
- [x] 3.5 Implement dialect-specific Drizzle database and Better Auth composite renderers, including schemas, environment, dependencies, scripts, ignore rules, and route mount.
- [x] 3.6 Snapshot simple, custom, and full service bundles and verify their normalized graph relationships.

## 4. Interactive create and add CLI

- [x] 4.1 Add `@clack/prompts@1.7.0`, an injectable prompt driver, TTY/CI/JSON capability resolution, cancellation handling, previews, confirmations, notes, and finite-operation spinners.
- [x] 4.2 Route `create-relkit` and `relkit create` through the same interactive/headless resolver and staged add loop while preserving atomic publication.
- [x] 4.3 Add the complete Effect `relkit add <kind>` command tree, flags, help, completions, JSON isolation, result formatting, and exit-code mapping.
- [x] 4.4 Open a context-aware action menu for bare interactive `relkit` while retaining non-interactive root help and streaming logs for long-running commands.

## 5. Acceptance and documentation

- [x] 5.1 Run every add kind against all three templates and cover discovery ambiguity, all route shapes, method collisions, and all database/auth dialect combinations.
- [x] 5.2 Extend packed-artifact smoke tests for both create entrypoints, injected interactive choices, chained adds, and byte-identical normalized output.
- [x] 5.3 Update generated CLI reference, onboarding, add-command, database/auth, and local-provider documentation.
- [x] 5.4 Run focused CLI, compiler, local-provider, generator, integration, docs, typecheck, and guardrail suites, then run the full local verification suite and record honest evidence.
