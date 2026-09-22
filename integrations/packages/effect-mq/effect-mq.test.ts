import { expect, test } from "bun:test";
import { effectMq } from "./src/index.ts";
import { createEffectMqJob } from "./src/job.ts";
import { localRecipe } from "./src/local.ts";
import { deploymentProfile } from "./src/deployment/index.ts";
import {
  createEffectMqRuntime,
  runtimeIntegration,
  type EffectMqNativeClient,
} from "./src/runtime/index.ts";

test("declares the pinned PostgreSQL native adapter and account-free recipe", () => {
  const adapter = effectMq({ postgresUrl: "postgres://localhost/relkit" });
  expect(adapter.adapterId).toBe("effect-mq");
  expect(adapter.localRecipe).toEqual({
    integrationId: "effect-mq",
    recipeId: "effect-mq-docker",
    recipeVersion: 2,
  });
  expect(localRecipe.containers?.map((unit) => unit.id)).toEqual(["postgres"]);
  expect(localRecipe.workers?.map((unit) => unit.id)).toEqual(["worker"]);
  expect(localRecipe.workers?.[0]?.hostAliases).toEqual({
    "host.docker.internal": "host-gateway",
  });
  expect(localRecipe.workers?.[0]?.environment?.POSTGRES_PASSWORD).toEqual({
    secret: "postgresPassword",
  });
  expect(localRecipe.workers?.[0]?.command?.join(" ")).toContain(
    'RELKIT_EFFECT_MQ_DATABASE_URL="postgres://relkit:$POSTGRES_PASSWORD@postgres:5432/relkit"',
  );
  expect(localRecipe.containers?.[0]?.ports).toEqual({ postgres: 5432 });
  expect(localRecipe.volumes.postgres.persistent).toBe(true);
  expect(localRecipe.init?.[0]?.command?.some((part) => /[\r\n]/u.test(part))).toBe(false);
  expect(
    localRecipe.outputs({ ports: { postgres: 45_432 }, secrets: { postgresPassword: "password" } }),
  ).toEqual({ postgresUrl: "postgres://relkit:password@127.0.0.1:45432/relkit" });
  expect(deploymentProfile.sdk).toBe("effect-mq@0.7.0");
  expect(() => effectMq({ postgresUrl: "redis://localhost" })).toThrow();
  expect(() => effectMq({ observation: { readTimeout: "11 seconds" } })).toThrow();
});

test("maps Job.make and Worker.layer without leaking an application schema", () => {
  const definition = createEffectMqJob({
    name: "native-task",
    handler: async (input) => input,
  });
  expect(definition.job._tag).toBe("native-task");
  expect(definition.workerLayer).toBeDefined();
  expect(definition.handlerLayer).toBeDefined();
});

test("uses native effect-mq receipts and does not create a fallback store", async () => {
  const calls: string[] = [];
  const native: EffectMqNativeClient = {
    submit: async (request) => {
      calls.push("submit:" + request.operationId);
      return {
        accepted: true,
        runId: "run-1",
        jobId: request.jobId,
        taskId: request.taskId,
        taskVersion: request.taskVersion,
        acceptedAt: new Date().toISOString(),
      };
    },
    get: async () => ({
      accepted: true,
      runId: "run-1",
      jobId: "job",
      taskId: "task",
      taskVersion: "1",
      acceptedAt: new Date().toISOString(),
      buildId: "build",
      service: "effect-mq",
      status: "queued",
      observedAt: new Date().toISOString(),
      resultAvailability: "pending",
    }),
    list: async () => ({ items: [], hasMore: false, availability: [] }),
    cancel: async (_runId, operationId) => ({ runId: "run-1", operationId, outcome: "requested" }),
    retry: async (request) => ({
      accepted: true,
      runId: "run-2",
      jobId: request.jobId ?? "job",
      taskId: request.taskId ?? "task",
      taskVersion: request.taskVersion ?? "1",
      acceptedAt: new Date().toISOString(),
      retryOfRunId: request.runId,
    }),
  };
  const runtime = createEffectMqRuntime({ native });
  const receipt = await runtime.submit(
    {
      jobId: "job",
      taskId: "task",
      taskVersion: "1",
      buildId: "build",
      input: { value: 1 },
      operationId: "op",
    },
    {
      ...context(),
    },
  );
  expect(receipt).toMatchObject({ accepted: true, runId: "run-1" });
  expect(calls).toEqual(["submit:op"]);
  await runtime.close();
});

test("uses the local worker database URL when it is provided", async () => {
  const previous = process.env.RELKIT_EFFECT_MQ_DATABASE_URL;
  process.env.RELKIT_EFFECT_MQ_DATABASE_URL = "postgres://worker/relkit";
  try {
    const generation = await runtimeIntegration.registrations[0]!.create({
      generationId: "generation",
      bindingId: "binding",
      capability: "job",
      profile: "default",
      behavior: {},
      connection: {},
    });
    await generation.release?.();
  } finally {
    if (previous === undefined) delete process.env.RELKIT_EFFECT_MQ_DATABASE_URL;
    else process.env.RELKIT_EFFECT_MQ_DATABASE_URL = previous;
  }
});

function context() {
  return {
    signal: new AbortController().signal,
    application: "app",
    environment: "test",
    scope: "trusted",
    service: "effect-mq",
    serviceGeneration: "generation",
  };
}
