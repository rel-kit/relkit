import { Layer } from "effect";
import { compilerLayer } from "./compiler.service.js";
import { fileSystemLayer } from "./filesystem.service.js";
import { moduleLayer } from "./modules.service.js";
import { processLayer } from "./process.service.js";
import { cleanupLayer } from "./cleanup.service.js";

/** Invocation-owned project execution graph; service workflows never build this Layer themselves. */
export const projectCapabilitiesLayer = Layer.mergeAll(compilerLayer, fileSystemLayer, moduleLayer);

/** Adds build subprocess authority to the project capability graph at the execution edge. */
export const buildCapabilitiesLayer = Layer.merge(projectCapabilitiesLayer, processLayer).pipe(
  Layer.provideMerge(cleanupLayer),
);
