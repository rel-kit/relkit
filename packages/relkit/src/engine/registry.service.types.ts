import type { createContextEffect } from "./context.js";
import type { buildDependencyClientsEffect } from "./dependencies.js";
import type { createFunctionRegistryEffect } from "./registry.js";

/** Graph/manifest verification contract for runtime composition. */
export interface FunctionRegistryOperations {
  readonly create: typeof createFunctionRegistryEffect;
}

/** Declared client and invocation context operations. */
export interface DependencyOperations {
  readonly clients: typeof buildDependencyClientsEffect;
  readonly context: typeof createContextEffect;
}
