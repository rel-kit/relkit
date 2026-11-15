// Starts the type-check watch on the runtime this script runs on, against a project whose
// `node_modules/.bin/tsgo` is a launcher that starts a long-lived child of its own (as
// `typescript` 7's launcher starts the native compiler), releases the watch's scope, and prints
// how long the release took and the pids to check. Argument: `plain` or `stubborn` (the
// launcher's child ignores SIGTERM).
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { acquireTypecheckWatch } from "../../../dist/dev-reload/typecheck-watch.js";
import { cleanupLayer } from "../../../dist/services/cleanup.service.js";

const stubborn = process.argv[2] === "stubborn";
const root = mkdtempSync(join(tmpdir(), "relkit-watch-release-"));
const pids = join(root, "pids.json");
writeFileSync(join(root, "tsconfig.json"), "{}\n");
mkdirSync(join(root, "node_modules/.bin"), { recursive: true });
const launcher = join(root, "node_modules/.bin/tsgo");
writeFileSync(
  launcher,
  `#!/usr/bin/env node
const { spawn } = require("node:child_process");
const body = ${JSON.stringify(
    // The child reports the pids once its signal handling is in place, so the release never races its start.
    `${stubborn ? "process.on('SIGTERM', () => {});" : ""}` +
      `require('node:fs').writeFileSync(process.env.PIDS_FILE, JSON.stringify({ launcher: process.ppid, child: process.pid }));` +
      "setInterval(() => process.stdout.write('.'), 100)",
  )};
// The child inherits standard output, as the native compiler does, and outlives a signal to the launcher.
const child = spawn(process.execPath, ["-e", body], { stdio: ["ignore", "inherit", "ignore"] });
child.on("exit", (code) => process.exit(code ?? 1));
`,
);
chmodSync(launcher, 0o755);
process.env.PIDS_FILE = pids;

const log = () => undefined;
let released = 0;
await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      yield* acquireTypecheckWatch(root, log);
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        try {
          readFileSync(pids);
          break;
        } catch {
          yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 20)));
        }
      }
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          released = Date.now();
        }),
      );
    }),
  ).pipe(Effect.provide(cleanupLayer)),
);
const releaseMs = Date.now() - released;
process.stdout.write(
  `${JSON.stringify({ releaseMs, ...JSON.parse(readFileSync(pids, "utf8")) })}\n`,
);
// A reader left behind would keep this process alive: the test requires a timely exit.
