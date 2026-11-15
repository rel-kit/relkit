/** Static CLI help metadata; rendering never evaluates projects or starts support services. */
import { deepFreeze } from "relkit/contracts";
import { argument, command, devLogOptions, example, option, title } from "./cli-help-builders.js";
import type { CliHelpCommand, CliHelpModel } from "./cli-help-model.types.js";
import { addHelp } from "./cli-help-add.js";
import { withExamples } from "./cli-help-examples.js";
import { clientHelp } from "./cli-help-client.js";
import { deploy, env, graph, local } from "./cli-help-system.js";
import { jobs } from "./cli-help-jobs.js";
import { projectRoot } from "./cli-help-options.js";
import { migrateHelp } from "./cli-help-migrate.js";
import { dbHelp } from "./cli-help-db.js";
import { inspectorHelp } from "./cli-help-inspector.js";
import { mcpHelp } from "./cli-help-mcp.js";

export type * from "./cli-help-model.types.js";

const root = withExamples(
  command("relkit", "Convention-first TypeScript application framework", "relkit <command>", {
    options: [option("json", "boolean", "Emit machine-readable output")],
    commands: [
      command("create", "Create a new RelKit application", "relkit create [name]", {
        examples: [
          example(
            "relkit create my-app",
            "Create an application named `my-app` and install its packages",
          ),
          example(
            "relkit create my-app --template fullstack",
            "Start from the fullstack template instead of the default",
          ),
          example(
            "relkit create my-app --no-install --no-git",
            "Write the files only, without installing packages or starting a Git repository",
          ),
        ],
        arguments: [argument("name", false, "npm package and application name")],
        options: [
          option(
            "template",
            "choice",
            "Starter template",
            [],
            ["minimal", "api", "agent", "fullstack", "tasks"],
          ),
          option("cloud", "choice", "Cloud selection", [], ["aws", "none"]),
          option("deploy", "choice", "Deployment selection", [], ["pulumi", "none"]),
          option(
            "jobs",
            "choice",
            "Jobs service for the tasks template",
            [],
            ["inngest-docker", "effect-mq-docker", "trigger-docker"],
          ),
          option("directory", "string", "Destination directory"),
          ...["install", "no-install", "git", "no-git", "examples", "no-examples"].map((name) =>
            option(name, "boolean", `${title(name)} generated project setup`),
          ),
          option("force-empty-directory", "boolean", "Allow an existing empty destination"),
          option("strict", "boolean", "Refuse combinations CI has not tested instead of warning"),
        ],
      }),
      addHelp,
      migrateHelp,
      dbHelp,
      command("dev", "Run the app and its selected development features", "relkit dev", {
        examples: [
          example("relkit dev", "Run the application and rebuild it on every save"),
          example("relkit dev --port 4100", "Serve the application on port 4100"),
          example(
            "relkit dev --project-root ./apps/api --log-level debug",
            "Run another application in the repository and show debug events",
          ),
        ],
        options: [
          projectRoot,
          option("prepare", "boolean", "Check the project and exit without starting a server"),
          option("port", "integer", "Application port"),
          option(
            "inspector-port",
            "integer",
            "Retired; configure inspector.connection.port, or run relkit inspector --port",
          ),
          option("local", "choice", "Start required local services", [], ["on", "off"]),
          ...devLogOptions,
        ],
      }),
      inspectorHelp,
      mcpHelp,
      command(
        "check",
        "Compile descriptors, infer eligible IDs, and validate the application",
        "relkit check",
        {
          examples: [
            example("relkit check", "Check the application in the current folder"),
            example(
              "relkit check --project-root ./apps/api",
              "Check another application in the repository",
            ),
            example(
              "relkit check --json --include-outputs",
              "Print the result as JSON with the text of every generated file",
            ),
          ],
          options: [
            projectRoot,
            option(
              "include-outputs",
              "boolean",
              "With --json, include the text of every generated file; paths and hashes are always included",
            ),
          ],
        },
      ),
      command("build", "Build the checked graph, manifest, OpenAPI, and client", "relkit build", {
        examples: [
          example("relkit build", "Build the application for the runtime that runs relkit"),
          example(
            "relkit build --runtime node",
            "Build a Node.js server, whichever runtime runs relkit",
          ),
          example(
            "relkit build --target vercel",
            "Build for Vercel, which runs the Node.js server",
          ),
        ],
        options: [
          projectRoot,
          option(
            "runtime",
            "choice",
            "Runtime the production server runs on (default: node when relkit runs on Node.js, bun when it runs on Bun)",
            [],
            ["bun", "node", "workers"],
          ),
          option("target", "choice", "Deploy target whose build rules apply", [], ["vercel"]),
        ],
      }),
      command("start", "Start the built application; run `relkit build` first", "relkit start", {
        examples: [
          example(
            "relkit start",
            "Start the build in `.relkit/build`; it fails until `relkit build` has succeeded",
          ),
          example("relkit start --port 8080", "Start the existing build on port 8080"),
          example(
            "relkit start --project-root ./apps/api",
            "Start the build of another application in the repository",
          ),
        ],
        options: [projectRoot, option("port", "integer", "Application port")],
      }),
      graph,
      env,
      local,
      jobs,
      command("doctor", "Check local prerequisites and ports", "relkit doctor", {
        examples: [
          example("relkit doctor", "Check the tools and ports the application needs"),
          example("relkit doctor --port 4100", "Check that port 4100 is free for the application"),
          example("relkit doctor --no-ports", "Check the tools only, without testing ports"),
        ],
        options: [
          projectRoot,
          option("port", "integer", "Application port"),
          option(
            "inspector-port",
            "integer",
            "Retired; configure inspector.connection.port for the application bridge",
          ),
          option("no-ports", "boolean", "Skip port availability checks"),
          option("pulumi", "boolean", "Require Pulumi"),
          option("no-pulumi", "boolean", "Skip Pulumi requirements"),
        ],
      }),
      deploy,
      clientHelp,
    ],
  }),
);

/** Returns a frozen static help tree without acquiring command services.
 * @param version - Published CLI version to display at the root.
 * @returns Deeply immutable command metadata for terminal or documentation rendering.
 * @remarks Help remains synchronous and deterministic, including before project discovery.
 */
export function getCliHelpModel(version: string): CliHelpModel {
  return deepFreeze({ ...root, version });
}

/** Resolves a command path in the static tree without executing the command.
 * @param path - Ordered subcommand names relative to the root; empty selects the root.
 * @returns The matching command, or undefined when any path segment is unknown.
 */
export function findCliHelp(path: readonly string[]): CliHelpCommand | undefined {
  return path.reduce<CliHelpCommand | undefined>(
    (current, name) => current?.commands.find((entry) => entry.name === name),
    root,
  );
}
