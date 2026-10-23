/** Composes project checking and build capability layers at their execution boundaries. */
import { Layer } from "effect";
import { compilerLayer } from "./compiler.service.js";
import { fileSystemLayer } from "./filesystem.service.js";
import { moduleLayer } from "./modules.service.js";
import { processLayer } from "./process.service.js";
import { cleanupLayer } from "./cleanup.service.js";
import {
  DependencySourceLive,
  SelectedDependenciesLive,
} from "@relkit/provider/internal/dependencies";

/** Invocation-owned project execution graph; service workflows never build this Layer themselves. */
export const projectCapabilitiesLayer = Layer.mergeAll(
  compilerLayer,
  fileSystemLayer,
  moduleLayer,
  SelectedDependenciesLive,
);

/** Adds build subprocess authority to the project capability graph at the execution edge. */
export const buildCapabilitiesLayer = Layer.mergeAll(
  projectCapabilitiesLayer,
  processLayer,
  DependencySourceLive,
).pipe(Layer.provideMerge(cleanupLayer));
