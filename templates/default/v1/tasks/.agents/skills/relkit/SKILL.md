---
name: relkit
description: Build or extend a RELKIT CLI-generated application using its installed scaffolding and project commands. Use for application config, environments, services, functions, routes, auth, database, jobs, providers, and related app work.
---

# Work in a RELKIT application

Run commands from the generated application's root, where `relkit.config.ts` and `package.json` live. Use `bun run relkit` to invoke the project's installed CLI. Check `bun run relkit <command> --help` before relying on an option, especially after a dependency upgrade.

## Understand the requested work

Infer the intent from the request; do not ask the user to classify it.

- For a feature, establish the problem, scope, expected behavior and acceptance criteria. Explain a short implementation and verification plan before editing, then proceed with the authorized work.
- For a bug, establish expected versus actual behavior, attempt reproduction, and trace the affected execution path. Distinguish a confirmed cause from a hypothesis, and explain the proposed fix and verification before editing. Report unavailable reproduction honestly.
- For a discussion, explain options, tradeoffs and a recommendation without changing files. For mixed requests, keep the discussion portion read-only and implement only the requested work.

Before scaffolding a new app, establish the database engine and driver (or an explicit no-database choice) and whether authentication is needed. Ask missing choices together before writing files. Reuse supplied choices and existing project decisions; do not restart onboarding for an unrelated bug or small change. If requested auth needs persistence but the user chose no database, explain and resolve that conflict before scaffolding. Use supported create/add options; do not invent database/auth creation flags or change headless defaults.

Recommend optional modules only when they solve a concrete part of this task: for example, realtime for live order status or a bucket for uploads. Explain the benefit and ask for a selection when the capability was not requested. For an explicitly requested capability, resolve only missing provider/configuration decisions. Check installed CLI help and declarations for support; explain unavailable options before editing. A plan is not another permission gate for work already authorized.

Default to backend work. Do not introduce frontend pages, app.js, assets.css or demo interfaces unless requested. Preserve existing frontend files, explicitly selected fullstack functionality and the framework Inspector. For users and orders, define separate resource endpoints with explicit input/output contracts, validation and applicable authorization; avoid a public table dispatcher controlled by an entity parameter. Internal tables and infrastructure services need no public endpoint. Preserve intentional protocol handlers such as the Better Auth mount and shared internal helpers.

## Source placement

New projects place every generic, database, and auth boundary at `src/services/<name>/service.ts`. Keep its functions, events, tasks, jobs, tools, agents, channels, schemas, resources, helpers, and assets under that service. Routes live at `src/routes`; configuration support and environment contracts live at `src/platform`. Application descriptors use plain TypeScript and supported public APIs; Effect imports are not required.

Existing flat projects with `src/<name>/service.ts` remain supported. `relkit add` preserves the detected layout; empty projects default to grouped. Never mix flat and grouped boundaries or add an aggregate `src/services/service.ts`. Across services and from routes, import only the destination's `service.ts`; Platform cannot import services or Routes. Ordinary helpers do not become independently discovered descriptors.

Read [layout migration](references/layout-migration.md) before moving an existing app. Keep logical IDs, exposure, provider profiles, and durable contract versions stable during a source-only move.

## Add application artifacts

Inspect the existing `src/` tree and `relkit.config.ts` before scaffolding. Prefer `relkit add` for supported artifacts, then edit the generated source for the required behavior. An interactive terminal can prompt for missing choices; scripts and noninteractive runs should provide the kind, name, service, route mode, and mappings explicitly.

Read [the CLI reference](references/cli.md) for commands and option patterns covering services, functions, routes, auth, database, and the other add kinds.

## Authoring API references

Read only the reference relevant to the requested change. These examples describe the template's public APIs; check the installed package's TypeScript declarations when an exact option or signature matters.

- [Application configuration and environments](references/config-environments.md)
- [Functions, services, events, and errors](references/domain-apis.md)
- [HTTP routes and request policy](references/http-apis.md)
- [Streaming responses](references/streaming-apis.md)
- [Tasks and jobs](references/jobs-apis.md)
- [Agents, tools, and prompts](references/agent-apis.md)
- [Database, auth, cache, and storage](references/data-apis.md)
- [Realtime channels](references/realtime-apis.md)
- [Observability and tracing](references/observability-apis.md)
- [Testing functions, routes, and providers](references/testing-apis.md)

## Working conventions

- Generic domain services own callable functions and public event contracts. Other domains and routes should import a service's public members through its `service.ts`.
- A service route maps HTTP methods to existing public callable members. A raw route is a standalone handler. The CLI will not overwrite an existing route file.
- Database and auth are singletons under `src/services/database` and `src/services/auth`; extend an existing one instead of creating another. Auth may create a database baseline if none exists. Scaffolding does not run migrations, create secrets, or provision cloud resources.
- Preserve existing application configuration, environment fields, service members, routes, and user changes when specializing generated files.

## Verify the result

Review the CLI's created and updated files, warnings, next steps and final diff. Run focused checks after logical changes. Before completion, run applicable check, typecheck, build, unit/integration tests and existing relevant end-to-end coverage. Inspect package.json for actual script names. For HTTP work, test the route's status/body, valid and invalid input, and denied and allowed access where relevant; a direct function test does not cover request mapping or the complete flow. Replay the original bug through the boundary that failed. Backend/API tests do not require an unsolicited frontend.

Database/auth changes also need explicit environment setup and migration steps from [the data reference](references/data-apis.md), followed by persistence/session/authorization verification. Stop all test-owned servers and clients. Report what changed, exact verification performed, and every failed, skipped or blocked check with its effect on confidence. Written code or passing unit tests alone is not fully verified delivery when affected runtime behavior remains untested.
