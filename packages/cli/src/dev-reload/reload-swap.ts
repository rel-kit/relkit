/**
 * Swaps the handler table of the serving generation. Writes the new graph and the manifest,
 * rebased like `relkit build` rebases it, next to the running server's `index.ts` under
 * names that carry the source version, then sends a `relkit.dev.reload` request over the
 * candidate's IPC channel and waits for the server's acknowledgement. Nothing is published
 * when the server refuses: the previous table keeps serving and the caller restarts.
 */
import { writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Effect } from "effect";
import { cliPromise } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { rebaseManifest } from "../commands/build-support.js";
import { requestCandidate } from "../supervisor/candidate-ipc.js";
import type { CandidateMessage } from "../supervisor/candidate-ipc.types.js";
import type { DevelopmentReloadReply } from "relkit/host";
import type { SwapRequest } from "./reload.types.js";

/** Milliseconds a running server has to load and verify a new handler table. */
const SWAP_TIMEOUT_MS = 15_000;

/**
 * Writes the new generation's files beside the serving server and requests the swap.
 * @param request - Serving candidate, new check and source version.
 * @returns The server's acknowledgement; transport failures are typed.
 */
export const swapServingGeneration = Effect.fn("Dev.reload.swap")(
  function* (request: SwapRequest) {
    const { candidate, checked, version, projectRoot } = request;
    const serverDirectory = dirname(candidate.entrypoint);
    const generated = isAbsolute(checked.generatedDirectory)
      ? checked.generatedDirectory
      : resolve(projectRoot, checked.generatedDirectory);
    const manifest = `runtime.manifest.v${version}.ts`;
    const graph = `application.graph.v${version}.json`;
    const source = rebaseManifest(
      checked.outputs.manifest,
      projectRoot,
      generated,
      serverDirectory,
    );
    yield* cliPromise("dev.reload.write", () =>
      Promise.all([
        writeFile(join(serverDirectory, manifest), source),
        writeFile(join(serverDirectory, graph), checked.outputs.graph),
      ]),
    );
    return yield* cliPromise("dev.reload.request", (signal) =>
      requestCandidate<DevelopmentReloadReply & CandidateMessage>(
        candidate.process,
        { type: "relkit.dev.reload", id: version, manifest, graph },
        (message): message is DevelopmentReloadReply & CandidateMessage =>
          isReply(message, version),
        SWAP_TIMEOUT_MS,
        AbortSignal.any([signal, request.signal]),
      ),
    );
  },
  (effect) => observeCli("dev.reload.swap", effect),
);

/**
 * Recognizes the acknowledgement of one reload request.
 * @param message - IPC message from the candidate.
 * @param id - Request identity.
 * @returns Whether it acknowledges that request.
 */
function isReply(message: CandidateMessage, id: number): boolean {
  if (message === null || typeof message !== "object" || Array.isArray(message)) return false;
  const record = message as { readonly [key: string]: CandidateMessage };
  return record.type === "relkit.dev.reloaded" && record.id === id;
}
