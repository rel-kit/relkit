/** Uses the generator's read-only planning API and the CLI's native command model. */
import { findCliHelp } from "@relkit/cli/help";
import { normalizeCreateOptions, planCreate } from "create-relkit";

/** Reads a minimal application's planned files without creating or installing a project.
 * @param cwd - Parent directory in which a future project would be created.
 * @returns Validated file/dependency preview; no project files are written. */
export async function previewOrders(cwd: string) {
  const options = normalizeCreateOptions([
    "relkit-orders",
    "--template",
    "minimal",
    "--no-install",
    "--no-git",
  ]);
  return planCreate(options, { cwd });
}

export const checkHelp = findCliHelp(["check"]);
