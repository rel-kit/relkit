/**
 * Separates inspector support lifetime from backend generation readiness.
 * The session owner runs this capability in a background Scope and interrupts
 * it before completing shutdown; failed support cannot stop backend traffic.
 */
import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { DevSession } from "./dev-session.js";

/** Replaceable long-lived support operation for native and deterministic test Layers. */
export interface DevInspectorSupportOperations {
  readonly run: (session: DevSession) => Effect.Effect<void, CliAdapterError>;
}
