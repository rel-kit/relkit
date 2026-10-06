import type { Deferred, Ref } from "effect";
import type { CliAdapterError } from "../cli-errors.js";

/** Native completion state installed before spawning or starting response drains. */
export interface OwnedStartedProcess {
  readonly child: Bun.ReadableSubprocess;
  readonly stopping: Ref.Ref<boolean>;
  readonly stopped: Deferred.Deferred<void, CliAdapterError>;
  readonly drains: Ref.Ref<readonly Promise<void>[]>;
}
