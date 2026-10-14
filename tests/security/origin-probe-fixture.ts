/** Owns ephemeral native listeners, private probe copies and joined children; archived evidence is read only and production destination policy is unchanged. */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { ownedNativePromise } from "@relkit/cli/internal/tooling";
import { observeExecution } from "@relkit/contracts/operation";
import { scaffoldChild } from "../../scripts/scaffold-process.js";
import { originProbeResult } from "./origin-probe.schemas.js";

/** Original historical script; unapproved-destination checks execute these exact bytes. */
export const archivedProbe = new URL(
  "../../openspec/changes/archive/2026-10-05-effect-specialized-packages/completion-2026-10-05-1791190554/foreign-origin.mjs",
  import.meta.url,
).pathname;

/** Acquires a private evidence directory and joins removal on every exit.
 * @returns Caller-scoped native temporary root.
 */
export const probeDirectory = Effect.fn("Security.probeDirectory")(() =>
  Effect.acquireRelease(
    ownedNativePromise("security.probe.directory", () =>
      mkdtemp(join(tmpdir(), "relkit-origin-probe-")),
    ),
    (root) =>
      ownedNativePromise("security.probe.release", () =>
        rm(root, { recursive: true, force: true }),
      ).pipe(Effect.orDie),
  ),
);

/** Acquires exclusively owned loopback traffic without reserving another application's port.
 * @param fetch - Original native test HTTP/WebSocket behavior.
 * @returns Caller-scoped actual listener; release awaits physical shutdown.
 */
export const serveProbe = Effect.fn("Security.serveProbe")(
  (fetch: (request: Request) => Response) =>
    Effect.acquireRelease(
      Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0, fetch })),
      (server) => Effect.promise(() => server.stop(true)),
    ),
);

/** Projects only three literal occurrences of one recorded host/port into an owned native fixture.
 * @param evidence - Private directory owned by the caller's Scope.
 * @param recordedPort - One of the two unchanged historical allowlist branches.
 * @param actualPort - Actual already-acquired ephemeral listener.
 * @returns Private script path; all original checks, headers, IDs and redirect policy remain verbatim.
 */
export const projectRecordedProbe = Effect.fn("Security.projectRecordedProbe")(function* (
  evidence: string,
  recordedPort: 3000 | 3330,
  actualPort: number | undefined,
) {
  if (actualPort === undefined) return yield* Effect.die(new Error("Owned listener has no port"));
  const original = yield* ownedNativePromise("security.probe.source", () =>
    readFile(archivedProbe, "utf8"),
  );
  const needle = `127.0.0.1:${recordedPort}`;
  if (original.split(needle).length !== 4)
    return yield* Effect.die(new Error("Historical probe destination contract changed"));
  const script = join(evidence, `probe-${actualPort}.mjs`);
  yield* ownedNativePromise("security.probe.project", () =>
    writeFile(script, original.replaceAll(needle, `127.0.0.1:${actualPort}`)),
  );
  return script;
});

/** Runs the original probe contract and joins exit plus both original output streams.
 * @param script - Historical guard or its explicit private destination projection.
 * @param base - Supplied destination, including deliberate rejected inputs.
 * @param evidence - Caller-owned output directory.
 * @returns Original native exit status/stdout/stderr; rejected destinations remain nonzero.
 */
export const runProbe = Effect.fn("Security.runProbe")(
  (script: string, base: string | undefined, evidence: string) =>
    observeExecution(
      "testing",
      "security.origin-probe",
      Effect.scoped(
        Effect.gen(function* () {
          const env = {
            RELKIT_AI_EVIDENCE_DIR: evidence,
            RELKIT_ORIGIN_PROBE_URL: base ?? "",
          };
          const child = yield* scaffoldChild({ args: [script], cwd: evidence, env });
          const [exit, stdout, stderr] = yield* Effect.promise(() => child.settled);
          if (
            exit.status !== "fulfilled" ||
            stdout.status !== "fulfilled" ||
            stderr.status !== "fulfilled"
          )
            return yield* Effect.die(new Error("Original security probe output did not settle"));
          return { exitCode: exit.value, stdout: stdout.value, stderr: stderr.value };
        }),
      ),
    ),
);

/** Decodes original result bytes immediately at the native file boundary.
 * @param evidence - Private output directory supplied to the original script.
 * @returns Precise selected-origin and transport-denial observations.
 */
export const readProbeResult = Effect.fn("Security.readProbeResult")(function* (evidence: string) {
  const bytes = yield* ownedNativePromise("security.probe.result", () =>
    readFile(join(evidence, "foreign-origin-results.json"), "utf8"),
  );
  return yield* Effect.try({
    try: () => Schema.decodeUnknownSync(originProbeResult)(JSON.parse(bytes)),
    catch: (cause) => new Error("Invalid original security observation", { cause }),
  });
});
