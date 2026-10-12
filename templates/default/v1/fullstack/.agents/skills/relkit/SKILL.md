---
name: relkit
description: Build or extend a RELKIT CLI-generated application using its installed scaffolding and project commands. Use for application config, environments, services, functions, routes, auth, database, jobs, providers, and related app work.
---

# Work in a RELKIT application

Run commands from the generated application's root, where `relkit.config.ts` and `package.json` live. Use `bun run relkit` to invoke the project's installed CLI. Check `bun run relkit <command> --help` before relying on an option, especially after a dependency upgrade.

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
- Database and auth are singletons under `src/database` and `src/auth`; extend an existing one instead of creating another. Auth may create a database baseline if none exists. Scaffolding does not run migrations, create secrets, or provision cloud resources.
- Preserve existing application configuration, environment fields, service members, routes, and user changes when specializing generated files.

## Verify the result

Review the CLI's created and updated files, warnings, and next steps. Run `bun run check`, `bun run typecheck`, and focused tests after editing. For HTTP work, exercise the route itself; a direct function test does not cover request mapping. Database and auth work also needs the reported environment and migration steps before runtime verification.
