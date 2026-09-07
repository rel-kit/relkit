import { existsSync, readdirSync, unwatchFile, watch, watchFile, type Stats } from "node:fs";
import { join, relative } from "node:path";
import { createSupervisorWatcher } from "@relkit/supervisor";
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
    compile: async ({ version: nextVersion, changedFiles }) => {
      if (scaffolding(session.projectRoot)) {
        supervisor.notify({ version: version++, changedFiles });
        return;
      }
      await session.notifySourceChange(nextVersion, changedFiles);
    },
  });
  const fileWatcher = watch(sourceRoot, { recursive: true }, (_event, filename) => {
    if (filename === null) return;
    const changedFile = relative(session.projectRoot, join(sourceRoot, filename.toString()));
    if (ignored(changedFile) || changedFile === relative(session.projectRoot, sourceRoot)) return;
    supervisor.notify({ version: version++, changedFiles: [changedFile] });
  });
  fileWatcher.on("error", () => undefined);
  const configWatcher =
    sourceRoot === session.projectRoot
      ? undefined
      : watch(session.projectRoot, (_event, filename) => {
          if (
            filename !== null &&
            ["relkit.config.ts", "package.json", "bun.lock"].includes(filename.toString())
          )
            supervisor.notify({ version: version++, changedFiles: [filename.toString()] });
        });
  configWatcher?.on("error", () => undefined);
  // Bun's Linux directory watcher can miss hidden-file creation.
  const envWatchers = [".env", ".env.local"].map((file) => {
    const path = join(session.projectRoot, file);
    const listener = (current: Stats, previous: Stats) => {
      if (current.mtimeMs !== previous.mtimeMs || current.ctimeMs !== previous.ctimeMs)
        supervisor.notify({ version: version++, changedFiles: [file] });
    };
    watchFile(path, { interval: 100 }, listener);
    return () => unwatchFile(path, listener);
  });
  return {
    close: () => {
      fileWatcher.close();
      configWatcher?.close();
      for (const close of envWatchers) close();
      supervisor.dispose();
    },
  };
}

function ignored(file: string): boolean {
  return (
    file === "" ||
    file === ".env" ||
    file === ".env.local" ||
    file.startsWith("node_modules/") ||
    file.startsWith(".relkit/") ||
    /^\.relkit-scaffold-/.test(file) ||
    /\.relkit-[\da-f-]+\.tmp$/.test(file)
  );
}

function scaffolding(root: string): boolean {
  return readdirSync(root).some((file) => {
    const match = /^\.relkit-scaffold-(\d+)-[\da-f-]+\.tmp$/.exec(file);
    if (!match || Number(match[1]) <= 0) return false;
    try {
      process.kill(Number(match[1]), 0);
      return true;
    } catch (error) {
      // A crashed CLI must never leave dev permanently paused.
      return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  });
}
