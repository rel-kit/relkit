/** Defines the workspace metadata used to verify fixture registry candidate identities. */
import type { Manifest } from "./scaffold-process.types.js";

/** Current source directories and manifests indexed by their published package name. */
export type Sources = ReadonlyMap<string, { directory: string; manifest: Manifest }>;
