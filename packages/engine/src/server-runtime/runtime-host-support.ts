/** Native batch, worker, retry and cleanup adapters retain physical completion tracking. */
import { Effect } from "effect";
import { ExecutionSuccessLogs } from "@relkit/contracts/operation";
import {
  externalRuntimeCallback,
  runRuntimeHost,
  trackRuntimeHostCallback,
} from "./runtime-host-native.js";
import type { RuntimeHostState } from "./runtime-host-state.types.js";
import type { ServerRuntimeHost } from "./server-runtime-host.types.js";

/** @param owner - Host generation. @returns Worker and cleanup portions of the native host boundary. */
export function runtimeHostSupport(
  owner: RuntimeHostState,
): Pick<ServerRuntimeHost, "each" | "worker" | "retry" | "providerDelay" | "cleanup"> {
  const { service, runtime } = owner;
  return {
    each: (values, task) =>
      runRuntimeHost(
        owner,
        service.each(values, (value) =>
          externalRuntimeCallback(owner, "job-worker", async () => {
            await trackRuntimeHostCallback(owner, () => task(value));
          }),
        ),
      ),
    worker: (operation, pass) =>
      runRuntimeHost(
        owner,
        service.worker(
          operation,
          externalRuntimeCallback(owner, operation, async () => {
            await trackRuntimeHostCallback(owner, pass);
          }).pipe(Effect.provideService(ExecutionSuccessLogs, false)),
        ),
      ),
    retry: (operation, action) =>
      runRuntimeHost(
        owner,
        service.retry(
          operation,
          externalRuntimeCallback(owner, operation, async () => {
            await trackRuntimeHostCallback(owner, action);
          }),
        ),
      ),
    providerDelay: () => runtime.runPromise(service.providerDelay()),
    cleanup: (operation, task) =>
      runRuntimeHost(
        owner,
        service.cleanup(operation, externalRuntimeCallback(owner, operation, task)),
      ),
  };
}
