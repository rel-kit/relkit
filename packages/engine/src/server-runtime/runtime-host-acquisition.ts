/** Builds the host's managed Effect graph with explicit environment and logging authority. */
import { Layer, ManagedRuntime, References } from "effect";
import { createLoggerLayer } from "@relkit/runtime-effect";
import { runtimeEnvironmentLayer } from "./runtime-environment.js";
import { ServerRuntimeLive } from "./server-runtime.service.js";
import type { RuntimeEnvironmentOptions } from "./server-runtime.types.js";

/** @param options - Generated server's explicit environment and logging sinks. @returns A managed generation graph; the host owns disposal after shutdown. */
export function makeServerHostRuntime(options: RuntimeEnvironmentOptions) {
  return ManagedRuntime.make(
    ServerRuntimeLive.pipe(
      Layer.provideMerge(runtimeEnvironmentLayer(options)),
      Layer.provideMerge(createLoggerLayer(options.logger ?? { human: false, json: false })),
      Layer.provideMerge(
        Layer.succeed(References.CurrentLogAnnotations, options.annotations ?? {}),
      ),
    ),
  );
}
