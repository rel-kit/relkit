import type { Effect } from "effect";
import type { ProjectDiscovery } from "./project-discovery-types.js";
import type { GeneratorDomainError, GeneratorIoError } from "./generator-errors.js";
import type { GeneratorFileSystem } from "./generator-filesystem.js";

/** Facts needed to establish physical bucket ownership. */
export type BucketDiscovery = Pick<ProjectDiscovery, "projectRoot" | "artifacts" | "profiles">;

/** Source authority supplied by the request planner or native filesystem adapter. */
export type BucketSourceReader = (
  path: string,
) => Effect.Effect<string, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem>;
