/** Owns the native commerce browser listener and local state until its parent sends termination. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context, Effect, Layer, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import orderSupport from "../../examples/commerce/src/services/orders/agents/order-support.agent.ts";
import announcements from "../../examples/commerce/src/services/announcements/channels/announcements.channel.ts";
import getAnnouncements from "../../examples/commerce/src/services/announcements/functions/get-announcements.function.ts";
import postAnnouncement from "../../examples/commerce/src/services/announcements/functions/post-announcement.function.ts";
import {
  createLocalAgentStateProvider,
  createLocalRealtimeProvider,
} from "../../packages/providers-local/src/index.ts";
import { createProviderRealtimeDispatcher } from "../../packages/realtime/src/index.ts";
import { createApp, type RuntimeManifest } from "../../packages/runtime-hono/src/index.ts";
import { runtimeCohort } from "../../packages/runtime-hono/tests/test-cohort.ts";
import { AGENT_ID, commerceAgentPlan } from "./commerce-agent-plan.js";
import { commerceAgentEngine } from "./commerce-agent-engine.js";
import { commerceAgentRuntimeSettings } from "./commerce-agent-settings.js";

const manifestSchema = Schema.Struct({ publicFingerprint: Schema.String });

/** One browser fixture owner acquires state before listening and releases the listener first. */
class CommerceAgentServer extends Context.Service<CommerceAgentServer>()(
  "relkit.tests.CommerceAgentServer",
  {
    make: Effect.gen(function* () {
      const stateRoot = yield* Effect.acquireRelease(
        Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-commerce-browser-"))),
        (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
      );
      const closing = new AbortController();
      const app = yield* fixtureApp(stateRoot);
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve({
            hostname: "127.0.0.1",
            port: Number(process.env.RELKIT_COMMERCE_FIXTURE_PORT ?? 4010),
            fetch: (request) =>
              app.fetch(
                new Request(request, {
                  signal: AbortSignal.any([request.signal, closing.signal]),
                }),
              ),
          }),
        ),
        (server) =>
          Effect.promise(async () => {
            closing.abort();
            await server.stop(true);
          }),
      );
      return { origin: server.url.origin };
    }),
  },
) {}

/**
 * Composes native declarations with explicit local providers; provider methods have no idle worker or close operation.
 * @param stateRoot - Outer scope-owned journal root.
 * @returns The native HTTP app with the existing public browser contracts.
 */
const fixtureApp = Effect.fn("CommerceAgentServer.app")(function* (stateRoot: string) {
  const provider = createLocalAgentStateProvider(stateRoot, { pollingMs: 50 });
  const realtimeProvider = createLocalRealtimeProvider(stateRoot, { pollingMs: 50 });
  const agent: Parameters<typeof commerceAgentEngine>[0] = Object.create(orderSupport);
  Object.defineProperty(agent, "id", { enumerable: true, value: AGENT_ID });
  Object.freeze(agent);
  const text = yield* Effect.promise(() =>
    Bun.file(
      new URL("../../examples/commerce/.relkit/generated/client-manifest.json", import.meta.url),
    ).text(),
  );
  const clientManifest = Schema.decodeUnknownSync(Schema.fromJsonString(manifestSchema))(text);
  const plan = commerceAgentPlan(agent);
  const dispatcher = createProviderRealtimeDispatcher({
    applicationId: "commerce-api",
    environment: "test",
    generationId: "commerce-browser-generation",
    publicFingerprint: clientManifest.publicFingerprint,
    provider: () => realtimeProvider,
  });
  return createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {
        "announcements.get-announcements": getAnnouncements,
        "announcements.post-announcement": postAnnouncement,
      },
      agents: { [AGENT_ID]: agent },
      channels: { "announcements.feed": announcements },
      middleware: {},
      requestTransforms: {},
    } satisfies RuntimeManifest,

    engine: commerceAgentEngine(agent, dispatcher),
    ...commerceAgentRuntimeSettings(provider, realtimeProvider, clientManifest.publicFingerprint),
  });
});

/**
 * Registers parent termination callbacks only for the active scope.
 * @returns Completion after either native signal, removing both callback registrations.
 */
function parentTermination() {
  return Effect.callback<void>((resume) => {
    const stop = () => resume(Effect.void);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    return Effect.sync(() => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    });
  });
}

const program = Effect.gen(function* () {
  const server = yield* CommerceAgentServer;
  console.log(`Commerce agent fixture listening on ${server.origin}`);
  yield* parentTermination();
}).pipe(Effect.provide(Layer.effect(CommerceAgentServer, CommerceAgentServer.make)));

await Effect.runPromise(observeExecution("testing", "commerce.browser-server", program));
