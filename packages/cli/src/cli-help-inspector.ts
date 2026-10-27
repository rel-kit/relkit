/**
 * Static help, completion and generated-reference metadata for `relkit inspector`.
 * The parser in cli-command-inspector.ts reads these option names; nothing here
 * resolves packages or starts the inspector.
 */
import { command, option } from "./cli-help-builders.js";
import { projectRoot } from "./cli-help-options.js";

/** Launches the project-local inspector UI installed by `relkit add inspector`. */
export const inspectorHelp = command(
  "inspector",
  "Run the project-local development inspector UI",
  "relkit inspector",
  {
    options: [
      projectRoot,
      option("port", "integer", "Inspector UI port (default: 3210)"),
      option("hostname", "string", "Inspector UI bind host (default: 127.0.0.1)"),
    ],
  },
);
