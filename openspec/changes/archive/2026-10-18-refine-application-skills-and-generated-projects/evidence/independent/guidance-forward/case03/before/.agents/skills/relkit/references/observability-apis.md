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
  inspector: { port: 3210 },
});
```

The template already supplies redaction. `localRetention` bounds development history; `exportSampling` controls remote export independently of local capture. Add named Sentry or OTLP exporters only when those integrations and their secret environment bindings are configured. Redact before storage or export. No `relkit add observability` kind exists; configure `telemetry` in `defineApp`.

Run `bun run dev`, make one identifiable HTTP request, then inspect Requests, Traces, and Logs in the Inspector. Use `bun run dev -- --verbose` for DEBUG terminal output or `--json` for structured terminal records. Development history is stored in `.relkit/observability/observability.duckdb`; this is diagnostic history, not business storage.
