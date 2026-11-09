/** Captured host resources; native callbacks read this generation state at execution time. */
import type { makeServerHostRuntime } from "./runtime-host-acquisition.js";
import type {
  RuntimeEnvironmentOperations,
  RuntimeEnvironmentOptions,
  RuntimeSnapshot,
  ServerRuntimeOperations,
} from "./server-runtime.types.js";

/** Runtime disposal and closed snapshot belong to the same explicit host owner. */
export interface RuntimeHostState {
  readonly runtime: ReturnType<typeof makeServerHostRuntime>;
  readonly service: ServerRuntimeOperations;
  readonly environment: RuntimeEnvironmentOperations;
  readonly options: RuntimeEnvironmentOptions;
  closedSnapshot: RuntimeSnapshot | undefined;
  shutdown: Promise<RuntimeSnapshot> | undefined;
}
