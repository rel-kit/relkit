import { describe, expect, test } from "bun:test";
import { GRAPH_VERSION } from "../../packages/contracts/src/index.ts";
import { defineApp } from "../../packages/app/src/define-app.ts";
import { defineEnv } from "../../packages/config/src/index.ts";
import { defineEvent, defineEventFunction } from "../../packages/events/src/index.ts";
import { defineFunction } from "../../packages/functions/src/index.ts";
import { defineJob as defineLegacyJob } from "../../packages/jobs/src/legacy.ts";
import { defineJob, defineTask } from "../../packages/jobs/src/index.ts";
import { defineRoute, http } from "../../packages/routes/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
import { hashGraph as canonicalGraphHash } from "../../packages/graph/src/index.ts";
import {
  NORMALIZE_CODES,
  VALIDATION_PASSES,
  normalizeCompilation,
} from "../../packages/compiler/src/index.ts";
import { localJob } from "../../integrations/packages/local/src/index.ts";

const input = z.object({ id: z.string() });
const output = z.object({ ok: z.boolean() });

function values() {
  const target = defineFunction({
    id: "orders.get",
    input,
    output,
    handler: async () => ({ ok: true }),
  });
  const event = defineEvent({ id: "orders.created", version: 1, input: input });
  const job = defineLegacyJob({
    id: "orders.refresh",
    input,
    target,
    retry: { maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 5, multiplier: 2, jitter: "none" },
  });
  const route = defineRoute({
    id: "orders.route",
    method: "GET",
    path: "/orders/:id/",
    target,
    request: http.input({ id: http.path("id") }),
    responses: [http.success(200, output)],
  });
  const trigger = defineEventFunction({
    id: "orders.listener",
    event: "orders.created" as never,
    handler: async () => {},
    delivery: "ephemeral",
  });
  return [target, event, job, route, trigger] as const;
}

function taskFirstJobWithProfile() {
  const task = defineTask({
    id: "orders.refresh",
    version: "1",
    input,
    output,
    handler: async () => ({ ok: true }),
  });
  const job = defineJob({ name: "refreshOrders", task, profile: "default" });
  return {
    descriptor: job,
    exportName: "refreshOrders",
    exportKind: "named" as const,
    source: { file: "src/orders/jobs/refresh.job.ts", line: 1, column: 1 },
    exportFact: {
      position: 0,
      binding: "refreshOrders",
      factory: {
        binding: "refreshOrders",
        factory: "defineJob",
        kind: "job" as const,
        idOptional: true,
        id: "omitted" as const,
        position: 0,
        options: ["name", "task", "profile"],
      },
    },
  };
}

function legacyJobValues(legacyJobs: boolean) {
  const target = defineFunction({
    id: "orders.get",
    input,
    output,
    handler: async () => ({ ok: true }),
  });
  const app = defineApp({
    id: "app",
    env: defineEnv({}),
    jobs: localJob(),
    compatibility: { legacyJobs },
  });
  const job = defineLegacyJob({
    id: "orders.refresh",
    input,
    target,
    retry: { maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 5, multiplier: 2, jitter: "none" },
  });
  return [app, target, job] as const;
}

describe("compiler normalization", () => {
  test("runs all v3 passes in their exact order", () => {
    const seen: string[] = [];
    const result = normalizeCompilation({
      descriptors: values(),
      onPass: (pass) => seen.push(pass),
    });
    expect(seen).toEqual(VALIDATION_PASSES);
    expect(result.passOrder).toEqual(VALIDATION_PASSES);
    expect(result.graphHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.outputs.graph).toContain(`"contractVersion":${GRAPH_VERSION}`);
    expect(result.outputs.manifest).toContain("manifestGraphHash");
  });

  test("keeps diagnostic codes stable for duplicate IDs and route collisions", () => {
    const [target, , , route] = values();
    const duplicate = normalizeCompilation({
      descriptors: [target, target, route, { ...route, id: "orders.other" }],
    });
    const codes = duplicate.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain(NORMALIZE_CODES.duplicateId);
    expect(codes).toContain(NORMALIZE_CODES.collision);
    expect(duplicate.outputs.manifest).toBe("");
    expect(duplicate.activatable).toBe(false);
  });

  test("requires an explicit compatibility opt-in for legacy jobs", () => {
    const disabled = normalizeCompilation({ descriptors: legacyJobValues(false) });
    expect(disabled.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      NORMALIZE_CODES.legacyJobs,
    );
    expect(disabled.activatable).toBe(false);

    const enabled = normalizeCompilation({ descriptors: legacyJobValues(true) });
    expect(enabled.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      NORMALIZE_CODES.legacyJobs,
    );
  });

  test("treats the task-first profile spelling as a warning, not legacy execution", () => {
    const result = normalizeCompilation({ extracted: [taskFirstJobWithProfile()] });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: NORMALIZE_CODES.jobProfile,
        severity: "warning",
      }),
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      NORMALIZE_CODES.legacyJobs,
    );
    expect(result.activatable).toBe(true);
  });

  test("sorts canonical graph bytes independently of descriptor enumeration", () => {
    const [target, event, job, route, trigger] = values();
    const first = normalizeCompilation({ descriptors: [target, event, job, route, trigger] });
    const second = normalizeCompilation({ descriptors: [trigger, route, job, event, target] });
    expect(second.graphHash).toBe(first.graphHash);
    expect(second.outputs.graph).toBe(first.outputs.graph);
    expect(canonicalGraphHash(JSON.parse(first.outputs.graph))).toBe(first.graphHash);
  });

  test("normalizes raw IDs and paths without losing mapped source locations", () => {
    const result = normalizeCompilation({
      descriptors: [
        {
          kind: "route",
          id: " orders.route ",
          method: "get",
          path: "//orders//",
          target: { ref: { kind: "function", id: "missing" } },
          request: { kind: "input", fields: {} },
          responses: [{ kind: "success", id: "success.200", status: 200 }],
        },
      ],
      locations: { "orders.route": { file: "src/routes.ts", line: 7, column: 3 } },
    });
    expect(result.descriptors[0]?.id).toBe("orders.route");
    expect(result.descriptors[0]?.source).toEqual({ file: "src/routes.ts", line: 7, column: 3 });
    expect((result.descriptors[0]?.value as { method: string; path: string }).method).toBe("GET");
    expect((result.descriptors[0]?.value as { method: string; path: string }).path).toBe("/orders");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      NORMALIZE_CODES.missingTarget,
    );
  });

  test("keeps invalid raw IDs as stable diagnostics", () => {
    const result = normalizeCompilation({ descriptors: [{ kind: "function", id: "bad id" }] });
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain(NORMALIZE_CODES.id);
    expect(codes).not.toContain("RELKIT_NORMALIZATION_FAILED");
  });
});
