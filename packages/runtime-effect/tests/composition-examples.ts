import { Effect, Stream } from "effect";
import {
  createGenerationRuntime,
  Generation,
  generationLayer,
  type GenerationRuntimeOptions,
} from "../src/runtime.js";
import { createLoggerLayer } from "../src/logger.js";
import { withRootSpan } from "../src/tracing.js";
import { observeExecution } from "../src/operation.js";
import { observeExecutionStream } from "../src/operation-stream.js";
import { Layer } from "effect";
import { ManagedRuntime } from "effect";
import { createPublicClockEffect } from "../src/clock.js";
import { withNativeEffectContext } from "../src/native-context.js";
import { captureInvocationTrace, createInvocationBridge } from "../src/tracing-bridge.js";
import {
  GenerationEnvironment,
  GenerationServices,
  generationServicesLayer,
} from "../src/scope.js";

/**
 * Typechecks the managed generation example's ownership boundary.
 * @param options - Explicit caller-provided generation configuration.
 * @returns Resolved services after their owning scope has been disposed.
 */
export async function start(options: GenerationRuntimeOptions<{}>) {
  const generation = await createGenerationRuntime(options);
  try {
    return await generation.runtime.runPromise(Generation);
  } finally {
    await generation.dispose();
  }
}

/**
 * Typechecks the composition example under a caller-owned Scope.
 * @param options - Explicit generation inputs.
 * @returns Lazy scoped generation acquisition and release.
 */
export const useGeneration = (options: GenerationRuntimeOptions<{}>) =>
  Effect.scoped(Generation.pipe(Effect.provide(generationLayer(options))));

export const started = Effect.logInfo("Generation started").pipe(
  Effect.provide(createLoggerLayer({ minimumLevel: "info" })),
);

export const traced = withRootSpan(Effect.succeed("done"), {
  name: "example.invoke",
  invocationId: "invocation-1",
  source: "direct",
});

export const inspect = Effect.fn("Runtime.inspect")((values: readonly number[]) =>
  observeExecution("runtime", "inspect", Effect.succeed(values.length), () => ({
    entries: values.length,
  })),
);

export const streamSource = observeExecutionStream("runtime", "example.consume", Stream.make(1, 2));

export const streamValues = Stream.runCollect(streamSource);

export const resources = generationServicesLayer([]).pipe(
  Layer.provide(Layer.succeed(GenerationEnvironment, { values: {}, signal: undefined })),
);

export const registry = Effect.scoped(GenerationServices.pipe(Effect.provide(resources)));

/** Typechecks the public clock example's runtime lifetime.
 * @returns Completion after a sleep and guaranteed runtime disposal.
 */
export async function publicClock() {
  const runtime = ManagedRuntime.make(Layer.empty);
  try {
    const clock = await runtime.runPromise(
      createPublicClockEffect({
        run: (effect, options) => runtime.runPromise(effect, options),
      }),
    );
    await clock.sleep(1);
  } finally {
    await runtime.dispose();
  }
}

export const call = Effect.withFiber((fiber) =>
  Effect.tryPromise({
    try: () => withNativeEffectContext(fiber.context, () => Promise.resolve("done")),
    catch: (cause) => cause,
  }),
);

/** Typechecks the invocation bridge example with one explicitly owned runtime.
 * @returns Completion after the native round trip and runtime finalization.
 */
export async function bridgeCall() {
  const runtime = ManagedRuntime.make(Layer.empty);
  try {
    await runtime.runPromise(
      withRootSpan(
        Effect.gen(function* () {
          const captured = yield* captureInvocationTrace;
          const bridge = createInvocationBridge(
            {
              run: (effect, options) => runtime.runPromise(effect, options),
            },
            captured,
          );
          return yield* Effect.promise(() =>
            bridge.run(Effect.succeed("done"), { name: "ctx.cache" }),
          );
        }),
        { name: "invoke", invocationId: "invoke-1" },
      ),
    );
  } finally {
    await runtime.dispose();
  }
}
