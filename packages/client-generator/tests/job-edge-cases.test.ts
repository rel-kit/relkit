import { expect, test } from "vitest";
import { Effect } from "effect";
import type { TaskJobNode } from "@relkit/graph";
import { sourceEffect } from "../src/generate-job-sources.js";
import { jobProcedureEntrySourcesEffect } from "../src/generate-job-types.js";
import { jobRegistryTypeEffect } from "../src/generate-job-registry.js";
import type { JobProcedureSource } from "../src/generate-job-procedures.types.js";

test("renders job defaults when client and stream metadata are absent", () => {
  const source = Effect.runSync(
    sourceEffect({
      kind: "job",
      name: "exportOrders",
      jobId: "orders.export",
      taskId: "orders.export",
      taskVersion: "1",
      input: {},
      output: {},
      client: null,
    } as unknown as TaskJobNode),
  );
  expect(source).toMatchObject({ operations: [], fields: [], streamNames: [] });
  const sparse: JobProcedureSource = { ...source, operations: ["stream"] };
  expect(Effect.runSync(jobProcedureEntrySourcesEffect([sparse])).join("\n")).toContain(
    "readonly name: never",
  );
  expect(Effect.runSync(jobRegistryTypeEffect(sparse))).toContain("Readonly<Record<never, never>>");
});
