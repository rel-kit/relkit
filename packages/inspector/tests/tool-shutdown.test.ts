/** UI and history cleanup share the support deadline instead of serializing two force deadlines. */
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";
import { InspectionFiles, InspectionNative } from "@relkit/inspector-api/connection";
import { InspectorTool } from "../src/tool.service.js";
import { InspectorDiscovery } from "../src/discovery.service.js";
import { InspectorRemote } from "../src/remote.service.js";
import { InspectorUiNative } from "../src/ui-native.service.js";
import { InspectorHistoryNative } from "../src/history-native.service.js";

it.effect("joins UI and history deadlines concurrently within five seconds", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const uiEntered = yield* Deferred.make<void>();
      const historyEntered = yield* Deferred.make<void>();
      const released: string[] = [];
      const dependencies = shutdownLayers(uiEntered, historyEntered, released);
      const layer = Layer.effect(InspectorTool, InspectorTool.make).pipe(
        Layer.provide(dependencies),
      );
      const fiber = yield* Effect.forkChild(
        InspectorTool.use((tool) => tool.run({ hostname: "127.0.0.1", port: 3210 })).pipe(
          Effect.provide(layer),
        ),
      );
      yield* Deferred.await(uiEntered);
      yield* Deferred.await(historyEntered);
      const stopping = yield* Effect.forkChild(Fiber.interrupt(fiber));
      yield* TestClock.adjust(4000);
      const withinDeadline = stopping.pollUnsafe() !== undefined;
      yield* TestClock.adjust(4000);
      yield* Fiber.join(stopping);
      expect(withinDeadline).toBe(true);
      expect(new Set(released)).toEqual(new Set(["ui", "history"]));
    }),
  ),
);

/** Gives both resources the same independent release delay. */
const releasedAfter = (name: string, released: string[]) =>
  Effect.sleep(4000).pipe(
    Effect.andThen(
      Effect.sync(() => {
        released.push(name);
      }),
    ),
  );

/** Substitutes native acquisition while retaining the real tool ownership scopes. */
function shutdownLayers(
  uiEntered: Deferred.Deferred<void>,
  historyEntered: Deferred.Deferred<void>,
  released: string[],
) {
  const forbidden = () => Effect.die("fixture has no filesystem forwarding authority");
  return Layer.mergeAll(
    Layer.succeed(InspectionFiles, {
      projectId: () => Effect.succeed("project"),
      publish: forbidden,
      read: forbidden,
      list: forbidden,
      removeOwned: forbidden,
    }),
    Layer.succeed(InspectionNative, {
      listen: () => Effect.succeed("http://127.0.0.1:43100"),
      forward: forbidden,
    }),
    Layer.succeed(InspectorDiscovery, {
      select: () => Effect.succeed({ state: "disconnected", rejected: 0 }),
    }),
    Layer.succeed(InspectorRemote, { request: forbidden, json: forbidden }),
    Layer.succeed(InspectorUiNative, {
      start: () =>
        Effect.acquireRelease(
          Deferred.succeed(uiEntered, undefined).pipe(Effect.as(Effect.never)),
          () => releasedAfter("ui", released),
        ),
    }),
    Layer.succeed(InspectorHistoryNative, {
      acquire: () =>
        Effect.acquireRelease(
          Deferred.succeed(historyEntered, undefined).pipe(
            Effect.as({
              pid: undefined,
              call: () => Effect.succeed([]),
              close: () => Effect.void,
            }),
          ),
          () => releasedAfter("history", released),
        ),
    }),
  );
}
