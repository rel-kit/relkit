/** Reads Linux mount authority only at the image's explicit native entry. */
import { lstat, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Effect } from "effect";
import { connectionAttempt, InspectionConnectionError } from "@relkit/inspector-api/connection";
import { validateInspectorContainer } from "./container-policy.js";
import type { InspectorOptions } from "./options.types.js";

export const requireInspectorContainer = Effect.fn("Inspector.containerMounts")(function* (
  options: InspectorOptions,
) {
  const mounts = yield* connectionAttempt("container.mounts", () =>
    readFile("/proc/self/mountinfo", "utf8"),
  );
  yield* Effect.try({
    try: () => validateInspectorContainer(options, process.getuid?.() ?? 0, mounts),
    catch: (cause) =>
      new InspectionConnectionError({
        operation: "container.invalid-mounts",
        cause: cause instanceof Error ? cause : new Error("Invalid container mounts"),
      }),
  });
  const paths = [dirname(options.connectionFile!), options.historyDirectory!];
  if (options.credentialFile) paths.push(dirname(options.credentialFile));
  for (const path of new Set(paths)) {
    const metadata = yield* connectionAttempt("container.directory", () => lstat(path));
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      return yield* new InspectionConnectionError({
        operation: "container.invalid-directory",
        cause: new Error("Mounts must be actual directories"),
      });
  }
});
