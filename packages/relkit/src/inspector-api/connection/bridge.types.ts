/**
 * Defines session bridge authority independently of any UI, database or compiler.
 * A target is read from the committed development generation for each operation;
 * forwarding never retries mutations or substitutes another generation mid-call.
 */
import type { Effect, Scope } from "effect";
import type { InspectionConnectionError } from "./connection-error.js";
import type { InspectionDescriptor } from "./protocol.types.js";

/** Already validated application generation, owned by its development session. */
export interface InspectionTarget {
  readonly generationId: string;
  readonly endpoint: string;
  readonly capabilities: readonly string[];
}

/** Live operations borrow the application; no provider or handler is imported here. */
export interface InspectionBridgeAuthority {
  readonly active: () => InspectionTarget | undefined;
  readonly forward: (
    target: InspectionTarget,
    request: Request,
  ) => Effect.Effect<Response, InspectionConnectionError>;
  readonly records?: (request: Request) => Effect.Effect<Response, InspectionConnectionError>;
}

/** Native listener host selection comes only from validated application settings. */
export interface InspectionListenOptions {
  readonly host: string;
  readonly port: number;
}

/** Server adapters own their listener and HTTP operation fibers in caller Scope. */
export interface InspectionNativeOperations {
  readonly listen: (
    options: InspectionListenOptions,
    handler: (request: Request) => Effect.Effect<Response>,
  ) => Effect.Effect<string, InspectionConnectionError, Scope.Scope>;
  readonly forward: InspectionBridgeAuthority["forward"];
}

/** One start acquires a single listener and a private descriptor for its session. */
export interface InspectionBridgeOptions extends InspectionListenOptions {
  readonly root: string;
  readonly identity?: Pick<InspectionDescriptor, "sessionId" | "token">;
  readonly active: InspectionBridgeAuthority["active"];
  readonly forward?: InspectionBridgeAuthority["forward"];
  readonly records?: InspectionBridgeAuthority["records"];
}

/** Acquired session identity; credentials remain server-side. */
export interface InspectionBridgeHandle {
  readonly descriptor: InspectionDescriptor;
  readonly path: string;
}

/** Bridge acquisition is independent from backend/provider readiness. */
export interface InspectionBridgeOperations {
  readonly start: (
    options: InspectionBridgeOptions,
  ) => Effect.Effect<InspectionBridgeHandle, InspectionConnectionError, Scope.Scope>;
}
