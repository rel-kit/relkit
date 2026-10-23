/** Removes only established flat/grouped example paths from an owned staged template while preserving the useful hello service and function. */

import { join } from "node:path";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";

/** Canonical example-only paths removed by the existing --no-examples flag. */
export const EXAMPLE_PATH_PREFIXES = [
  "src/routes",
  "src/orders",
  "src/services/orders",
  "src/echo",
  "src/services/echo",
  "src/hello/tools",
  "src/services/hello/tools",
  "src/hello/agents",
  "src/services/hello/agents",
  "tests",
] as const;

/**
 * Removes only the established template examples, with ordered physical settlement.
 * @param root - Absolute project or owned resource root.
 * @returns Completion after the known example source directories are removed from the staged project.
 */
export const removeExamplesEffect = Effect.fn("ProjectFiles.removeExamples")(
  function* (root: string) {
    const fs = yield* GeneratorFileSystem;
    yield* Effect.forEach(EXAMPLE_PATH_PREFIXES, (directory) =>
      fs.remove(join(root, directory), { recursive: true, force: true }),
    );
  },
  (effect) => observeExecution("generator", "generation.removeExamples", effect),
);
