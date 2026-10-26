/**
 * Exposes the production generation's native host boundary over an owned Effect
 * runtime. Every callback retains cancellation, readiness and late-release policy.
 */
import { Effect } from "effect";
import { ExecutionSuccessLogs, runExecutionSync } from "@relkit/contracts/operation";
import { RuntimeEnvironment } from "./runtime-environment.js";
import { ServerRuntime } from "./server-runtime.service.js";
import { ServerRuntimeFailure } from "./server-runtime.schemas.js";
import { makeServerHostRuntime } from "./runtime-host-acquisition.js";
import { runRuntimeHost } from "./runtime-host-native.js";
import { runtimeHostResource } from "./runtime-host-resource.js";
import { runtimeHostSupport } from "./runtime-host-support.js";
import { runtimeHostShutdown } from "./runtime-host-shutdown.js";
import type { RuntimeEnvironmentOptions } from "./server-runtime.types.js";
import type { RuntimeHostState } from "./runtime-host-state.types.js";
import type { ServerRuntimeHost } from "./server-runtime-host.types.js";

/**
 * Acquires an engine-owned lifecycle graph for one generated production server.
 * @param options - Existing failure sink, initial readiness and logging authority.
 * @returns A host whose shutdown releases its managed graph exactly once.
 * @example
 * const host = await createServerRuntimeHost({ report: () => {} });
 * try { await host.resource("provider", async () => ({ id: 1 }), () => {}); }
 * finally { await host.shutdown(async () => {}); }
 */
export async function createServerRuntimeHost(
  options: RuntimeEnvironmentOptions,
): Promise<ServerRuntimeHost> {
  const runtime = makeServerHostRuntime(options);
  const service = await runtime.runPromise(ServerRuntime);
  const environment = await runtime.runPromise(RuntimeEnvironment);
  return runtimeHostOperations({
    runtime,
    service,
    environment,
    options,
    closedSnapshot: undefined,
    shutdown: undefined,
  });
}

/** @param owner - Fully acquired generation graph. @returns The existing synchronous/Promise compatibility surface. */
function runtimeHostOperations(owner: RuntimeHostState): ServerRuntimeHost {
  const { runtime, service, environment } = owner;
  return {
    signal: environment.controller.signal,
    snapshot: () =>
      owner.closedSnapshot ??
      runExecutionSync(
        runtime,
        service.snapshot().pipe(Effect.provideService(ExecutionSuccessLogs, false)),
      ),
    setReady: (area, ready) => runExecutionSync(runtime, service.setReady(area, ready)),
    awaitReady: (area) => runtime.runPromise(service.awaitReady(area)),
    resource: runtimeHostResource(owner),
    track: (task) => runRuntimeHost(owner, service.track(task)),
    ...runtimeHostSupport(owner),
    failure: (operation, cause, cleanup = false) =>
      runtime.runSync(service.failure(new ServerRuntimeFailure({ operation, cause }), cleanup)),
    shutdown: runtimeHostShutdown(owner),
  };
}
