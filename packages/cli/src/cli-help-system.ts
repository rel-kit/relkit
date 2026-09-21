import { argument, command, option, title } from "./cli-help-builders.js";
import { deployOptions, environment, projectRoot } from "./cli-help-options.js";

export const graph = command(
  "graph",
  "Inspect deterministic application graphs",
  "relkit graph <command>",
  {
    commands: [
      command(
        "print",
        "Print a canonical graph with services and resolved source IDs",
        "relkit graph print [graph]",
        {
          options: [projectRoot],
          arguments: [argument("graph", false, "Graph JSON path")],
        },
      ),
      command("check", "Validate a graph and optional hash", "relkit graph check [graph]", {
        options: [projectRoot, option("hash", "string", "Expected sha256 graph hash")],
        arguments: [argument("graph", false, "Graph JSON path")],
      }),
      command(
        "diff",
        "Compare graph compatibility, including inferred identity moves",
        "relkit graph diff <before> <after>",
        {
          options: [projectRoot],
          arguments: [
            argument("before", true, "Previous graph path"),
            argument("after", true, "Next graph path"),
          ],
        },
      ),
    ],
  },
);

export const env = command(
  "env",
  "Inspect value-free environment contracts",
  "relkit env <command>",
  {
    commands: [
      command("check", "Validate environment values", "relkit env check", {
        options: [projectRoot, environment],
      }),
      command("list", "List environment value status", "relkit env list", {
        options: [projectRoot, environment],
      }),
      command("explain", "Explain one environment variable", "relkit env explain <name>", {
        options: [projectRoot, environment],
        arguments: [argument("name", true, "Environment variable name")],
      }),
      command("example", "Render or write a safe .env example", "relkit env example", {
        options: [
          projectRoot,
          environment,
          option("path", "string", "Output path", ["file"]),
          option("write", "boolean", "Write the rendered example"),
        ],
      }),
    ],
  },
);

export const deploy = command("deploy", "Manage Pulumi deployments", "relkit deploy <command>", {
  commands: ["init", "preview", "up", "refresh", "outputs", "destroy"].map((name) =>
    command(name, `${title(name)} the Pulumi stack`, `relkit deploy ${name}`, {
      options: deployOptions,
    }),
  ),
});

export const local = command(
  "local",
  "Manage project-scoped local services",
  "relkit local <command>",
  {
    commands: [
      command("up", "Start all declared local services", "relkit local up", {
        options: [
          projectRoot,
          environment,
          option("service", "string", "Limit to one service binding"),
          option("detach", "boolean", "Keep services running after exit"),
        ],
      }),
      command("status", "Show local service and lease status", "relkit local status", {
        options: [
          projectRoot,
          environment,
          option("service", "string", "Limit to one service binding"),
        ],
      }),
      command("stop", "Stop project local containers and preserve volumes", "relkit local stop", {
        options: [
          projectRoot,
          environment,
          option("service", "string", "Limit to one service binding"),
        ],
      }),
      command(
        "reset",
        "Remove project local containers, volumes, and state",
        "relkit local reset",
        {
          options: [
            projectRoot,
            environment,
            option("service", "string", "Limit to one service binding"),
            option("yes", "boolean", "Confirm reset without prompting"),
            option("dry-run", "boolean", "Show owned resources without removing them"),
          ],
        },
      ),
    ],
  },
);
