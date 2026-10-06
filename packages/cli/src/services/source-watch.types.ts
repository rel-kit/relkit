import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";

/** Native watcher authority; returned stops belong to the caller's Scope. */
export interface SourceWatchOperations {
  /**
   * Opens one native directory watcher without retrying native failures.
   * @param path - Authored directory to observe.
   * @param recursive - Whether descendant edits are admitted.
   * @param change - Native filename callback; it only enqueues typed work.
   * @param failure - Native error callback; it only requests supervised shutdown.
   * @returns An owned synchronous stop after watcher acquisition succeeds.
   */
  readonly watch: (
    path: string,
    recursive: boolean,
    change: (filename: string) => void,
    failure: (reason: unknown) => void,
  ) => Effect.Effect<() => void, CliAdapterError>;
  /**
   * Polls a possibly absent environment file with its own listener identity.
   * @param path - Accepted environment path.
   * @param change - Native callback admitting an edit.
   * @returns An owned stop that removes only this watcher registration.
   */
  readonly poll: (path: string, change: () => void) => Effect.Effect<() => void, CliAdapterError>;
}
