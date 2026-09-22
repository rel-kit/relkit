---
name: relkit-app
description: Build or extend a RELKIT TypeScript backend using domain services, validated functions, routes, and tests. Use for RELKIT application work, not framework internals or cloud deployment.
---

# Build a RELKIT application

Work in the application's root, where `relkit.config.ts` and `package.json` live. If it is an
existing app, read its domains, routes, configuration, and tests before adding files. Keep its
installed RELKIT version and conventions. For a new API app, start with
`bunx create-relkit@latest <name> --template api`; cloud and deployment default to `none`.

## Put behavior in the right place

- `src/<domain>/` owns one business area. Keep its functions and other artifacts together.
- `src/<domain>/service.ts` selects public functions, events, tasks, and jobs. It does not
  automatically expose HTTP endpoints or authorize callers.
- A function owns validated input, business behavior, output, and declared domain errors.
  Keep rules needed by every caller in the function, not only in a route or middleware.
- `src/routes/**/route.ts` maps a URL and HTTP method to a public service operation. Keep
  transport concerns such as request mapping, status, and headers there.
- Bind providers and resource ownership explicitly in `relkit.config.ts`. Add a local profile
  first when it satisfies the task; cloud resources are optional.

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

Follow the [Orders tutorial](https://relkit.up.railway.app/docs/start/create-an-app) for a
continuous first app, [Service](https://relkit.up.railway.app/docs/service) for code placement,
and [HTTP routes](https://relkit.up.railway.app/docs/http) for transport behavior. Use the
[API reference](https://relkit.up.railway.app/docs/api/app) for exact signatures. If the
installed version differs from the published docs, inspect its CLI help and package types.
