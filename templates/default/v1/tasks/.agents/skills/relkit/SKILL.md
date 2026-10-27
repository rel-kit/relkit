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

Inspection is disabled when omitted. To inspect development work, run
`bunx relkit add inspector`: it selects `inspector: { enabled: true }` (a private
bridge on `127.0.0.1:0`, configured through `inspector.connection.host/port`) and
installs `@relkit/inspector` as a devDependency. Then run `bun run inspector` (or
`bun run relkit inspector --port 3211` for UI port 3211; the default is 3210) in another
terminal. Keep dev and
Inspector as separate processes. Preserve `.relkit/observability`; the tool owns
its diagnostic DuckDB history. Production builds exclude rich inspection and do
not require UI/storage packages in the backend closure. See the observability
reference for runtimes, availability, private discovery and history ownership.

## Design domain ownership

Before scaffolding business behavior, identify its owning domain. For a request spanning multiple business capabilities, include a compact ownership map in the implementation plan: service name, owned rules/state, public operations/events, dependencies, and any transaction spanning capabilities. Then proceed with authorized implementation; the map is not another approval gate.

A domain service owns one cohesive business responsibility and its invariants. Separate capabilities with distinct rules, lifecycles, or public contracts. Keep closely related entities together when they share those rules; do not create a service per table, endpoint, or noun. Shared authentication, database, tenant ID, or deployment does not make the entire application one domain. Avoid a product-named catch-all service containing unrelated capabilities.

For existing apps, reuse the service that owns the behavior. Do not reorganize unrelated domains or move existing code without task scope. A small single-domain feature needs only its existing owner, not a new architecture exercise.

Read [domain design and public contracts](references/domain-apis.md) when choosing boundaries or coordinating services. Name the owner of each invariant that spans domains and explain how atomic updates remain atomic. Do not assume a nested service invocation shares the caller's database transaction. Keep the shared database/auth singletons and one migration history; business boundaries do not require separate databases or deployments.

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

Compare the final services and route targets with the ownership map. Confirm each capability has real operations under its owner, cross-service imports use public contracts, and no catch-all implementation hides behind empty services. Explain deliberate boundary changes and verify cross-domain consistency/failure behavior. A passing graph check validates structure, not domain cohesion.

Review the CLI's created and updated files, warnings, next steps and final diff. Run focused checks after logical changes. Before completion, run applicable check, typecheck, build, unit/integration tests and existing relevant end-to-end coverage. Inspect package.json for actual script names. For HTTP work, test the route's status/body, valid and invalid input, and denied and allowed access where relevant; a direct function test does not cover request mapping or the complete flow. Replay the original bug through the boundary that failed. Backend/API tests do not require an unsolicited frontend.

Database/auth changes also need explicit environment setup and migration steps from [the data reference](references/data-apis.md), followed by persistence/session/authorization verification. Stop all test-owned servers and clients. Report what changed, exact verification performed, and every failed, skipped or blocked check with its effect on confidence. Written code or passing unit tests alone is not fully verified delivery when affected runtime behavior remains untested.
