/**
 * Parses `relkit inspector` flags into normalized invocation arguments. The
 * dispatcher hands them to commands/inspector.ts; parsing resolves no packages
 * and starts no process.
 */
import { Effect } from "effect";
import { Command } from "effect/cli";
import {
  document,
  optionalInteger,
  optionalString,
  optionArgs,
  type SelectInvocation,
} from "./cli-command-shared.js";

/**
 * Builds the inspector launch command from its static help metadata.
 * @param select - Records the parsed invocation for the existing dispatcher.
 * @returns Pure parser syntax emitting `--project-root`, `--port` and `--hostname` pairs.
 */
export function inspectorCommand(select: SelectInvocation) {
  const path = ["inspector"] as const;
  return document(
    Command.make(
      "inspector",
      {
        projectRoot: optionalString(path, "project-root"),
        port: optionalInteger(path, "port"),
        hostname: optionalString(path, "hostname"),
      },
      (value) =>
        Effect.sync(() =>
          select("inspector", [
            ...optionArgs("project-root", value.projectRoot),
            ...optionArgs("port", value.port),
            ...optionArgs("hostname", value.hostname),
          ]),
        ),
    ),
    path,
  );
}
