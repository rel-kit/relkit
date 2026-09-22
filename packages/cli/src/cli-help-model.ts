import { deepFreeze } from "@relkit/contracts";
import { argument, command, devLogOptions, option, title } from "./cli-help-builders.js";
import type { CliHelpCommand, CliHelpModel } from "./cli-help-types.js";
import { addHelp } from "./cli-help-add.js";
import { clientHelp } from "./cli-help-client.js";
import { deploy, env, graph, local } from "./cli-help-system.js";
import { jobs } from "./cli-help-jobs.js";
import { projectRoot } from "./cli-help-options.js";

export type * from "./cli-help-types.js";

const root = command(
  "relkit",
  "Convention-first TypeScript application framework",
  "relkit <command>",
  {
    options: [option("json", "boolean", "Emit machine-readable output")],
    commands: [
      command("create", "Create a new RELKIT application", "relkit create [name]", {
        arguments: [argument("name", false, "npm package and application name")],
        options: [
          option(
            "template",
            "choice",
            "Starter template",
            [],
            ["minimal", "api", "agent", "fullstack"],
          ),
          option("cloud", "choice", "Cloud provider", [], ["aws", "none"]),
          option("deploy", "choice", "Deployment adapter", [], ["pulumi", "none"]),
          option(
            "jobs",
            "choice",
            "Jobs service and local recipe",
            [],
            ["inngest-docker", "effect-mq-docker", "trigger-docker"],
          ),
          option("directory", "string", "Destination directory"),
          ...["install", "no-install", "git", "no-git", "examples", "no-examples"].map((name) =>
            option(name, "boolean", `${title(name)} generated project setup`),
          ),
          option("force-empty-directory", "boolean", "Allow an existing empty destination"),
        ],
      }),
      addHelp,
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
      jobs,
      command("doctor", "Check local prerequisites and ports", "relkit doctor", {
        options: [
          projectRoot,
          option("port", "integer", "Application port"),
          option("inspector-port", "integer", "Inspector port"),
          option("no-ports", "boolean", "Skip port availability checks"),
          option("pulumi", "boolean", "Require Pulumi"),
          option("no-pulumi", "boolean", "Skip Pulumi requirements"),
        ],
      }),
      deploy,
      clientHelp,
    ],
  },
);

export function getCliHelpModel(version: string): CliHelpModel {
  return deepFreeze({ ...root, version });
}

export function findCliHelp(path: readonly string[]): CliHelpCommand | undefined {
  return path.reduce<CliHelpCommand | undefined>(
    (current, name) => current?.commands.find((entry) => entry.name === name),
    root,
  );
}
