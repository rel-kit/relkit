/**
 * Describes one session's captured authorities and synchronization primitives.
 * Only native authorities are retained; operation logging/span context belongs
 * to the executing caller and child workers retain the explicit session Scope.
 */
import type { Context, Deferred, Fiber, Queue, Ref, Scope, Semaphore } from "effect";
import type { CliCleanup } from "../services/cleanup.service.js";
import type { CliFileSystem } from "../services/filesystem.service.js";
import type { CliDevSupervisor } from "../services/dev-supervisor.service.js";
import type { CliSourceWatch } from "../services/source-watch.service.js";
import type { CliPortProbe } from "./port-availability.service.js";
import type { CleanupCapabilities } from "../services/cleanup.types.js";
import type { DevActivationRequest } from "./dev-session.types.js";
import type { CliInspectorSupport } from "./dev-inspector-support.service.js";

/** Exact capabilities fulfilled by this owner, excluding invocation context. */
export type DevEngineAuthorities =
  | CliCleanup
  | CliFileSystem
  | CliDevSupervisor
  | CliSourceWatch
  | CliPortProbe
  | CliInspectorSupport;

/** State created once per acquired engine; stop requests carry lazy joined work. */
export interface DevEngineState {
  readonly scope: Scope.Scope;
  readonly context: Context.Context<DevEngineAuthorities>;
  readonly cleanup: CleanupCapabilities;
  readonly queue: Queue.Queue<DevActivationRequest>;
  readonly requested: Deferred.Deferred<void>;
  readonly closed: Deferred.Deferred<void>;
  readonly closing: Ref.Ref<boolean>;
  readonly startup: Semaphore.Semaphore;
  readonly inspector: Ref.Ref<Fiber.Fiber<void> | undefined>;
}
