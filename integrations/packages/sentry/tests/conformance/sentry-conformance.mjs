// Sentry conformance for one runtime: run by `bun` and by `node`. The real SDK the runtime selects
// sends envelopes to a local sink, which records which SDK sent them.
import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { createSentryExporter } from "@relkit/sentry/runtime";
import { admitObservabilityRecord } from "relkit/observability";

const bun = typeof process.versions.bun === "string";
const envelopes = [];
const sink = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    envelopes.push({ url: request.url ?? "", body: Buffer.concat(chunks).toString("utf8") });
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
});
await new Promise((resolve) => sink.listen(0, "127.0.0.1", resolve));
const port = sink.address().port;

const exporter = await createSentryExporter({
  dsn: `http://public@127.0.0.1:${port}/1`,
  environment: "conformance",
  release: "relkit-conformance@1.0.0",
});
exporter.exportRecord(
  admitObservabilityRecord({
    version: 2,
    signal: "log",
    timestamp: new Date().toISOString(),
    level: "error",
    component: "conformance",
    message: "conformance failure",
    fields: {},
    traceId: "10000000000000000000000000000001",
  }),
);
exporter.exportRecord(
  admitObservabilityRecord({
    version: 2,
    signal: "log",
    timestamp: new Date().toISOString(),
    level: "info",
    component: "conformance",
    message: "conformance event",
    fields: {},
  }),
);
assert.equal(await exporter.flush(5_000), true);
assert.equal(await exporter.close(5_000), true);
await new Promise((resolve) => sink.close(resolve));

const bodies = envelopes
  .filter(({ url }) => url.startsWith("/api/1/envelope/"))
  .map(({ body }) => body);
const text = bodies.join("\n");
assert.ok(text.includes("conformance failure"), "the error record reached Sentry");
assert.ok(text.includes("conformance event"), "the event record reached Sentry");
assert.ok(
  text.includes('"relkit.trace_id":"10000000000000000000000000000001"'),
  "tags reached Sentry",
);
assert.ok(text.includes('"environment":"conformance"'), "the environment reached Sentry");
const sdk = bun ? "sentry.javascript.bun" : "sentry.javascript.node";
assert.ok(text.includes(`"name":"${sdk}"`), `envelopes come from ${sdk}`);
assert.throws(
  () =>
    exporter.exportRecord(
      admitObservabilityRecord({
        version: 2,
        signal: "log",
        timestamp: new Date().toISOString(),
        level: "info",
        component: "c",
        message: "late",
        fields: {},
      }),
    ),
  /closed/,
);
console.log(`Sentry conformance passed on ${bun ? "bun" : "node"} with ${sdk}`);
