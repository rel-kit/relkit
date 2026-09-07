import { join, resolve } from "node:path";
import { createClackPromptDriver, type PromptDriver } from "create-relkit";

export async function resolveRootMenu(
  argv: readonly string[],
  context: {
    readonly enabled: boolean;
    readonly cwd?: string;
    readonly promptDriver?: PromptDriver;
  },
): Promise<readonly string[]> {
  if (argv.length > 0 || !context.enabled) return argv;
  const cwd = resolve(context.cwd ?? process.cwd());
  const project = await Promise.all([
    Bun.file(join(cwd, "package.json")).exists(),
    Bun.file(join(cwd, "relkit.config.ts")).exists(),
  ]).then((values) => values.every(Boolean));
  const prompt = context.promptDriver ?? createClackPromptDriver("RELKIT_CLI_CANCELLED");
  prompt.intro("RELKIT");
  const action = await prompt.select({
    message: "What would you like to do?",
    options: project
      ? [
          { value: "add", label: "Add an artifact" },
          { value: "dev", label: "Start development" },
          { value: "check", label: "Check the project" },
          { value: "build", label: "Build the project" },
          { value: "local", label: "Manage local services" },
          { value: "doctor", label: "Run doctor" },
          { value: "create", label: "Create another app" },
          { value: "help", label: "Show help" },
        ]
      : [
          { value: "create", label: "Create a new app" },
          { value: "help", label: "Show help" },
        ],
  });
  if (action === "help") return ["--help"];
  return action === "local" ? ["local", "status"] : [action];
}
