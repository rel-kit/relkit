import { deepFreeze } from "@relkit/contracts";
import { argument, command, devLogOptions, option, title } from "./cli-help-builders.js";
import type { CliHelpCommand, CliHelpModel } from "./cli-help-types.js";

export type * from "./cli-help-types.js";

const projectRoot = option("project-root", "string", "Application directory (defaults to cwd)");
const environment = option(
  "environment",
  "string",
  "Provider environment, including value-free model-provider configuration",
  ["env"],
);
const deployOptions = [
  projectRoot,
  option("stack", "string", "Pulumi stack name (default: development)"),
  option("backend", "string", "cloud, local, or object-storage URL"),
  option("config", "key=value", "Set a non-secret Pulumi value; repeatable"),
  option("config-secret", "key=value", "Set a secret Pulumi value; repeatable"),
  option("non-interactive", "boolean", "Approve protected operations", ["yes"]),
];

const graph = command(
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

const env = command("env", "Inspect value-free environment contracts", "relkit env <command>", {
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
});

const deploy = command("deploy", "Manage Pulumi deployments", "relkit deploy <command>", {
  commands: ["init", "preview", "up", "refresh", "outputs", "destroy"].map((name) =>
    command(name, `${title(name)} the Pulumi stack`, `relkit deploy ${name}`, {
      options: deployOptions,
    }),
  ),
});

const client = command(
  "client",
  "Generate a client from a running application",
  "relkit client <command>",
  {
    commands: [
      command(
        "pull",
        "Pull a versioned client contract",
        "relkit client pull <baseUrl> --out <directory>",
        {
          arguments: [argument("baseUrl", true, "Running RELKIT application URL")],
          options: [option("out", "string", "Output directory")],
        },
      ),
    ],
  },
);

const local = command("local", "Manage project-scoped local services", "relkit local <command>", {
  commands: [
    command("up", "Start all declared local services", "relkit local up", {
      options: [projectRoot, option("detach", "boolean", "Keep services running after exit")],
    }),
    command("status", "Show local service and lease status", "relkit local status", {
      options: [projectRoot],
    }),
    command("stop", "Stop project local containers and preserve volumes", "relkit local stop", {
      options: [projectRoot],
    }),
    command("reset", "Remove project local containers, volumes, and state", "relkit local reset", {
      options: [projectRoot, option("yes", "boolean", "Confirm reset without prompting")],
    }),
  ],
});

const root = command(
  "relkit",
  "Convention-first TypeScript application framework",
  "relkit <command>",
  {
    options: [option("json", "boolean", "Emit machine-readable output")],
    commands: [
      command("create", "Create a new RELKIT application", "relkit create <name>", {
        arguments: [argument("name", true, "npm package and application name")],
        options: [
          option("template", "choice", "Starter template", [], ["minimal", "api", "agent"]),
          option("cloud", "choice", "Cloud provider", [], ["aws", "none"]),
          option("deploy", "choice", "Deployment adapter", [], ["pulumi", "none"]),
          option("directory", "string", "Destination directory"),
          ...["install", "no-install", "git", "no-git", "examples", "no-examples"].map((name) =>
            option(name, "boolean", `${title(name)} generated project setup`),
          ),
          option("force-empty-directory", "boolean", "Allow an existing empty destination"),
        ],
      }),
      command("dev", "Run app, inspector, OpenAPI, and Scalar", "relkit dev", {
        options: [
          projectRoot,
          option("port", "integer", "Application port"),
          option("inspector-port", "integer", "Inspector port"),
          option("local", "choice", "Start required local services", [], ["on", "off"]),
          ...devLogOptions,
        ],
      }),
      command(
        "check",
        "Compile descriptors, infer eligible IDs, and validate the application",
        "relkit check",
        {
          options: [projectRoot],
        },
      ),
      command("build", "Build the checked graph, manifest, OpenAPI, and client", "relkit build", {
        options: [projectRoot],
      }),
      command("start", "Start a built application", "relkit start", {
        options: [projectRoot, option("port", "integer", "Application port")],
      }),
      graph,
      env,
      local,
      command("doctor", "Check local prerequisites and ports", "relkit doctor", {
        options: [
          projectRoot,
          option("port", "integer", "Application port"),
          option("inspector-port", "integer", "Inspector port"),
          option("pulumi", "boolean", "Require Pulumi"),
          option("no-pulumi", "boolean", "Skip Pulumi requirements"),
        ],
      }),
      deploy,
      client,
    ],
  },
);

/** Returns the deterministic JSON-safe documentation model used by CLI reference generation. */
export function getCliHelpModel(version: string): CliHelpModel {
  return deepFreeze({ ...root, version });
}

export function findCliHelp(path: readonly string[]): CliHelpCommand | undefined {
  let current: CliHelpCommand = root;
  for (const name of path) {
    const next = current.commands.find((entry) => entry.name === name);
    if (!next) return undefined;
    current = next;
  }
  return current;
}
