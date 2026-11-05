import { access, mkdir } from "node:fs/promises";
import { Context, Layer } from "effect";
import { cleanupCandidate, resolvePort, terminate } from "./candidate-process.js";
import { captureOutput } from "./candidate-output.js";
import { dispatchCandidateMessage, type CandidateMessage } from "./candidate-ipc.js";
import type { RuntimeSubprocess } from "relkit/runtime";
import { runtime, scriptCommand } from "../runtime/index.js";
import type { CandidatePlatformService } from "./candidate-service.types.js";

/** Acquired native boundary, with identical live/test platform contracts. */
export class CandidatePlatform extends Context.Service<
  CandidatePlatform,
  CandidatePlatformService
>()("relkit/supervisor/CandidatePlatform") {}

/** Filesystem/process adapters only; acquisition never starts a process or compilation. */
export const CandidatePlatformLive = Layer.succeed(
  CandidatePlatform,
  CandidatePlatform.of({
    directory: async (context) => {
      await mkdir(context.directoryRoot, { recursive: true });
      await mkdir(context.directory);
    },
    access,
    cleanup: cleanupCandidate,
    port: resolvePort,
    spawn: (entrypoint, options, environment) => {
      const child: RuntimeSubprocess = runtime.processes.spawn(scriptCommand(entrypoint), {
        cwd: options.projectRoot,
        env: environment,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        // The dev reload path swaps a running candidate's handler table over this channel.
        ipc: (message) => dispatchCandidateMessage(child, message as CandidateMessage),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      return child;
    },
    stop: terminate,
    output: (child, options, directory, limit, signal) =>
      captureOutput(child, options.logger, options.token, directory, limit, signal),
  }),
);
