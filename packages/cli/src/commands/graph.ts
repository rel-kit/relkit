import { canonicalGraphJson } from "@relkit/graph";
import { CLI_EXIT_CODES, type CliCommandContext } from "../main-support.js";
import {
  checkGraph,
  diffGraphFiles,
  GraphCommandError,
  printGraph,
  type GraphDiffResult,
  type GraphFileOptions,
} from "./graph-support.js";

export * from "./graph-support.js";

/** Runs `relkit graph print|check|diff` through the shared CLI reporter. */
export async function runGraph(
  args: readonly string[],
  context: Pick<CliCommandContext, "json" | "reporter">,
): Promise<number> {
  try {
    const parsed = parseArgs(args);
    if (parsed.command === "print") {
      const result = await printGraph(fileOptions(parsed));
      context.reporter.output(result, canonicalGraphJson(result.graph));
      return CLI_EXIT_CODES.success;
    }
    if (parsed.command === "check") {
      const result = await checkGraph({
        ...fileOptions(parsed),
        ...(parsed.expectedHash === undefined ? {} : { expectedHash: parsed.expectedHash }),
      });
      context.reporter.output(result, `Graph is valid. Hash: ${result.graphHash}`);
      return CLI_EXIT_CODES.success;
    }
    const result = await diffGraphFiles(parsed.paths[0]!, parsed.paths[1]!, fileOptions(parsed));
    context.reporter.output(result, formatDiff(result));
    return CLI_EXIT_CODES.success;
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? String(error.code) : "RELKIT_GRAPH_FAILED";
    context.reporter.error(code, error instanceof Error ? error.message : String(error));
    return code === "RELKIT_GRAPH_USAGE" ? CLI_EXIT_CODES.usage : CLI_EXIT_CODES.failure;
  }
}

type ParsedArgs = {
  readonly command: "print" | "check" | "diff";
  readonly paths: readonly string[];
  readonly expectedHash?: string;
  readonly projectRoot?: string;
};

function parseArgs(args: readonly string[]): ParsedArgs {
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

function fileOptions(args: ParsedArgs, index = 0): GraphFileOptions {
  return {
    ...(args.projectRoot === undefined ? {} : { projectRoot: args.projectRoot }),
    ...(args.paths[index] === undefined ? {} : { graphPath: args.paths[index] }),
  };
}

function formatDiff(result: GraphDiffResult): string {
  const lines = [`Before: ${result.beforeHash}`, `After: ${result.afterHash}`];
  if (result.changes.length === 0) return [...lines, "No compatibility changes."].join("\n");
  lines.push(`Highest classification: ${result.highestClassification ?? "none"}`);
  for (const change of result.changes)
    lines.push(`${change.classification}: ${change.category} ${change.id} (${change.change})`);
  return lines.join("\n");
}
