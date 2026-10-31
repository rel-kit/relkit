/** UI polling through the backend listener stays out of the terminal like the inspection loop. */
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Ref } from "effect";
import { ExecutionSuccessLogs } from "@relkit/contracts/operation";
import {
  InspectionFiles,
  InspectionNative,
  type InspectionConnectionFile,
} from "@relkit/inspector-api/connection";
import { InspectorTool } from "../src/tool.service.js";
import { InspectorDiscovery } from "../src/discovery.service.js";
import { InspectorRemote } from "../src/remote.service.js";
import { InspectorUiNative } from "../src/ui-native.service.js";
import { InspectorHistoryNative } from "../src/history-native.service.js";
import { inspectorBackend } from "../src/tool-backend.js";
import { acquireLiveEvents } from "../src/live-events.js";

it.effect("starts the backend listener without routine success logs", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const listened = yield* Deferred.make<boolean>();
      const forbidden = () => Effect.die("fixture has no native authority");
      const dependencies = Layer.mergeAll(
        Layer.succeed(InspectionFiles, {
          projectId: () => Effect.succeed("project"),
          publish: forbidden,
          read: forbidden,
          list: forbidden,
          removeOwned: forbidden,
        }),
        Layer.succeed(InspectionNative, {
          // The real listener captures this context for request handlers and response cleanup.
          listen: () =>
            ExecutionSuccessLogs.pipe(
              Effect.flatMap((enabled) => Deferred.succeed(listened, enabled)),
              Effect.as("http://127.0.0.1:43100"),
            ),
          forward: forbidden,
        }),
        Layer.succeed(InspectorDiscovery, {
          select: () => Effect.succeed({ state: "disconnected", rejected: 0 }),
        }),
        Layer.succeed(InspectorRemote, { request: forbidden, json: forbidden }),
        Layer.succeed(InspectorUiNative, { start: () => Effect.succeed(Effect.never) }),
        Layer.succeed(InspectorHistoryNative, { acquire: forbidden }),
      );
      const layer = Layer.effect(InspectorTool, InspectorTool.make).pipe(
        Layer.provide(dependencies),
      );
      const fiber = yield* Effect.forkChild(
        InspectorTool.use((tool) => tool.run({ hostname: "127.0.0.1", port: 3210 })).pipe(
          Effect.provide(layer),
        ),
      );
      expect(yield* Deferred.await(listened)).toBe(false);
      yield* Fiber.interrupt(fiber);
    }),
  ),
);

const connection: InspectionConnectionFile = {
  path: "/private/connection.json",
  descriptor: {
    protocol: 1,
    projectId: `sha256:${"a".repeat(64)}`,
    sessionId: "312b0cb1-81bb-4b99-81b7-5812a720782b",
    endpoint: "http://127.0.0.1:43100",
    token: "a".repeat(43),
    createdAt: "2026-10-23T00:00:00.000Z",
    process: { pid: 1, startedAt: "2026-10-23T00:00:00.000Z" },
  },
};

it.effect("keeps success logs for forwarded actions while polls stay quiet", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const state = yield* Ref.make({
        selection: {
          state: "connected" as const,
          connection,
          rejected: 0,
          handshake: {
            protocol: 1 as const,
            projectId: connection.descriptor.projectId,
            sessionId: connection.descriptor.sessionId,
            generationId: "one",
            capabilities: [],
          },
        },
        history: undefined,
        sessionId: undefined,
        through: 0,
        error: undefined,
        incomplete: false,
        droppedRecords: 0,
      });
      const seen: boolean[] = [];
      const handler = inspectorBackend(
        state,
        {
          request: () =>
            ExecutionSuccessLogs.pipe(
              Effect.map((enabled) => {
                seen.push(enabled);
                return new Response(null, { status: 204 });
              }),
            ),
          json: () => Effect.die("must not decode"),
        },
        "ui-private",
        { hostname: "127.0.0.1", port: 3210 },
        yield* acquireLiveEvents,
      );
      const send = (method: string) =>
        handler(
          new Request("http://localhost/_relkit/v1/graph", {
            method,
            headers: { "x-relkit-inspector-token": "ui-private" },
          }),
        ).pipe(Effect.provideService(ExecutionSuccessLogs, false));
      yield* send("GET");
      yield* send("POST");
      expect(seen).toEqual([false, true]);
    }),
  ),
);
