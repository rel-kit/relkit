import { describe, expect, test } from "bun:test";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";

const source = { file: "src/orders/tasks/send.task.ts", line: 1, column: 1 } as const;

function taskExport(exportName: string, id = "orders.send", version = "1") {
  return {
    descriptor: {
      kind: "task",
      id,
      ref: { kind: "task", id },
      metadata: {
        input: { $relkit: "schema", jsonSchema: { type: "object" } },
        output: { $relkit: "schema", jsonSchema: { type: "object" } },
        version,
        execution: "durable",
      },
    },
    exportName,
    exportKind: "named" as const,
    source,
    reference: {
      generationId: "test",
      descriptorId: id,
      kind: "task",
      module: source.file,
      exportName,
    },
  };
}

function serviceExport(task: ReturnType<typeof taskExport>) {
  return {
    descriptor: {
      kind: "service",
      id: "orders",
      ref: { kind: "service", id: "orders" },
      metadata: {
        sendEmail: {
          ...task.descriptor.metadata,
          kind: "task",
          id: task.descriptor.id,
          ref: task.descriptor.ref,
        },
      },
    },
    exportName: "orders",
    exportKind: "named" as const,
    source,
    reference: {
      generationId: "test",
      descriptorId: "orders",
      kind: "service",
      module: "src/orders/service.ts",
      exportName: "orders",
    },
  };
}

function makeExplicitJob(task: ReturnType<typeof taskExport>, name: string) {
  return {
    descriptor: {
      kind: "job",
      id: "orders.send-public",
      ref: { kind: "job", id: "orders.send-public" },
      metadata: {
        name,
        task: {
          kind: "task",
          id: "orders.send",
          ref: { kind: "task", id: "orders.send" },
          version: "1",
          input: task.descriptor.metadata.input,
          output: task.descriptor.metadata.output,
        },
        default: true,
      },
    },
    exportName: name,
    exportKind: "named" as const,
    source,
    reference: {
      generationId: "test",
      descriptorId: "orders.send-public",
      kind: "job",
      module: source.file,
      exportName: name,
    },
  };
}

describe("task/job compiler discovery", () => {
  test("creates one private implicit job with the task durable ID", () => {
    const result = normalizeCompilation({ extracted: [taskExport("sendEmail")] });
    const jobs = result.descriptors.filter((descriptor) => descriptor.kind === "job");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: "orders.send", exportName: "sendEmail" });
    expect(jobs[0]?.value).toMatchObject({ name: "sendEmail", implicit: true, private: true });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "RELKIT_JOB_BINDING_INVALID",
    );
  });

  test("requires an explicit job for ambiguous task aliases", () => {
    const result = normalizeCompilation({ extracted: [taskExport("sendEmail"), taskExport("sendReceipt")] });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "RELKIT_JOB_BINDING_INVALID",
    );
  });

  test("does not invent an implicit job from a service facade alone", () => {
    const result = normalizeCompilation({ extracted: [serviceExport(taskExport("sendEmail"))] });
    expect(result.descriptors.filter((descriptor) => descriptor.kind === "task")).toHaveLength(1);
    expect(result.descriptors.filter((descriptor) => descriptor.kind === "job")).toHaveLength(0);
  });

  test("deduplicates a service facade alias against the canonical task export", () => {
    const task = taskExport("sendEmail");
    const result = normalizeCompilation({ extracted: [task, serviceExport(task)] });
    expect(result.descriptors.filter((descriptor) => descriptor.kind === "task")).toHaveLength(1);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "RELKIT_DUPLICATE_ID",
    );
  });

  test("keeps task and task-backed job graph identities distinct", () => {
    const result = normalizeCompilation({ extracted: [taskExport("sendEmail")] });
    expect(result.graph?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "task", id: "task.orders.send", taskId: "orders.send" }),
        expect.objectContaining({ kind: "job", id: "job.orders.send", executionModel: "task", jobId: "orders.send" }),
      ]),
    );
    expect(result.graph?.edges).toContainEqual(
      expect.objectContaining({ kind: "targets-task", from: "job.orders.send", to: "task.orders.send" }),
    );
    expect(result.referencesByKind.get("task")?.has("orders.send")).toBe(true);
    expect(result.referencesByKind.get("job")?.has("orders.send")).toBe(true);
  });

  test("emits stable task hook nodes without changing legacy hook phases", () => {
    const entry = taskExport("sendEmail");
    const hooked = {
      ...entry,
      descriptor: {
        ...entry.descriptor,
        metadata: { ...entry.descriptor.metadata, onStart: { $relkit: "function", name: "onStart", owner: "task", role: "hook" } },
      },
    };
    const result = normalizeCompilation({ extracted: [hooked] });
    expect(result.graph?.nodes).toContainEqual(
      expect.objectContaining({ kind: "hook", id: "task.orders.send.start", ownerKind: "task", phase: "start" }),
    );
    expect(result.graph?.edges).toContainEqual(
      expect.objectContaining({ kind: "uses-hook", from: "task.orders.send", to: "task.orders.send.start", phase: "start" }),
    );
  });

  test("emits one deterministic versioned jobs manifest and runtime task/job maps", () => {
    const result = normalizeCompilation({
      extracted: [taskExport("sendEmail"), taskExport("shipOrder", "orders.ship")],
    });
    const manifest = JSON.parse(result.outputs.jobsManifest ?? "{}") as Record<string, unknown>;

    expect(manifest).toMatchObject({
      protocol: "relkit.jobs-manifest",
      version: 1,
      jobsProtocolVersion: 1,
      nameToId: { sendEmail: "orders.send", shipOrder: "orders.ship" },
    });
    expect(manifest.tasks).toEqual(expect.arrayContaining([expect.objectContaining({ id: "orders.send" })]));
    expect(manifest.jobs).toEqual(expect.arrayContaining([expect.objectContaining({ name: "sendEmail", taskId: "orders.send" })]));
    expect(manifest.workerEntries).toEqual(expect.arrayContaining([expect.objectContaining({ jobId: "orders.send" })]));
    expect(result.outputs.manifest).toContain('tasks: { "orders.send"');
    expect(result.outputs.manifest).toContain('jobs: { "orders.send"');
  });

  test("keeps schedule inputs out of the data-only jobs manifest", () => {
    const task = taskExport("sendEmail");
    const baseJob = makeExplicitJob(task, "sendEmail");
    const job = {
      ...baseJob,
      descriptor: {
        ...baseJob.descriptor,
        metadata: {
          ...baseJob.descriptor.metadata,
          schedules: [{ id: "hourly", cron: "0 * * * *", timezone: "UTC", input: { secret: "omit" } }],
        },
      },
    };
    const result = normalizeCompilation({ extracted: [task, job] });
    const manifest = JSON.parse(result.outputs.jobsManifest ?? "{}") as Record<string, any>;

    expect(result.diagnostics).toEqual([]);
    expect(manifest.jobs[0].schedules[0]).not.toHaveProperty("input");
    expect(manifest.schedules[0]).not.toHaveProperty("input");
    expect(result.outputs.jobsManifest).not.toContain("secret");
  });

  test("keeps manifest identity stable when discovery order changes", () => {
    const first = normalizeCompilation({
      extracted: [taskExport("sendEmail"), taskExport("shipOrder", "orders.ship")],
    });
    const second = normalizeCompilation({
      extracted: [taskExport("shipOrder", "orders.ship"), taskExport("sendEmail")],
    });

    expect(second.outputs.jobsManifest).toBe(first.outputs.jobsManifest);
    expect(second.graphHash).toBe(first.graphHash);
  });

  test("changes public identity without replacing a pinned job durable ID", () => {
    const task = taskExport("sendEmail");
    const first = normalizeCompilation({ extracted: [task, makeExplicitJob(task, "sendEmail")] });
    const second = normalizeCompilation({ extracted: [task, makeExplicitJob(task, "sendReceipt")] });
    const firstManifest = JSON.parse(first.outputs.jobsManifest ?? "{}") as Record<string, any>;
    const secondManifest = JSON.parse(second.outputs.jobsManifest ?? "{}") as Record<string, any>;

    expect(firstManifest.jobs[0].id).toBe(secondManifest.jobs[0].id);
    expect(firstManifest.jobs[0].buildId).toBe(secondManifest.jobs[0].buildId);
    expect(firstManifest.publicFingerprint).not.toBe(secondManifest.publicFingerprint);
  });

  test("keeps executable build identity separate from task semantic version", () => {
    const first = normalizeCompilation({ extracted: [taskExport("sendEmail", "orders.send", "1")] });
    const second = normalizeCompilation({ extracted: [taskExport("sendEmail", "orders.send", "2")] });
    const firstManifest = JSON.parse(first.outputs.jobsManifest ?? "{}") as Record<string, any>;
    const secondManifest = JSON.parse(second.outputs.jobsManifest ?? "{}") as Record<string, any>;

    expect(firstManifest.tasks[0].version).toBe("1");
    expect(secondManifest.tasks[0].version).toBe("2");
    expect(firstManifest.tasks[0].buildId).toBe(secondManifest.tasks[0].buildId);
    expect(firstManifest.jobs[0].buildId).toBe(secondManifest.jobs[0].buildId);
  });

  test("keeps executable identity stable when an implicit export is renamed", () => {
    const first = normalizeCompilation({ extracted: [taskExport("sendEmail")] });
    const second = normalizeCompilation({ extracted: [taskExport("sendReceipt")] });
    const firstManifest = JSON.parse(first.outputs.jobsManifest ?? "{}") as Record<string, any>;
    const secondManifest = JSON.parse(second.outputs.jobsManifest ?? "{}") as Record<string, any>;

    expect(firstManifest.tasks[0].buildId).toBe(secondManifest.tasks[0].buildId);
    expect(firstManifest.jobs[0].buildId).toBe(secondManifest.jobs[0].buildId);
    expect(firstManifest.publicFingerprint).not.toBe(secondManifest.publicFingerprint);
  });

  test("keeps task-scoped directional schema hashes across equal durable IDs", () => {
    const result = normalizeCompilation({
      extracted: [
        taskExport("sendEmail"),
        {
          descriptor: {
            kind: "function",
            id: "orders.send",
            ref: { kind: "function", id: "orders.send" },
            metadata: {
              input: { $relkit: "schema", jsonSchema: { type: "string" } },
              output: { $relkit: "schema", jsonSchema: { type: "number" } },
            },
          },
          exportName: "sendFunction",
          exportKind: "named" as const,
          source,
          reference: {
            generationId: "test",
            descriptorId: "orders.send",
            kind: "function",
            module: source.file,
            exportName: "sendFunction",
          },
        },
      ],
    });
    const task = result.graph?.nodes.find((node) => node.kind === "task");
    const job = result.graph?.nodes.find((node) => node.kind === "job" && node.executionModel === "task");

    expect(result.diagnostics).toEqual([]);
    expect(task?.schemaHashes).toEqual(expect.objectContaining({ "input:input": expect.any(String), "output:output": expect.any(String) }));
    expect(job?.schemaHashes).toEqual(task?.schemaHashes);
    expect(result.graph?.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "function", id: "orders.send" })]));
  });

  test("uses inputWire for a transformed task's canonical projection", () => {
    const entry = taskExport("sendEmail");
    const transformed = {
      ...entry,
      descriptor: {
        ...entry.descriptor,
        metadata: {
          ...entry.descriptor.metadata,
          input: {
            $relkit: "schema",
            inputJsonSchema: { type: "string" },
            transformed: true,
            contractHash: "sha256:caller-input",
          },
          inputWire: {
            $relkit: "schema",
            jsonSchema: { type: "number" },
            contractHash: "sha256:canonical-input",
          },
          output: { $relkit: "schema", jsonSchema: { type: "number" } },
        },
      },
    };
    const result = normalizeCompilation({ extracted: [transformed] });

    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "task", input: { type: "string" }, output: { type: "number" } }),
      ]),
    );
  });

  test("diagnoses a graph-only synthetic identity collision", () => {
    const result = normalizeCompilation({
      extracted: [
        taskExport("sendEmail"),
        {
          descriptor: {
            kind: "function",
            id: "task.orders.send",
            ref: { kind: "function", id: "task.orders.send" },
            metadata: { input: { $relkit: "schema", jsonSchema: {} }, output: { $relkit: "schema", jsonSchema: {} } },
          },
          exportName: "handler",
          exportKind: "named" as const,
          source,
          reference: { generationId: "test", descriptorId: "task.orders.send", kind: "function", module: source.file, exportName: "handler" },
        },
      ],
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "RELKIT_GRAPH_ID_COLLISION",
    );
  });

  test("rejects duplicate IDs within one durable namespace", () => {
    const first = taskExport("sendEmail");
    const second = { ...taskExport("sendEmail"), descriptor: { ...taskExport("sendEmail").descriptor, metadata: { ...first.descriptor.metadata, version: "2" } } };
    const result = normalizeCompilation({ extracted: [first, second] });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("RELKIT_DUPLICATE_ID");
  });
});
