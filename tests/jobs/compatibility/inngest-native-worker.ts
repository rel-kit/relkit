import { Inngest, RetryAfterError, type Context } from "inngest";
import { serve } from "inngest/bun";

export type Observation = {
  readonly functionId: string;
  readonly stage: string;
  readonly runId: string;
  readonly eventId: string;
  readonly key: string;
  readonly attempt: number;
  readonly recordedAt: number;
  readonly workerVersion?: string;
  readonly workerLabel?: string;
};

export type NativeWorkerOptions = {
  readonly namespace: string;
  readonly baseUrl: string;
  readonly eventKey: string;
  readonly signingKey: string;
  readonly observerUrl: string;
  readonly workerPort: number;
  readonly appVersion?: string;
  readonly workerLabel?: string;
  readonly includeProbeFunctions?: boolean;
  readonly scheduleCron?: string;
};

export function createNativeWorker(options: NativeWorkerOptions) {
  const client = new Inngest({
    id: `relkit-${options.namespace}`,
    eventKey: options.eventKey,
    signingKey: options.signingKey,
    baseUrl: options.baseUrl,
    isDev: false,
    appVersion: options.appVersion ?? "compatibility-phase-0",
  });
  const acceptanceEvent = `relkit/${options.namespace}/acceptance`;
  const sleepEvent = `relkit/${options.namespace}/sleep`;
  const report = (functionId: string, stage: string, ctx: Context) =>
    fetch(options.observerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        functionId,
        stage,
        runId: ctx.runId,
        eventId: String(ctx.event.id ?? ""),
        key: String(ctx.event.data.key),
        attempt: ctx.attempt,
        recordedAt: Date.now(),
        workerVersion: options.appVersion ?? "compatibility-phase-0",
        workerLabel: options.workerLabel,
      } satisfies Observation),
    });
  const acceptance = client.createFunction(
    {
      id: `${options.namespace}-acceptance`,
      triggers: [{ event: acceptanceEvent }],
      idempotency: "event.data.key",
      retries: 0,
    },
    async (ctx) => {
      await report("acceptance", "accepted", ctx);
      return { runId: ctx.runId, eventId: ctx.event.id };
    },
  );
  const sleep = client.createFunction(
    {
      id: `${options.namespace}-sleep`,
      triggers: [{ event: sleepEvent }],
      retries: 2,
    },
    async (ctx) => {
      await report("sleep", "attempt", ctx);
      if (ctx.event.data.failBefore && ctx.attempt === 0) {
        await report("sleep", "fail-before-one", ctx);
        throw new Error("native failure before first wait");
      }
      await report("sleep", "before-one", ctx);
      await ctx.step.sleep("wait-one", "15s");
      await report("sleep", "after-one", ctx);
      await report("sleep", "before-two", ctx);
      await ctx.step.sleep("wait-two", "15s");
      await report("sleep", "after-two", ctx);
      if (ctx.event.data.failAfter && ctx.attempt === 1) {
        await report("sleep", "fail-after-two", ctx);
        throw new Error("native failure after second wait");
      }
      await report("sleep", "completed", ctx);
      return { runId: ctx.runId, waits: ["wait-one", "wait-two"] };
    },
  );
  const retryPolicyEvent = `relkit/${options.namespace}/retry-policy`;
  const timeoutEvent = `relkit/${options.namespace}/timeout`;
  const concurrencyEvent = `relkit/${options.namespace}/concurrency`;
  const scheduledFunctionId = `${options.namespace}-scheduled`;
  const probeFunctions = options.includeProbeFunctions
    ? [
        client.createFunction(
          {
            id: `${options.namespace}-retry-policy`,
            triggers: [{ event: retryPolicyEvent }],
            retries: 1,
          },
          async (ctx) => {
            await report("retry-policy", "attempt", ctx);
            if (ctx.attempt === 0) throw new RetryAfterError("phase-0 retry", "2s");
            await report("retry-policy", "completed", ctx);
            return { attempt: ctx.attempt };
          },
        ),
        client.createFunction(
          {
            id: `${options.namespace}-timeout`,
            triggers: [{ event: timeoutEvent }],
            retries: 0,
            timeouts: { finish: "2s" },
          },
          async (ctx) => {
            await report("timeout", "started", ctx);
            await Bun.sleep(3_500);
            await report("timeout", "completed", ctx);
            return { attempt: ctx.attempt };
          },
        ),
        client.createFunction(
          {
            id: `${options.namespace}-concurrency`,
            triggers: [{ event: concurrencyEvent }],
            concurrency: { limit: 1, scope: "fn" },
            retries: 0,
          },
          async (ctx) => {
            await report("concurrency", "entered", ctx);
            await Bun.sleep(4_000);
            await report("concurrency", "exited", ctx);
            return { attempt: ctx.attempt };
          },
        ),
        client.createFunction(
          {
            id: scheduledFunctionId,
            triggers: [{ cron: options.scheduleCron ?? "* * * * *" }],
            retries: 0,
          },
          async (ctx) => {
            await report("schedule", "fired", ctx);
            return { scheduled: true };
          },
        ),
      ]
    : [];
  const handler = serve({
    client,
    functions: [acceptance, sleep, ...probeFunctions],
    servePath: "/api/inngest",
    serveOrigin: `http://host.docker.internal:${options.workerPort}`,
  });
  let server: ReturnType<typeof Bun.serve> | undefined;
  return {
    client,
    acceptanceEvent,
    sleepEvent,
    retryPolicyEvent,
    timeoutEvent,
    concurrencyEvent,
    scheduledFunctionId,
    start() {
      server = Bun.serve({
        port: options.workerPort,
        hostname: "0.0.0.0",
        fetch(request) {
          if (new URL(request.url).pathname !== "/api/inngest") {
            return new Response("not found", { status: 404 });
          }
          return handler(request);
        },
      });
    },
    stop() {
      server?.stop(true);
      server = undefined;
    },
  };
}
