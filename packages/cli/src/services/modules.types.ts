import type { Effect, Schema } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { moduleNamespaceSchema } from "./modules.schemas.js";

/** A module namespace validated at the dynamic import boundary. */
export type ModuleNamespace = Schema.Schema.Type<typeof moduleNamespaceSchema>;

/** Module imports; only a dev-session Layer adds successful-import deduplication. */
export interface ModuleCapabilities {
  /**
   * Imports one resolved module while retaining its native namespace identity.
   * @param specifier - Absolute module URL or explicitly resolved package specifier.
   * @returns A lazy namespace import or typed adapter failure.
   */
  readonly load: (specifier: string) => Effect.Effect<ModuleNamespace, CliAdapterError>;
  /**
   * Invalidates this session's successful lookup entries after config or dependency edits.
   * @returns A lazy invalidation; no other invocation's cache is affected.
   */
  readonly invalidate: () => Effect.Effect<void>;
}
