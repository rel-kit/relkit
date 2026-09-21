import type { ScheduleDefinition } from "@relkit/jobs";
import type { TaskExecutor } from "@relkit/jobs/adapter";
import { Inngest } from "inngest";
import { serve } from "inngest/bun";
import { mapInngestPolicy } from "./policy.js";
import { safeSegment, withoutSchedules } from "./task-binding-support.js";
import { createInngestFunction } from "./task-binding-function.js";

export { createInngestFunction } from "./task-binding-function.js";

type InngestConstructor = typeof import("inngest").Inngest;
type InngestServe = typeof import("inngest/bun").serve;

export interface InngestSdk {
  readonly Inngest: InngestConstructor;
  readonly serve: InngestServe;
}

export function loadInngestSdk(): InngestSdk {
  return Object.freeze({ Inngest, serve });
}

export interface InngestTaskDefinition {
  readonly functionId: string;
  readonly eventName: string;
  readonly jobId?: string;
  readonly taskId?: string;
  readonly version?: string;
  readonly taskVersion?: string;
  readonly buildId?: string;
  readonly retries?: number;
  readonly timeoutSeconds?: number;
  readonly concurrency?: number;
  readonly policy?: unknown;
  readonly schedules?: readonly ScheduleDefinition[];
  readonly schedule?: ScheduleDefinition;
}

export function createInngestFunctionConfig(
  definition: InngestTaskDefinition,
): Readonly<Record<string, unknown>> {
  const policy = mapInngestPolicy(definition.policy);
  const triggers =
    definition.schedule === undefined
      ? [
          { event: definition.eventName },
          ...(definition.schedules ?? []).map((schedule) => scheduleTrigger(schedule)),
        ]
      : [scheduleTrigger(definition.schedule)];
  return Object.freeze({
    id: definition.functionId,
    triggers,
    retries: definition.retries ?? policy.retries ?? 0,
    ...(definition.timeoutSeconds === undefined && policy.timeoutSeconds === undefined
      ? {}
      : { timeouts: { finish: `${definition.timeoutSeconds ?? policy.timeoutSeconds}s` } }),
    ...(definition.concurrency === undefined && policy.concurrency === undefined
      ? {}
      : { concurrency: { limit: definition.concurrency ?? policy.concurrency, scope: "fn" } }),
  });
}

function scheduleTrigger(schedule: ScheduleDefinition): Readonly<Record<string, string>> {
  if ("every" in schedule)
    throw new Error("Inngest native schedules do not support interval recurrence.");
  if (schedule.timezone !== "UTC")
    throw new Error("Inngest native schedules support UTC cron only.");
  if (schedule.overlap !== undefined && schedule.overlap !== "allow") {
    throw new Error("Inngest native schedules do not expose overlap policy.");
  }
  if (schedule.misfire !== undefined && schedule.misfire !== "skip") {
    throw new Error("Inngest native schedules do not expose misfire policy.");
  }
  return { cron: schedule.cron };
}

export function inngestFunctionId(
  jobId: string,
  taskId: string,
  taskVersion: string,
  buildId: string,
): string {
  return ["relkit", jobId, taskId, taskVersion, buildId]
    .map((value) => value.replace(/[^a-zA-Z0-9_.-]/gu, "-"))
    .join("-");
}

export interface InngestWorkerOptions {
  readonly client: Inngest.Any;
  readonly definitions: readonly InngestTaskDefinition[];
  readonly executor: TaskExecutor;
  readonly servePath?: string;
  readonly serveOrigin?: string;
  readonly startWorker?: boolean;
}

export type InngestWorkerRegistrationOptions = Omit<InngestWorkerOptions, "client">;

export interface InngestWorkerHandle {
  readonly path: string;
  readonly handler: (request: Request) => Promise<Response>;
  readonly ready: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export function createInngestWorker(options: InngestWorkerOptions): {
  readonly path: string;
  readonly handler: (request: Request) => Promise<Response>;
  readonly ready: () => Promise<void>;
  readonly close: () => Promise<void>;
} {
  const path = options.servePath ?? "/api/inngest";
  const activeSignals = new Set<AbortController>();
  const handler = createInngestServeHandler(options, activeSignals);
  const ready = async (): Promise<void> => {
    const target = new URL(`${options.serveOrigin ?? "http://127.0.0.1:3000"}${path}`);
    const response = await handler(
      new Request(target.toString(), { method: "PUT", headers: { host: target.host } }),
    );
    if (!response.ok)
      throw new Error(`Inngest worker registration failed with status ${response.status}.`);
  };
  return Object.freeze({
    path,
    handler,
    ready,
    close: async () => {
      for (const controller of activeSignals)
        controller.abort(new Error("Inngest worker is closing"));
      activeSignals.clear();
    },
  });
}

export function createInngestServeHandler(
  options: InngestWorkerOptions,
  activeSignals = new Set<AbortController>(),
): (request: Request) => Promise<Response> {
  const { serve } = loadInngestSdk();
  const functions = options.definitions.flatMap((definition) => [
    createInngestFunction(
      options.client,
      withoutSchedules(definition),
      options.executor,
      activeSignals,
    ),
    ...(definition.schedules ?? []).map((schedule) =>
      createInngestFunction(
        options.client,
        {
          ...withoutSchedules(definition),
          functionId: `${definition.functionId}-schedule-${safeSegment(schedule.id)}`,
          schedule,
        },
        options.executor,
        activeSignals,
      ),
    ),
  ]);
  return serve({
    client: options.client,
    functions,
    servePath: options.servePath ?? "/api/inngest",
    ...(options.serveOrigin === undefined ? {} : { serveOrigin: options.serveOrigin }),
  });
}
