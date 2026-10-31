/** UI polling through the backend listener stays out of the terminal like the inspection loop. */
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer } from "effect";
import { ExecutionSuccessLogs } from "@relkit/contracts/operation";
import { InspectionFiles, InspectionNative } from "@relkit/inspector-api/connection";
import { InspectorTool } from "../src/tool.service.js";
import { InspectorDiscovery } from "../src/discovery.service.js";
import { InspectorRemote } from "../src/remote.service.js";
import { InspectorUiNative } from "../src/ui-native.service.js";
import { InspectorHistoryNative } from "../src/history-native.service.js";

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
