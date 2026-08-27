# Getting started

RELKIT projects are TypeScript applications managed by Bun. This walkthrough
creates a credential-free orders API, changes it, tests it, and produces a
production build. Pulumi and AWS are optional and are not required here.

## 1. Verify the prerequisite

RELKIT pins Bun `1.3.10`:

```sh
bun --version
```

Install or switch Bun before continuing unless the output is `1.3.10`.

## 2. Create the application

Run the supported generator from the directory that should contain the project:

```sh
bunx create-relkit@latest relkit-orders \
  --template api \
  --cloud none \
  --deploy none
cd relkit-orders
cp .env.example .env
```

The explicit local-only flags avoid Pulumi, AWS credentials, and cloud cost.
The generator validates the destination, installs dependencies, and performs
its initial checks without leaving a partial project after failure.

Available templates are `minimal`, `api`, and `agent`. Use `--no-install`,
`--no-git`, or `--no-examples` only when surrounding automation owns that step.
See `bunx create-relkit@latest --help` for the current generated reference.

Framework contributors can test the current checkout without publishing:

```sh
bun run relkit:local -- create relkit-orders \
  --template api \
  --cloud none \
  --deploy none
```

## 3. Inspect and check the project

The important generated files are:

```text
relkit-orders/
├── .env.example
├── .env                  # ignored local runtime copy
├── relkit.config.ts
├── src/
│   ├── env.ts
│   ├── events/
│   ├── functions/
│   ├── routes/
│   └── services/
├── tests/
│   ├── integration/
│   └── unit/
├── package.json
└── tsconfig.json
```

`tsconfig.json` maps `@app/*` to `src/*`. Use imports such as
`@app/functions/hello.function.js` for application source; the `.js` extension
is required by the emitted ESM even though the source file is TypeScript.

Run diagnostics before starting development:

```sh
bun run relkit doctor --no-pulumi
bun run check
```

The API template declares an event provider, so `.env.example` supplies a
non-secret local endpoint, bus name, region, and log level. `--no-pulumi`
skips Pulumi and AWS credential checks for this local-only journey. `doctor`
still verifies Bun, configuration, and ports. `check` discovers descriptors,
validates the application graph, and writes graph, manifest, OpenAPI, client,
event registry, and diagnostics output under `.relkit/generated`.

## 4. Run the generated application

```sh
bun run dev
```

The backend starts on `http://localhost:3000` and the inspector starts on
`http://localhost:3210`. In another terminal:

```sh
curl "http://localhost:3000/hello?name=RELKIT"
```

Expected response:

```json
{ "message": "Hello, RELKIT!" }
```

The same process serves OpenAPI at
`http://localhost:3000/_relkit/v1/openapi.json` and Scalar at
`http://localhost:3000/_relkit/v1/api-reference`.

## 5. Apply a source change

Reuse the checked hello function through a second filesystem route:

```sh
mkdir -p src/routes/status
cp src/routes/hello/route.ts src/routes/status/route.ts
```

The copied route remains executable source from the API template. Its new
folder supplies `/status`; its `GET` export and hello function target stay the
same. Verify the activated generation:

```sh
curl -i "http://localhost:3000/status?name=RELKIT"
bun run check
```

Expect HTTP `200`, `{ "message": "Hello, RELKIT!" }`, and a successful check.
Edit source to change behavior; never hand-edit `.relkit/generated`.

## 6. Test and build

Stop development with `Ctrl-C`, then run the smallest complete local proof:

```sh
bun run test
bun run check
bun run typecheck
bun run build
```

The build writes the runnable server, graph, manifest, OpenAPI, client, and
container files under `.relkit/build`. Start it with:

```sh
bun run start
```

In another terminal, verify both application and readiness:

```sh
curl -i "http://localhost:3000/status"
curl -i "http://localhost:3000/_relkit/v1/health/ready"
```

`start` refuses a stale or hash-mismatched build. If either request fails, fix
the first diagnostic, rerun `check` and `build`, then start again.

## Environment and generated directories

Inspect declared environment keys without exposing values:

```sh
bun run relkit env list
bun run relkit env explain NAME
bun run relkit env example
bun run relkit env check
```

- `.relkit/generated/` contains checked graph and developer artifacts.
- `.relkit/build/` contains production build output.
- `.relkit/state/` contains local durable runtime state.
- `.relkit/observability/` contains local telemetry data.

Keep secrets out of source and generated artifacts. Tests use deterministic
provider fakes; normal runtimes resolve environment-backed provider bindings.

Continue with `apps/docs/content/docs/fundamentals/application.mdx` for the
authoring model or `docs/deployment.md` for the separately authorized AWS path.
