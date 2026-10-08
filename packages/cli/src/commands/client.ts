import { resolve } from "node:path";
import { Effect } from "effect";
import { CLI_EXIT_CODES, fail, type CliCommandContext } from "../main-support.js";
import { cliValidation } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliClient, clientLiveLayer } from "../services/client.service.js";
import { parseClientOptions } from "./client-document.js";
export type { ContractDocument } from "./client.types.js";

/**
 * Dispatches parsed client actions through the caller's client domain.
 * @param args - Existing pull/check arguments.
 * @param context - Presentation policy; stdout is written only by the established reporter.
 * @returns A lazy exit status or typed usage/protocol failure.
 */
export const runClientEffect = Effect.fn("Client.command")(
  function* (args: readonly string[], context: CliCommandContext) {
    const command = args[0];
    if (command !== "pull" && command !== "check")
      return yield* Effect.fail(
        fail(
          "RELKIT_CLIENT_USAGE",
          "Usage: relkit client <pull|check> <baseUrl> --out <directory>",
          2,
        ),
      );
    const options = yield* cliValidation(() => parseClientOptions(args.slice(1)));
    const directory = resolve(options.out);
    const client = yield* CliClient;
    if (command === "pull") {
      const result = yield* client.pull(options.baseUrl, directory);
      yield* Effect.sync(() =>
        context.reporter.output(
          result,
          `Pulled client contract ${result.graphHash} to ${directory}`,
        ),
      );
    } else {
      const result = yield* client.check(options.baseUrl, directory);
      yield* Effect.sync(() =>
        context.reporter.output(result, `Client contract ${result.publicFingerprint} is current`),
      );
    }
    return CLI_EXIT_CODES.success;
  },
  (effect, _args: readonly string[], _context: CliCommandContext) =>
    observeCli("client.command", effect),
);

/**
 * Runs the existing client command at its Promise edge with one owned graph.
 * @param args - Client arguments.
 * @param context - Reporter and caller cancellation.
 * @returns The established exit status after request/write cleanup.
 */
export function runClient(args: readonly string[], context: CliCommandContext): Promise<number> {
  return runCliEffect(runClientEffect(args, context), clientLiveLayer, context.signal);
}
