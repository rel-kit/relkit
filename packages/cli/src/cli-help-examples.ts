/**
 * Examples for commands whose help nodes live in other help modules.
 * A command declares its own examples with `command(name, description, usage, { examples })`;
 * this table covers the ones that do not yet, and an entry leaves the table when its module declares them.
 */
import { example } from "./cli-help-builders.js";
import type { CliHelpCommand } from "./cli-help-model.types.js";

const EXAMPLES: Readonly<Record<string, CliHelpCommand["examples"]>> = {
  add: [
    example("relkit add service orders", "Create an `orders` service in `src/services`"),
    example(
      "relkit add function create-order --service orders",
      "Add a function to the `orders` service",
    ),
    example("relkit add inspector", "Install the development inspector and its local UI"),
  ],
  inspector: [
    example(
      "relkit inspector",
      "Open the inspector UI on port 3210 for the project in the current folder",
    ),
    example(
      "relkit inspector --port 3211 --project-root ./apps/api",
      "Serve the inspector for another application on another port",
    ),
  ],
  "db migrate": [
    example(
      "relkit db migrate",
      "Apply the pending migrations with the project's Drizzle configuration",
    ),
    example(
      "relkit db migrate --config ./drizzle.staging.config.ts",
      "Use another Drizzle configuration file",
    ),
  ],
  env: [
    example("relkit env check", "Check that every required environment variable has a value"),
    example(
      "relkit env list --environment production",
      "List which variables are set for the production environment, without printing values",
    ),
    example("relkit env example --write", "Write a safe `.env.example` for the project"),
  ],
  graph: [
    example(
      "relkit graph print .relkit/build/application.graph.json",
      "Print the built application graph",
    ),
    example(
      "relkit graph diff before.graph.json after.graph.json",
      "Compare two graphs and list the compatibility changes",
    ),
  ],
  jobs: [
    example("relkit jobs list", "List the jobs the application defines"),
    example(
      "relkit jobs trigger --job orders.send --input-file ./input.json",
      "Run a job with the input in a JSON file",
    ),
    example("relkit jobs runs list", "List the runs the jobs service accepted"),
  ],
  local: [
    example("relkit local up", "Start the local services the application declares"),
    example("relkit local status", "Show which local services run and who holds them"),
    example("relkit local reset --dry-run", "List what a reset would remove, and remove nothing"),
  ],
};

/**
 * Applies the table to a help tree without changing any other field.
 * @param node - Help node built by the command modules.
 * @param path - Command names from the root down to `node`.
 * @returns A node, and children, carrying the table's examples where it has some.
 */
export function withExamples(node: CliHelpCommand, path: readonly string[] = []): CliHelpCommand {
  const declared = EXAMPLES[path.join(" ")];
  return {
    ...node,
    ...(declared === undefined ? {} : { examples: declared }),
    commands: node.commands.map((child) => withExamples(child, [...path, child.name])),
  };
}
