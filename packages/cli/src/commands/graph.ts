import { canonicalGraphJson } from "@relkit/graph";
import { Effect } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { graphFilesLayer } from "./graph-file.service.js";
import type { ParsedGraphArgs } from "./graph.types.js";
import { CLI_EXIT_CODES, type CliCommandContext } from "../main-support.js";
import {
  checkGraphEffect,
  diffGraphFilesEffect,
  GraphCommandError,
  printGraphEffect,
  type GraphDiffResult,
  type GraphFileOptions,
} from "./graph-support.js";

export * from "./graph-support.js";

/**
 * Runs graph commands through the existing reporter and exit-code boundary.
 * @param args - Graph subcommand and flags.
 * @param context - Existing output presentation policy.
 * @returns Established success, failure, or usage exit status.
 */
export async function runGraph(
  args: readonly string[],
  context: Pick<CliCommandContext, "json" | "reporter">,
): Promise<number> {
  try {
    return await runCliEffect(runGraphEffect(args, context), graphFilesLayer);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? String(error.code) : "RELKIT_GRAPH_FAILED";
    context.reporter.error(code, error instanceof Error ? error.message : String(error));
    return code === "RELKIT_GRAPH_USAGE" ? CLI_EXIT_CODES.usage : CLI_EXIT_CODES.failure;
  }
}

/**
 * Composes graph operations lazily without starting a nested runtime.
 * @param args - Graph subcommand and flags.
 * @param context - Existing reporter, receiving unchanged result shapes.
 * @returns A lazy reported exit code requiring CliGraphFiles.
 */
export const runGraphEffect = Effect.fn("Graph.command")(
  function* (args: readonly string[], context: Pick<CliCommandContext, "json" | "reporter">) {
    const parsed = yield* cliTry("graph.args", () => parseArgs(args));
    if (parsed.command === "print") {
      const result = yield* printGraphEffect(fileOptions(parsed));
      context.reporter.output(result, canonicalGraphJson(result.graph));
      return CLI_EXIT_CODES.success;
    }
    if (parsed.command === "check") {
      const result = yield* checkGraphEffect({
        ...fileOptions(parsed),
        ...(parsed.expectedHash === undefined ? {} : { expectedHash: parsed.expectedHash }),
      });
      context.reporter.output(result, `Graph is valid. Hash: ${result.graphHash}`);
      return CLI_EXIT_CODES.success;
    }
    const result = yield* diffGraphFilesEffect(
      parsed.paths[0]!,
      parsed.paths[1]!,
      fileOptions(parsed),
    );
    context.reporter.output(result, formatDiff(result));
    return CLI_EXIT_CODES.success;
  },
  (effect) => observeCli("graph.command", effect),
);

/**
 * Parses graph arguments without filesystem or module authority.
 * @param args - Literal command arguments.
 * @returns Validated graph argument selection.
 * @throws GraphCommandError for usage errors.
 */
function parseArgs(args: readonly string[]): ParsedGraphArgs {
  const command = args[0];
  if (command !== "print" && command !== "check" && command !== "diff")
    throw new GraphCommandError(
      "RELKIT_GRAPH_USAGE",
      "Usage: relkit graph print|check|diff [paths]",
    );
  const paths: string[] = [];
  let expectedHash: string | undefined;
  let projectRoot: string | undefined;
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--hash" || arg === "--project-root") {
      const value = args[++i];
      if (value === undefined || value.startsWith("-"))
        throw new GraphCommandError("RELKIT_GRAPH_USAGE", `${arg} requires a value.`);
      if (arg === "--hash") expectedHash = value;
      else projectRoot = value;
    } else if (arg?.startsWith("-"))
      throw new GraphCommandError("RELKIT_GRAPH_USAGE", `Unknown graph option: ${arg}`);
    else if (arg !== undefined) paths.push(arg);
  }
  const count = command === "diff" ? 2 : 1;
  if (paths.length > count || (command === "diff" && paths.length !== count))
    throw new GraphCommandError(
      "RELKIT_GRAPH_USAGE",
      command === "diff"
        ? "Graph diff requires before and after paths."
        : `Expected at most ${count} graph path.`,
    );
  return {
    command,
    paths,
    ...(expectedHash === undefined ? {} : { expectedHash }),
    ...(projectRoot === undefined ? {} : { projectRoot }),
  };
}

/**
 * Selects one artifact from validated arguments.
 * @param args - Parsed command arguments.
 * @param index - Artifact position, defaulting to the first.
 * @returns Optional root and path without default materialization.
 */
function fileOptions(args: ParsedGraphArgs, index = 0): GraphFileOptions {
  return {
    ...(args.projectRoot === undefined ? {} : { projectRoot: args.projectRoot }),
    ...(args.paths[index] === undefined ? {} : { graphPath: args.paths[index] }),
  };
}

/**
 * Formats compatibility changes with the existing human output layout.
 * @param result - Validated compatibility result.
 * @returns Stable human-readable lines.
 */
function formatDiff(result: GraphDiffResult): string {
  const lines = [`Before: ${result.beforeHash}`, `After: ${result.afterHash}`];
  if (result.changes.length === 0) return [...lines, "No compatibility changes."].join("\n");
  lines.push(`Highest classification: ${result.highestClassification ?? "none"}`);
  for (const change of result.changes)
    lines.push(`${change.classification}: ${change.category} ${change.id} (${change.change})`);
  return lines.join("\n");
}
