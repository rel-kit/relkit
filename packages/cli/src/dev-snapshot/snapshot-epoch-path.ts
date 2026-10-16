/** Recognizes source and runtime dotenv events without admitting example files or generated state. */
import { isDevelopmentEnvironmentFile } from "../commands/dev-environment-files.js";

/**
 * Selects events that invalidate prepared activation or schedule safe recompilation.
 * @param path - Project-relative native event path; file bytes are never captured here.
 * @returns Whether the input change requires another candidate.
 */
export function isSnapshotEpochPathRelevant(path: string): boolean {
  if (isDevelopmentEnvironmentFile(path)) return true;
  const first = path.replaceAll("\\", "/").split("/")[0];
  return (
    first === undefined ||
    (![".git", ".relkit", ".next"].includes(first) &&
      first !== ".env" &&
      !first.startsWith(".env."))
  );
}
