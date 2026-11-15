/** Command help gives real examples, states the `--runtime` default and the prerequisite of `start`. */
import { expect, test } from "vitest";
import { findCliHelp, getCliHelpModel, runCli, type CliHelpCommand } from "../src/main.js";

const root = getCliHelpModel("test");

/** Resolves the command an example runs, and the flags it passes. */
function inspect(example: string) {
  const [program, ...tokens] = example.split(/\s+/u);
  expect(program).toBe("relkit");
  let node: CliHelpCommand = root;
  const path: string[] = [];
  for (const token of tokens) {
    const child = node.commands.find(({ name }) => name === token);
    if (child === undefined) break;
    node = child;
    path.push(token);
  }
  const flags = tokens.filter((token) => token.startsWith("--")).map((token) => token.slice(2));
  return { node, path, flags };
}

const taught = [
  ["create"],
  ["add"],
  ["dev"],
  ["check"],
  ["build"],
  ["start"],
  ["db", "migrate"],
  ["inspector"],
  ["doctor"],
  ["env"],
  ["graph"],
  ["jobs"],
  ["local"],
] as const;

test("the commands a new user runs declare two or three real examples", () => {
  for (const path of taught) {
    const { examples } = findCliHelp(path)!;
    expect(examples.length, path.join(" ")).toBeGreaterThanOrEqual(2);
    expect(examples.length, path.join(" ")).toBeLessThanOrEqual(4);
    for (const { command, description } of examples) {
      const target = inspect(command);
      // An example runs the command whose help shows it or one of its subcommands, and says something the command line does not.
      expect(target.path.slice(0, path.length), command).toEqual([...path]);
      expect(description, command).not.toBe(findCliHelp(path)!.description);
    }
  }
});

test("every flag an example passes is declared by the command it runs", () => {
  const visit = (command: CliHelpCommand) => {
    for (const { command: example } of command.examples) {
      const { node, flags } = inspect(example);
      const declared = new Set([
        "json",
        ...node.options.flatMap(({ name, aliases }) => [name, ...(aliases ?? [])]),
      ]);
      for (const flag of flags) expect(declared.has(flag), `${example} uses --${flag}`).toBe(true);
    }
    command.commands.forEach(visit);
  };
  visit(root);
});

test("examples show the flags people need", () => {
  const commands = (path: readonly string[]) => findCliHelp(path)!.examples.map((e) => e.command);
  expect(commands(["dev"])).toContain("relkit dev --port 4100");
  expect(commands(["build"])).toContain("relkit build --runtime node");
  expect(commands(["inspector"])).toContain(
    "relkit inspector --port 3211 --project-root ./apps/api",
  );
});

test("build help states the --runtime default and start help states the prerequisite", () => {
  const runtime = findCliHelp(["build"])!.options.find(({ name }) => name === "runtime")!;
  expect(runtime.description).toMatch(/default/iu);
  expect(runtime.description).toContain("node");
  expect(runtime.description).toContain("bun");
  expect(findCliHelp(["start"])!.description).toContain("relkit build");
});

test("terminal help prints the examples and the notes", async () => {
  const stdout: string[] = [];
  await runCli(["build", "--help"], {
    io: { stdout: (line) => stdout.push(line), stderr: () => undefined },
    installSignalHandlers: false,
  });
  expect(stdout[0]).toContain("relkit build --runtime node");
  const start: string[] = [];
  await runCli(["start", "--help"], {
    io: { stdout: (line) => start.push(line), stderr: () => undefined },
    installSignalHandlers: false,
  });
  expect(start[0]).toContain("relkit build");
});

test("check lists --include-outputs", () => {
  expect(findCliHelp(["check"])!.options.map(({ name }) => name)).toContain("include-outputs");
});
