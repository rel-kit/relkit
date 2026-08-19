import { existsSync, watch } from "node:fs";
import { join, relative } from "node:path";
import { createSupervisorWatcher } from "@zsys/supervisor";
import type { DevSession } from "./dev-session.js";

export interface DevSourceWatcher {
  readonly close: () => void;
}

/** Connects project source events to the session's last-known-good activator. */
export function startDevSourceWatcher(session: DevSession): DevSourceWatcher {
  const sourceRoot = existsSync(join(session.projectRoot, "src"))
    ? join(session.projectRoot, "src")
    : session.projectRoot;
  let version = 1;
  const supervisor = createSupervisorWatcher({
    debounceMs: 75,
    compile: ({ version: nextVersion, changedFiles }) =>
      session.notifySourceChange(nextVersion, changedFiles).then(() => undefined),
  });
  const fileWatcher = watch(sourceRoot, { recursive: true }, (_event, filename) => {
    if (filename === null) return;
    const changedFile = relative(session.projectRoot, join(sourceRoot, filename.toString()));
    if (ignored(changedFile)) return;
    supervisor.notify({ version: version++, changedFiles: [changedFile] });
  });
  fileWatcher.on("error", () => undefined);
  return {
    close: () => {
      fileWatcher.close();
      supervisor.dispose();
    },
  };
}

function ignored(file: string): boolean {
  return file === "" || file.startsWith("node_modules/") || file.startsWith(".zsys/");
}
