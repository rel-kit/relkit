/** Real child-process boundaries for Inspector exit and cancellation during startup. */
import { expect, test } from "bun:test";
import { Effect, Fiber, Layer, Ref, Schedule } from "effect";
import {
  CliInspectorSupport,
  inspectorSupportLayer,
} from "./src/commands/dev-inspector-support.service.js";
import { DevSession } from "./src/commands/dev-session.js";
import { portProbeLayer } from "./src/commands/port-availability.service.js";
import { cleanupLayer } from "./src/services/cleanup.service.js";

const live = inspectorSupportLayer.pipe(Layer.provide(Layer.merge(cleanupLayer, portProbeLayer)));

function session(source: string) {
  return new DevSession({
    projectRoot: process.cwd(),
    stablePort: 12345,
    compile: () => Promise.reject(new Error("Inspector tests must not compile a backend")),
    inspector: { command: [process.execPath, "-e", source], port: 0 },
    installSignalHandlers: false,
    logger: { human: false, json: false },
  });
}

test("a real Inspector child exit fails immediately and releases its owner", async () => {
  const facade = session("process.exit(17)");
  await Effect.runPromise(
    Effect.gen(function* () {
      const support = yield* CliInspectorSupport;
      const error = yield* support.run(facade).pipe(Effect.flip);
      expect(error.operation).toBe("dev.inspector.exit");
      expect(error.message).toContain("17");
      expect(facade.inspectorPort).toBeUndefined();
    }).pipe(Effect.provide(live), Effect.timeout(5_000)),
  );
});

test("shutdown while Inspector startup is pending joins the real child and output readers", async () => {
  const facade = session("setInterval(() => {}, 1000)");
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const support = yield* CliInspectorSupport;
        const fiber = yield* support.run(facade).pipe(Effect.forkScoped);
        const owner = yield* Ref.get(facade.state).pipe(
          Effect.map((state) => state.inspector),
          Effect.repeat({ schedule: Schedule.spaced(10), until: (value) => value !== undefined }),
        );
        if (owner === undefined) return yield* Effect.die(new Error("Missing Inspector owner"));
        expect(owner.process.exitCode).toBeNull();
        yield* Fiber.interrupt(fiber);
        expect(() => process.kill(owner.process.pid, 0)).toThrow();
        expect(facade.inspectorPort).toBeUndefined();
      }),
    ).pipe(Effect.provide(live), Effect.timeout(5_000)),
  );
});
