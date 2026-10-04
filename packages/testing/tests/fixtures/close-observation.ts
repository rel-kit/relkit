import assert from "node:assert/strict";
import { Context, Effect, Metric } from "effect";
import { z } from "@relkit/schema";
import { createTestRuntime } from "../../src/runtime.js";
import { createTestHttpClient } from "../../src/http.js";
import { createTestJob } from "../../src/jobs.js";
import { createTestEvent } from "../../src/events.js";

// This fresh Bun process owns the default registry; no other test can mutate it.
const registry = Effect.runSync(Metric.MetricRegistry);
const runtime = createTestRuntime();
try {
  await runtime.close();
  await runtime.close();
} finally {
  await runtime.close();
}

const http = createTestHttpClient({ fetch: () => new Response() });
try {
  await http.close();
  await http.close();
} finally {
  await http.close();
}

const job = await createTestJob({
  target: {
    id: "test.close-observation",
    input: z.string(),
    output: z.number(),
    handler: async (input: string) => input.length,
  },
});
try {
  await job.close();
  await job.close();
} finally {
  await job.close();
}

const event = await createTestEvent({ eventId: "test.close-observation" });
try {
  await event.close();
  await event.close();
} finally {
  await event.close();
}

for (const operation of ["runtime.close", "http.close", "job.close", "event.close"]) {
  const counter = [...registry.values()].find(
    (entry) =>
      entry.id === "relkit_execution_operations_total" &&
      entry.attributes?.domain === "testing" &&
      entry.attributes?.operation === operation,
  );
  assert.equal(counter?.hooks.get(Context.empty()).count, 1, operation);
}
console.log("RELKIT_NATIVE_CLOSE_OBSERVATION_OK");
