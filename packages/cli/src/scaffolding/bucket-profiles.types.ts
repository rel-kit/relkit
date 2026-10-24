/** Discovers bucket provider profile choices and validates their backend selections for existing-project resource planning. This companion contains the shared planning contracts without executing work. */

import type { Effect } from "effect";
import type { ProjectDiscovery } from "./project-discovery-types.js";
import type {
  GeneratorDomainError,
  GeneratorIoError,
} from "create-relkit/internal/generator-errors";
import type { GeneratorFileSystem } from "create-relkit/internal/generator-filesystem";

/** Facts needed to establish physical bucket ownership. */
export type BucketDiscovery = Pick<ProjectDiscovery, "projectRoot" | "artifacts" | "profiles">;

/** Source authority supplied by the request planner or native filesystem adapter. */
export type BucketSourceReader = (
  path: string,
) => Effect.Effect<string, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem>;
