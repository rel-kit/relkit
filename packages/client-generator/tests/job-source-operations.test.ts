import { expect, test } from "vitest";
import { Effect } from "effect";
import type { ApplicationGraph, TaskJobNode } from "@relkit/graph";
import {
  isExposedJobEffect,
  isExposedJob,
  isRecordEffect,
  isRecord,
  recordKeysEffect,
  source,
  sourceEffect,
  stringArrayEffect,
  supportedOperationsEffect,
} from "../src/generate-job-sources.js";

const job = {
  kind: "job",
  executionModel: "task",
  implicit: false,
  id: "orders.export",
  name: "exportOrders",
  jobId: "orders.export",
  taskId: "orders.export",
  taskVersion: "1",
  input: { type: "string" },
  output: { type: "number" },
  client: {
    operations: ["retry", "trigger", "unknown"],
    fields: ["status", null],
    streams: ["text", 1],
  },
} as unknown as TaskJobNode;

test("normalizes public task jobs through Effect and its synchronous adapter", () => {
  expect(Effect.runSync(isExposedJobEffect(job))).toBe(true);
  expect(isExposedJob(job)).toBe(true);
  const value = Effect.runSync(sourceEffect(job));
  expect(value).toMatchObject({
    operations: ["trigger", "retry"],
    fields: ["status"],
    streamNames: ["text"],
  });
  expect(source(job)).toEqual(value);
  expect(
    Effect.runSync(
      sourceEffect({
        ...job,
        buildId: "build-1",
        errors: [],
        progress: { type: "number" },
        streams: { text: { type: "string" } },
      } as TaskJobNode),
    ),
  ).toMatchObject({ buildId: "build-1", errors: [], progress: { type: "number" } });
  expect(Effect.runSync(supportedOperationsEffect(["watch", "get", "bad"]))).toEqual([
    "get",
    "watch",
  ]);
  expect(Effect.runSync(stringArrayEffect(["text", null, 1]))).toEqual(["text"]);
  expect(Effect.runSync(recordKeysEffect({ text: {}, progress: {} }))).toEqual([
    "text",
    "progress",
  ]);
  expect(Effect.runSync(isRecordEffect({ text: {} }))).toBe(true);
  expect(isRecord({ text: {} })).toBe(true);
});

test("rejects private and malformed job metadata", () => {
  const node = job as ApplicationGraph["nodes"][number];
  expect(Effect.runSync(isExposedJobEffect({ ...job, implicit: true } as TaskJobNode))).toBe(false);
  expect(Effect.runSync(isExposedJobEffect({ ...job, client: null } as TaskJobNode))).toBe(false);
  expect(Effect.runSync(isExposedJobEffect({ ...job, client: {} } as TaskJobNode))).toBe(false);
  expect(Effect.runSync(isExposedJobEffect({ ...node, kind: "channel" } as typeof node))).toBe(
    false,
  );
  expect(Effect.runSync(supportedOperationsEffect(null))).toEqual([]);
  expect(Effect.runSync(stringArrayEffect(null))).toEqual([]);
  expect(Effect.runSync(recordKeysEffect([]))).toEqual([]);
  expect(Effect.runSync(isRecordEffect(null))).toBe(false);
});
