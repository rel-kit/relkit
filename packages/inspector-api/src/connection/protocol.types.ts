/**
 * Shares schema-derived session identities and explicit filesystem capabilities.
 * The bridge publishes authority; the tool reads it without executing project
 * configuration. Only the owning session may remove its descriptor.
 */
import type { Effect } from "effect";
import type { Schema } from "effect";
import type { InspectionDescriptorSchema, InspectionHandshakeSchema } from "./protocol.schemas.js";
import type { InspectionConnectionError } from "./connection-error.js";

/** Validated private metadata; never serialize this into browser responses. */
export interface InspectionDescriptor extends Schema.Schema.Type<
  typeof InspectionDescriptorSchema
> {}

/** Public result of authenticating a compatible running session. */
export interface InspectionHandshake extends Schema.Schema.Type<typeof InspectionHandshakeSchema> {}

/** A validated descriptor together with its operator-selected file. */
export interface InspectionConnectionFile {
  readonly path: string;
  readonly descriptor: InspectionDescriptor;
}

/** Invalid files are counted without preventing compatible sessions from being probed. */
export interface InspectionFileListing {
  readonly files: readonly InspectionConnectionFile[];
  readonly rejected: number;
}

/** Session-safe discovery I/O; all native failures remain typed. */
export interface InspectionFilesOperations {
  readonly projectId: (root: string) => Effect.Effect<string, InspectionConnectionError>;
  readonly publish: (
    root: string,
    descriptor: InspectionDescriptor,
  ) => Effect.Effect<string, InspectionConnectionError>;
  readonly read: (
    path: string,
  ) => Effect.Effect<InspectionConnectionFile, InspectionConnectionError>;
  readonly list: (root: string) => Effect.Effect<InspectionFileListing, InspectionConnectionError>;
  readonly removeOwned: (
    path: string,
    descriptor: InspectionDescriptor,
  ) => Effect.Effect<boolean, InspectionConnectionError>;
}
