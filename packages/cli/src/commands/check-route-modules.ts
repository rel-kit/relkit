import { join } from "node:path";
import {
  generateRouteModuleChecks,
  ROUTE_MODULE_CHECKS_FILE,
  writeIfChanged,
} from "@relkit/compiler";

/** Updates route contracts even when evaluation fails, so TypeScript can report bad exports. */
export function writeRouteModuleChecks(
  files: readonly string[],
  projectRoot: string,
  generatedDirectory: string,
): Promise<unknown> {
  return writeIfChanged(
    join(projectRoot, generatedDirectory, ROUTE_MODULE_CHECKS_FILE),
    generateRouteModuleChecks(files, projectRoot, generatedDirectory),
  );
}
