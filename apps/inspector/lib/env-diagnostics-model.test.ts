import { expect, test } from "bun:test";
import type { InspectorDiagnosticsPage, InspectorEnvironmentPage } from "./api-types";
import { normalizeDiagnostics, normalizeEnvironment } from "./env-diagnostics-model";

const identity = { protocol: "zsys.inspector" as const, version: 1 as const };

test("normalizes value-free environment metadata and keeps generation identity", () => {
  const payload = {
    ...identity,
    generationId: "active-1",
    graphHash: "sha256:active",
    items: [
      {
        name: "DATABASE_URL",
        type: "secret-string",
        requiredIn: ["production"],
        hasDefault: false,
        optional: false,
        sensitive: true,
        source: { file: "src/env.ts", line: 4, column: 3 },
        value: "must-not-be-projected",
      },
    ],
    active: {
      ...identity,
      role: "active" as const,
      generationId: "active-1",
      graphHash: "sha256:active",
      items: [],
    },
  } satisfies InspectorEnvironmentPage;
  const snapshot = normalizeEnvironment(payload);
  expect(snapshot.active.graphHash).toBe("sha256:active");
  expect(snapshot.fields).toEqual([
    expect.objectContaining({
      name: "DATABASE_URL",
      type: "secret-string",
      requiredIn: ["production"],
      sensitive: true,
      source: { file: "src/env.ts", line: 4, column: 3 },
    }),
  ]);
  expect(JSON.stringify(snapshot)).not.toContain("must-not-be-projected");
});

test("keeps active diagnostics while exposing candidate diagnostics separately", () => {
  const payload = {
    ...identity,
    generationId: "active-1",
    graphHash: "sha256:active",
    status: "candidate" as const,
    items: [{ code: "ZSYS_CANDIDATE", severity: "error", message: "candidate failed" }],
    active: {
      ...identity,
      role: "active" as const,
      generationId: "active-1",
      graphHash: "sha256:active",
      items: [
        {
          code: "ZSYS_ACTIVE",
          severity: "warning" as const,
          message: "active remains usable",
          file: "src/app.ts",
          line: 2,
          column: 5,
        },
      ],
    },
    candidate: {
      ...identity,
      role: "candidate" as const,
      generationId: "candidate-2",
      graphHash: "sha256:candidate",
      state: "active",
      items: [{ code: "ZSYS_CANDIDATE", severity: "error", message: "candidate failed" }],
    },
  } satisfies InspectorDiagnosticsPage;
  const snapshot = normalizeDiagnostics(payload);
  expect(snapshot.active.items[0]).toMatchObject({ code: "ZSYS_ACTIVE" });
  expect(snapshot.candidate?.identity.generationId).toBe("candidate-2");
  expect(snapshot.visible[0]).toMatchObject({ code: "ZSYS_CANDIDATE" });
  expect(snapshot.active.items).toHaveLength(1);
});

test("uses graph identity for runtime diagnostic stubs", () => {
  const payload = {
    ...identity,
    status: "active",
    items: [],
  } as unknown as InspectorDiagnosticsPage;
  const snapshot = normalizeDiagnostics(payload, {
    generationId: "generation.runtime",
    graphHash: "sha256:runtime",
  });
  expect(snapshot.active.identity).toMatchObject({
    generationId: "generation.runtime",
    graphHash: "sha256:runtime",
  });
});
