/** Whether a native project-relative event can affect reusable compilation inputs. */
export function isSnapshotEpochPathRelevant(path: string): boolean {
  const first = path.replaceAll("\\", "/").split("/")[0];
  return (
    first === undefined ||
    (![".git", ".relkit", ".next"].includes(first) &&
      first !== ".env" &&
      !first.startsWith(".env."))
  );
}
