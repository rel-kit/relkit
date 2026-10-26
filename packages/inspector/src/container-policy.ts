/** Restricts image execution to a private directory mount and persistent history. */
import { dirname } from "node:path";
import type { InspectorOptions } from "./options.types.js";

export function validateInspectorContainer(
  options: InspectorOptions,
  uid: number,
  mountInfo: string,
): void {
  if (options.port !== 3210)
    throw new TypeError(
      "Inspector containers use internal UI port 3210; change the published host port instead",
    );
  if (!Number.isSafeInteger(uid) || uid <= 0)
    throw new TypeError("Inspector containers require a non-root user");
  if (!options.connectionFile || !options.historyDirectory)
    throw new TypeError(
      "Inspector containers require explicit --connection-file and --history-directory",
    );
  if (Buffer.byteLength(mountInfo) > 1_048_576)
    throw new TypeError("Container mount metadata exceeds its bound");
  const mounts = mountInfo.split("\n").map((line) => {
    const [head, tail] = line.split(" - ");
    const fields = head?.split(" ") ?? [];
    return {
      path: unescapeMount(fields[4] ?? ""),
      flags: fields[5]?.split(",") ?? [],
      type: tail?.split(" ")[0],
    };
  });
  const directories = new Set(
    [options.connectionFile, ...(options.credentialFile ? [options.credentialFile] : [])].map(
      dirname,
    ),
  );
  for (const path of directories) {
    if (path === "/" || !mounts.some((mount) => mount.path === path && mount.flags.includes("ro")))
      throw new TypeError(
        "Connection credentials require a read-only directory mount; file-only mounts cannot observe rotation",
      );
  }
  if (
    options.historyDirectory === "/" ||
    !mounts.some(
      (mount) =>
        mount.path === options.historyDirectory &&
        mount.flags.includes("rw") &&
        !["tmpfs", "ramfs", "overlay"].includes(mount.type ?? ""),
    )
  )
    throw new TypeError("History requires an explicit persistent writable directory mount");
}

function unescapeMount(value: string): string {
  return value.replace(/\\(040|011|012|134)/g, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  );
}
