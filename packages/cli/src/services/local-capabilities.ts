import { Layer } from "effect";
import { projectLiveLayer } from "./project.service.js";
import { compilerLayer } from "./compiler.service.js";
import { fileSystemLayer } from "./filesystem.service.js";
import { sessionModuleLayer } from "./modules.service.js";
import { cleanupLayer } from "./cleanup.service.js";

/** Invocation-owned local authorities, including only session-local namespace reuse. */
export const localCapabilitiesLayer = Layer.mergeAll(
  projectLiveLayer,
  compilerLayer,
  fileSystemLayer,
  sessionModuleLayer,
  cleanupLayer,
);
