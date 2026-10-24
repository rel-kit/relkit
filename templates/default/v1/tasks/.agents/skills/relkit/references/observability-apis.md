# Observability and tracing

RELKIT records HTTP requests and invocation spans automatically. Use `context.log` for structured application records and `context.trace` for application work inside an existing function that needs more detail.

## Log and trace inside a function

```ts
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export default defineFunction({
  id: "orders.total",
  input: z.object({ quantity: z.number().int().positive() }),
  output: z.object({ totalCents: z.number().int().nonnegative() }),
  handler: async ({ quantity }, context) => {
    const totalCents = await context.trace.span(
      "pricing.calculate",
      { attributes: { "pricing.strategy": "catalog" } },
      async () => quantity * 1_000,
    );
    context.trace.event("pricing.calculated", { "pricing.total_cents": totalCents });
    context.trace.setAttributes({ "pricing.quantity": quantity });
    context.log.info("orders.total.calculated", { quantity, totalCents });
    return { totalCents };
  },
});
```

`span(name, callback)` creates an internal child span; `span(name, { attributes, kind }, callback)` adds attributes and an `internal` or `client` kind. `event(name, attributes?)` adds an event to the active span, and `setAttributes` annotates it. RELKIT ends child spans on success or failure. Attribute values must be strings, finite numbers, or booleans. Do not log secrets or put payloads or random IDs in span attributes.

## Configure capture and export

Edit the existing `relkit.config.ts` and preserve its environment and provider settings:

```ts
import { defineApp } from "@relkit/app/config";
import env from "@app/platform/env.js";

export default defineApp({
  env,
  telemetry: {
    redaction: { mode: "development-redacted", maxBytes: 65_536 },
    localRetention: { maxRecords: 2_000, maxAgeMs: 3_600_000, maxBytes: 16_777_216 },
    exportSampling: { traceRate: 0.25, minimumLogLevel: "info" },
  },
  server: { port: 3000 },
  inspector: { enabled: true },
});
```

The template already supplies redaction and omits inspection. This example explicitly
enables the private development bridge. `localRetention` bounds the app's memory
buffer; `exportSampling` controls remote export independently. Defaults are 2,048
records and 2 MiB, with configurable ceilings of 65,536 records and 64 MiB. Records
and persistence batches have a 1 MiB ceiling. Missing records after overflow or
shutdown expiry are reported as incomplete history. Add named Sentry or OTLP
exporters only when selected integrations and secret bindings are configured.
Redact before storage or export. No `relkit add observability` kind exists.

Run `bun run dev` and make an identifiable HTTP request. Install the separately
available `@relkit/inspector` tool in the consumer project, then run
`bunx --no-install relkit-inspector --project-root .` or
`npx --no-install relkit-inspector --project-root .` in another terminal. These
installed runner forms were tested; consult the installed package and release
availability before assuming a new version has been published. The tool needs
Bun 1.3.10 or newer and Node 20.9 or newer, and its UI defaults to 3210. Use
`--port 3211` on that tool for a different UI port. App bridge binding defaults
to `127.0.0.1:0` and uses `inspector.connection.host/port` when explicitly configured.

The tool reads private `.relkit/connections` metadata without executing app config.
Zero live sessions means disconnected; multiple sessions require an explicit
`--connection-file`. Keep credential files private and out of URLs/browser code.
The tool alone owns `.relkit/observability/observability.duckdb` and its worker.
Preserve this directory across restarts and package cache removal; never delete
the database to resolve another writer's lock. `--history-directory` selects an
explicit project-bound persistent directory. Foreign-project directories are rejected.
Stopping/uninstalling the tool leaves the app running; stopping the app leaves
retained tool history readable. Production emits no rich Inspector registration.
This history is separate from jobs, checkpoints, migrations and business data.
Use dev `--verbose` for DEBUG terminal output or global `--json` for structured records.
