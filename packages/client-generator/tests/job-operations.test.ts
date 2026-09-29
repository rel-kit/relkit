import { expect, test } from "vitest";
import { Effect } from "effect";
import { GRAPH_VERSION } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import { graph } from "./fixtures/generator-graphs.js";
import {
  jobProcedureDocumentEffect,
  jobProcedureEntriesEffect,
  jobProcedureEntriesFromDocumentEffect,
  jobProcedureEntriesFromSourcesEffect,
  jobProcedurePathsEffect,
  jobProcedureSourcesEffect,
  jobProcedureSourcesFromDocumentEffect,
} from "../src/generate-job-procedures.js";
import {
  jobFailureTypeEffect,
  jobFieldsTypeEffect,
  jobProcedureEntrySourcesEffect,
  jobSnapshotTypeEffect,
  jobStreamItemTypeEffect,
} from "../src/generate-job-types.js";
import {
  generateJobRegistryFromDocumentEffect,
  jobClientRegistryEntriesEffect,
  jobRegistryTypeEffect,
} from "../src/generate-job-registry.js";
const job = {
  name: "exportOrders",
  jobId: "orders.export",
  taskId: "orders.export",
  taskVersion: "1",
  input: { type: "string" },
  output: { type: "number" },
  streams: { text: { type: "string" } },
  operations: ["trigger", "get", "list", "watch", "stream", "cancel", "retry"],
  fields: ["status", "output"],
  streamNames: ["text"],
};
test("normalizes serialized jobs and derives stable paths", () => {
  const sources = Effect.runSync(
    jobProcedureSourcesFromDocumentEffect([
      null,
      { name: "invalid" },
      { ...job, operations: ["unknown"] },
      job,
    ]),
  );
  expect(sources).toHaveLength(1);
  const source = sources[0]!;
  expect(source.operations).toEqual([
    "trigger",
    "get",
    "list",
    "watch",
    "cancel",
    "retry",
    "stream",
  ]);
  expect(Effect.runSync(jobProcedurePathsEffect(source)).stream).toEqual([
    "jobs",
    "exportOrders",
    "runs",
    "stream",
  ]);
  expect(Effect.runSync(jobProcedureDocumentEffect(source)).procedurePaths?.trigger).toEqual([
    "jobs",
    "exportOrders",
    "trigger",
  ]);
  expect(
    Effect.runSync(jobProcedurePathsEffect({ ...source, operations: ["trigger"] })).get,
  ).toBeUndefined();
  expect(Effect.runSync(jobProcedureSourcesEffect(graph(false)))).toEqual([]);
  expect(Effect.runSync(jobProcedureEntriesEffect(graph(false)))).toEqual([]);
  const inferredStreams = Effect.runSync(
    jobProcedureSourcesFromDocumentEffect([{ ...job, streamNames: undefined }]),
  );
  expect(inferredStreams[0]?.streamNames).toEqual(["text"]);
  expect(
    Effect.runSync(
      jobProcedureSourcesFromDocumentEffect([
        job,
        { ...job, name: "aFirst", jobId: "orders.first" },
      ]),
    ).map((entry) => entry.name),
  ).toEqual(["aFirst", "exportOrders"]);
});
test("sorts multiple exposed graph jobs before generating entries", () => {
  const node = (name: string) => ({
    kind: "job",
    id: name,
    executionModel: "task",
    implicit: false,
    name,
    jobId: name,
    taskId: name,
    taskVersion: "1",
    input: {},
    output: {},
    client: { operations: ["trigger"], fields: [], streams: [] },
  });
  const input = {
    contractVersion: GRAPH_VERSION,
    nodes: [node("zLast"), node("aFirst"), { ...node("hidden"), client: null }],
    edges: [],
  } as unknown as ApplicationGraph;
  expect(Effect.runSync(jobProcedureSourcesEffect(input)).map((entry) => entry.name)).toEqual([
    "aFirst",
    "zLast",
  ]);
  expect(Effect.runSync(jobProcedureEntriesEffect(input)).join("\n")).toContain('"aFirst"');
});
test("generates all job operation entries and registry contracts", () => {
  const source = Effect.runSync(jobProcedureSourcesFromDocumentEffect([job]))[0]!;
  const entries = Effect.runSync(jobProcedureEntrySourcesEffect([source]));
  expect(entries.join("\n")).toContain('"watch": oc.input');
  expect(entries.join("\n")).toContain('"retry": oc.input');
  expect(Effect.runSync(jobProcedureEntriesFromSourcesEffect([source]))).toEqual(entries);
  expect(Effect.runSync(jobProcedureEntriesFromDocumentEffect([job]))).toEqual(entries);
  expect(Effect.runSync(jobClientRegistryEntriesEffect(source))).toHaveLength(7);
  expect(Effect.runSync(jobRegistryTypeEffect(source))).toContain("JobContract");
  expect(Effect.runSync(generateJobRegistryFromDocumentEffect([job]))).toContain("JobRegistry");
});
test("renders job fields, streams, snapshots, and declared failure unions", () => {
  const source = Effect.runSync(jobProcedureSourcesFromDocumentEffect([job]))[0]!;
  expect(Effect.runSync(jobSnapshotTypeEffect(source))).toContain("JobSnapshotFor");
  expect(Effect.runSync(jobStreamItemTypeEffect(source))).toBe("string");
  expect(Effect.runSync(jobFieldsTypeEffect(source.fields))).toBe('readonly ["status", "output"]');
  expect(Effect.runSync(jobFieldsTypeEffect([]))).toBe("readonly []");
  expect(
    Effect.runSync(jobFailureTypeEffect([{ id: "failed", data: { type: "string" } }])),
  ).toContain('readonly code: "failed"');
  expect(Effect.runSync(jobFailureTypeEffect([]))).toContain("JobErrorEnvelope");
  expect(Effect.runSync(jobFailureTypeEffect([null, { id: 1 }]))).toContain("JobErrorEnvelope");
});
test("sorts duplicate job names by id and retains optional document metadata", () => {
  const node = (jobId: string) => ({
    kind: "job",
    id: jobId,
    executionModel: "task",
    implicit: false,
    name: "sameName",
    jobId,
    taskId: jobId,
    taskVersion: "1",
    input: {},
    output: {},
    client: { operations: ["trigger"] },
  });
  const input = {
    contractVersion: GRAPH_VERSION,
    nodes: [node("z"), node("a")],
    edges: [],
  } as unknown as ApplicationGraph;
  expect(Effect.runSync(jobProcedureSourcesEffect(input)).map((item) => item.jobId)).toEqual([
    "a",
    "z",
  ]);
  expect(Effect.runSync(jobProcedureSourcesFromDocumentEffect(null))).toEqual([]);
  const documents = Effect.runSync(
    jobProcedureSourcesFromDocumentEffect([
      { ...job, name: "sameName", jobId: "z" },
      {
        ...job,
        name: "sameName",
        jobId: "a",
        buildId: "build-1",
        errors: [],
        progress: { type: "number" },
      },
    ]),
  );
  expect(documents.map((item) => item.jobId)).toEqual(["a", "z"]);
  expect(documents[0]).toMatchObject({ buildId: "build-1", errors: [] });
});
test("renders jobs with sparse operations and missing stream or error metadata", () => {
  const source = Effect.runSync(jobProcedureSourcesFromDocumentEffect([job]))[0]!;
  const getOnly = Effect.runSync(
    jobProcedureEntrySourcesEffect([{ ...source, operations: ["get"] }]),
  ).join("\n");
  expect(getOnly).not.toContain('"trigger":');
  expect(getOnly).toContain('"get":');
  const triggerOnly = Effect.runSync(
    jobProcedureEntrySourcesEffect([{ ...source, operations: ["trigger"] }]),
  ).join("\n");
  expect(triggerOnly).not.toContain('"runs":');
  expect(Effect.runSync(jobStreamItemTypeEffect({ ...source, streams: null }))).toBe("unknown");
  expect(Effect.runSync(jobStreamItemTypeEffect({ ...source, streamNames: [] }))).toBe("never");
  expect(Effect.runSync(jobFailureTypeEffect(null))).toContain("JobErrorEnvelope");
  expect(Effect.runSync(jobFailureTypeEffect([{ id: "failed" }]))).not.toContain("data?:");
});
