import { argument, command, option } from "./cli-help-builders.js";

export const clientHelp = command(
  "client",
  "Generate a client from a running application",
  "relkit client <command>",
  {
    commands: ["pull", "check"].map((name) =>
      command(
        name,
        name === "pull"
          ? "Pull a versioned client contract"
          : "Check a pulled client for contract drift",
        `relkit client ${name} <baseUrl> --out <directory>`,
        {
          arguments: [argument("baseUrl", true, "Running RELKIT application URL")],
          options: [option("out", "string", "Output directory")],
        },
      ),
    ),
  },
);
