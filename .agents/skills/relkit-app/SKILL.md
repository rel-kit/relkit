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

From the application root, run the relevant checks:

```sh
bun run check
bun run typecheck
bun run test
```

Exercise a changed endpoint against `bun run dev` and check its actual status and response.
Test success and relevant failure paths, including invalid input and unauthorized access.
For protected data, derive the owner from the authenticated session and enforce ownership in
the domain operation; never accept a submitted owner ID as authority.
For protected streams, check the session and ownership inside the function as well.
Exercise an authorized stream through real HTTP until its completion event, then
check foreign user/tenant denial and cancellation cleanup. An in-memory invocation
alone does not verify the generated server's request context or iterator lifetime.

Follow the [Orders tutorial](https://relkit.up.railway.app/docs/start/create-an-app) for a
continuous first app, [Service](https://relkit.up.railway.app/docs/service) for code placement,
and [HTTP routes](https://relkit.up.railway.app/docs/http) for transport behavior. Use the
[API reference](https://relkit.up.railway.app/docs/api/app) for exact signatures. If the
installed version differs from the published docs, inspect its CLI help and package types.
