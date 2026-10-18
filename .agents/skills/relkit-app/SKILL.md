---
name: relkit-app
description: Build or extend a RELKIT TypeScript backend using domain services, validated functions, routes, and tests. Use for RELKIT application work, not framework internals or cloud deployment.
---

# Build a RELKIT application

Work in the application's root, where `relkit.config.ts` and `package.json` live. If it is an
existing app, read its domains, routes, configuration, and tests before adding files. Keep its
installed RELKIT version and conventions. For a new app, start with
`bunx create-relkit@latest <name>`. The publicly certified tuple is minimal with
examples enabled, no jobs, no cloud, and no deployment. API/agent/fullstack/jobs
and cloud creation are internal candidates until their exact release evidence is certified.

## Start from the request

For features, establish scope, expected behavior and acceptance criteria, then explain a short implementation/verification plan before editing. For bugs, establish expected versus actual behavior, attempt reproduction and trace the failing path; separate confirmed causes from hypotheses and explain the fix before editing. If reproduction is unavailable, say so. Discussion requests stay read-only; mixed requests apply those rules separately. An explicit implementation request authorizes proceeding after the plan without another approval prompt.

Before creating an app, establish database engine/driver or explicit no database and whether authentication is needed. Ask missing choices together before writes, reuse supplied/project decisions, and do not repeat onboarding for unrelated fixes. Resolve auth requiring persistence versus a no-database choice before scaffolding. Use supported create/add commands rather than inventing flags.

Suggest only task-relevant optional modules, explain their benefit, and ask for a selection before adding an unrequested capability. For capabilities already requested, resolve only missing provider/configuration decisions. Check installed help/types; explain unsupported choices before editing.

Default to backend work without unsolicited pages, app.js, assets.css or demo interfaces. Preserve explicit fullstack requests, existing frontend files and the Inspector. Give users/orders separate validated resource contracts with applicable authorization; do not expose a generic public table dispatcher. Infrastructure services and private tables need no endpoint; preserve intentional auth protocol handlers and shared internal helpers.

## Put behavior in the right place

- `src/services/<domain>/` owns one business area. Keep functions, specialized service
  schemas, events, tasks, jobs, agents, tools, channels, helpers, and assets together.
- `src/services/<domain>/service.ts` selects public functions, events, tasks, and jobs. It does not
  automatically expose HTTP endpoints or authorize callers.
- A function owns validated input, business behavior, output, and declared domain errors.
  Keep rules needed by every caller in the function, not only in a route or middleware.
- `src/routes/**/route.ts` maps a URL and HTTP method to a public service operation. Keep
  transport concerns such as request mapping, status, and headers there.
- Bind providers and resource ownership explicitly in `relkit.config.ts`. Add a local profile
  first when it satisfies the task; cloud resources are optional.
- Put environment contracts and explicitly imported configuration fragments in `src/platform`.
  Platform cannot depend on services or Routes; cross-service and route imports must use the
  other service's `service.ts`. Helpers are ordinary modules and do not invent a service.

Flat `src/<domain>/service.ts` apps remain supported. Add preserves their layout; empty
projects default to grouped. Do not mix layouts, nest service boundaries, or create an
aggregate `src/services/service.ts`. Database and auth use the same selected service root
and remain singletons. Preserve lazy native client ownership and auth's borrowed database.
Application descriptors remain plain TypeScript; Effect imports are not required.

For an optional move, preview `bun run relkit migrate layout`, review conflicts, then use
`--write`. Guarded restoration uses `--rollback <receipt>`. Keep IDs, exposure, durable
versions, and providers stable. After either operation, run check, typecheck, and
`bun run relkit dev --prepare` before `bun run dev`. Retain the private recovery receipt.

Use the public `@relkit/app/*` authoring paths and documented optional integrations. Do not
import RELKIT compiler/runtime internals or edit `.relkit/generated` or `.relkit/build`.
Use `bun run relkit add --help` for available scaffolding commands, then inspect the files
created; do not create a second service for an existing domain.

## Verify the change

Review the diff and run focused checks after logical changes. Before completion, run applicable check, typecheck, build, unit/integration and existing relevant end-to-end coverage, using scripts present in package.json:

```sh
bun run check
bun run typecheck
bun run test
bun run build
```

Exercise a changed endpoint against `bun run dev` and check its actual status and response.
Test success and relevant failure paths, including invalid input and unauthorized access.
For protected data, derive the owner from the authenticated session and enforce ownership in
the domain operation; never accept a submitted owner ID as authority.
For protected streams, check the session and ownership inside the function as well.
Exercise an authorized stream through real HTTP until its completion event, then
check foreign user/tenant denial and cancellation cleanup. An in-memory invocation
alone does not verify the generated server's request context or iterator lifetime.

Replay the original bug through its failing boundary. A direct function test alone does not verify an HTTP route or complete flow; test valid/invalid input and denied/allowed access where applicable. Use backend/API verification without adding a frontend for testing. Report the change, exact checks/results, and failed/skipped/blocked verification; do not claim full completion from partial checks. Stop test-owned servers and clients.

New database scaffolds keep one tracked SQL/metadata history beside their database service at `src/services/database/migrations`, shared by auth and business tables. Configure the target and output explicitly in root `drizzle.config.ts`, set the required environment, run `bun run db:generate`, review history, then explicitly run `bun run db:migrate` (`relkit db migrate`, or `--config <path>`). Runner implementation belongs to installed tooling, not copied scripts. Scaffolding opens no database and applies no SQL. Preserve existing schema/history/data, current flat layout support and any required dependency patch; do not split histories by business service or reset migration logs.

Follow the [Orders tutorial](https://relkit.up.railway.app/docs/start/create-an-app) for a
continuous first app, [Service](https://relkit.up.railway.app/docs/service) for code placement,
and [HTTP routes](https://relkit.up.railway.app/docs/http) for transport behavior. Use the
[API reference](https://relkit.up.railway.app/docs/api/app) for exact signatures. If the
installed version differs from the published docs, inspect its CLI help and package types.
