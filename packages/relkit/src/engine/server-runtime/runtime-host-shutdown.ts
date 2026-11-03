/** Shares one physical shutdown/disposal result and retains the post-disposal snapshot. */
import { externalRuntimeCallback, runRuntimeHost } from "./runtime-host-native.js";
import type { RuntimeHostState } from "./runtime-host-state.types.js";
import type { ServerRuntimeHost } from "./server-runtime-host.types.js";

/** @param owner - Managed host generation. @returns Exactly-once native shutdown preserving producer-before-telemetry order. */
export function runtimeHostShutdown(owner: RuntimeHostState): ServerRuntimeHost["shutdown"] {
  return (beforeRelease, beforeTelemetry) =>
    (owner.shutdown ??= runRuntimeHost(
      owner,
      owner.service.shutdown(
        externalRuntimeCallback(owner, "runtime.before-release", async () => {
          await beforeRelease();
        }),
        externalRuntimeCallback(owner, "runtime.before-telemetry", async () => {
          await beforeTelemetry?.();
        }),
      ),
    )
      .then((snapshot) => {
        owner.closedSnapshot = snapshot;
        return snapshot;
      })
      .finally(() => owner.runtime.dispose()));
}
