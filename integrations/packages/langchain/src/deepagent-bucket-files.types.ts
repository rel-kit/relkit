/** Collects bucket-backed file entries for native filesystem operations after path normalization, keeping metadata separate from fetched file content. This companion preserves the native input and output types without starting runtime work. */

import type { FileData } from "deepagents";
export type * from "./deepagent-bucket-client.types.js";

/** DeepAgents file payload that carries a concrete MIME type. */
export type DeepAgentBucketFileData = Extract<FileData, { readonly mimeType: string }>;
