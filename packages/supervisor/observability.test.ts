import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createObservabilityCollector,
  createObservabilityIndex,
  createObservabilityQuery,
  createObservabilitySegmentStore,
  createObservabilityStream,
} from "@relkit/observability";
import { createSupervisorObservability } from "./src/observability.js";
import { createSupervisorStateMachine } from "./src/state-machine.js";

const roots: string[] = [];

test("publishes lifecycle and diagnostics with graph hashes across generations", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-supervisor-observability-"));
  roots.push(root);
  const index = await createObservabilityIndex({ root, maxEntries: 100 });
  const store = await createObservabilitySegmentStore({ root, index });
  const collector = createObservabilityCollector({ maxRecords: 100 });
  const stream = createObservabilityStream({ maxEvents: 100 });
  const fingerprints = new Map<number, ReturnType<typeof fingerprint>>();
  const observability = createSupervisorObservability({
    activationFingerprint: (token) => fingerprints.get(token.generationToken),
    collector,
    stream,
    append: store.append,
    now: () => Date.parse("2026-08-16T12:00:00.000Z"),
  });
  const machine = createSupervisorStateMachine({ onTelemetry: observability.onTelemetry });

  const first = machine.requestSourceChange();
  fingerprints.set(first.generationToken, fingerprint("sha256:first"));
  machine.compileSucceeded(first);
  machine.startSucceeded(first);
  machine.verificationSucceeded(first);
  machine.switchSucceeded(first);

  const second = machine.requestSourceChange();
  fingerprints.set(second.generationToken, fingerprint("sha256:second"));
  machine.compileSucceeded(second);
  machine.startSucceeded(second);
  machine.verificationSucceeded(second);
  machine.switchSucceeded(second);
  machine.drainSucceeded(second);
  await observability.flush();

  const events = stream.replay().events;
  expect(events.some((event) => event.type === "generation.changed")).toBe(true);
  expect(events.some((event) => event.type === "diagnostic.changed")).toBe(true);
  const generationData = events
    .filter((event) => event.type === "generation.changed")
    .map(
      (event) =>
        event.data as {
          graphHash: string;
          activationFingerprint: ReturnType<typeof fingerprint>;
          event: string;
        },
    );
  expect(generationData.some((record) => record.graphHash === "sha256:first")).toBe(true);
  expect(generationData.some((record) => record.graphHash === "sha256:second")).toBe(true);
  expect(
    generationData.some(
      (record) => record.activationFingerprint.manifestHash === "sha256:second:manifest",
    ),
  ).toBe(true);
  expect(
    generationData.some(
      (record) => record.graphHash === "sha256:second" && record.event === "activated",
    ),
  ).toBe(true);
  expect(generationData.some((record) => record.event === "stopped")).toBe(true);

  await store.append(request("request-first", "generation-1", "sha256:first"));
  await store.append(request("request-second", "generation-2", "sha256:second"));
  const query = createObservabilityQuery(index, { maxPageSize: 10 });
  expect((await query.requests({ graphHash: "sha256:first" })).items).toHaveLength(1);
  expect((await query.requests({ generationId: "generation-2" })).items[0]?.graphHash).toBe(
    "sha256:second",
  );
  expect(JSON.stringify(collector.read())).not.toContain("password");

  await store.shutdown();
  await index.close();
});

test("turns lifecycle failures into redacted diagnostic SSE records", () => {
  const stream = createObservabilityStream();
  const observer = createSupervisorObservability({
    activationFingerprint: fingerprint("sha256:failure"),
    stream,
    now: () => Date.parse("2026-08-16T12:00:00.000Z"),
  });
  const machine = createSupervisorStateMachine({ onTelemetry: observer.onTelemetry });
  const token = machine.requestSourceChange();
  machine.compileFailed(token, { code: "RELKIT_COMPILE_FAILED", message: "password=hidden" });

  const diagnostic = stream.replay().events.find((event) => event.type === "diagnostic.changed");
  expect(diagnostic?.data).toMatchObject({
    code: "RELKIT_COMPILE_FAILED",
    severity: "error",
    graphHash: "sha256:failure",
    message: "password=[REDACTED]",
  });
  expect(JSON.stringify(diagnostic)).not.toContain("hidden");
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function request(requestId: string, generationId: string, graphHash: string) {
  return {
    version: 1 as const,
    signal: "request" as const,
    requestId,
    traceId: `trace-${requestId}`,
    generationId,
    graphHash,
    invocationId: `invocation-${requestId}`,
    startedAt: "2026-08-16T12:00:00.000Z",
    completedAt: "2026-08-16T12:00:00.001Z",
    durationMs: 1,
    method: "GET",
    rawPath: "/health",
    normalizedRoute: "/health",
    routeId: "health",
    functionId: "health.check",
    status: 200,
    outcome: "success" as const,
    timeline: [],
  };
}

function fingerprint(graphHash: string) {
  return {
    graphHash,
    manifestHash: `${graphHash}:manifest`,
    runtimeIntegrationsPlanHash: `${graphHash}:runtime-integrations`,
  } as const;
}
