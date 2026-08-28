import { expect, test } from "bun:test";
import manifest from "./package.json" with { type: "json" };
import { CLI_EXIT_CODES, getCliHelpModel, runCli, type CliHelpCommand } from "./src/main.js";

function io() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
    },
  };
}

test("covers human and JSON help/version/usage exits", async () => {
  const human = io();
  expect(await runCli([], { io: human.io, installSignalHandlers: false })).toBe(
    CLI_EXIT_CODES.success,
  );
  expect(human.stdout[0]).toContain("USAGE");
  expect(human.stdout[0]).toContain("relkit <subcommand> [flags]");
  expect(human.stderr).toEqual([]);

  const commandHelp = io();
  expect(
    await runCli(["help", "check"], { io: commandHelp.io, installSignalHandlers: false }),
  ).toBe(CLI_EXIT_CODES.success);
  expect(commandHelp.stdout[0]).toContain("relkit check [flags]");

  const json = io();
  expect(await runCli(["--json", "--help"], { io: json.io, installSignalHandlers: false })).toBe(
    CLI_EXIT_CODES.success,
  );
  expect(JSON.parse(json.stdout[0]!)).toMatchObject({
    name: "relkit",
    usage: "relkit [--json] <command> [options]",
  });
  expect(json.stderr).toEqual([]);

  const emptyJson = io();
  expect(await runCli(["--json"], { io: emptyJson.io, installSignalHandlers: false })).toBe(
    CLI_EXIT_CODES.success,
  );
  expect(JSON.parse(emptyJson.stdout[0]!)).toMatchObject({
    name: "relkit",
    commands: expect.any(Array),
  });

  const version = io();
  expect(
    await runCli(["--json", "--version"], {
      io: version.io,
      version: "test-version",
      installSignalHandlers: false,
    }),
  ).toBe(CLI_EXIT_CODES.success);
  expect(JSON.parse(version.stdout[0]!)).toEqual({ name: "relkit", version: "test-version" });

  const versionCommand = io();
  expect(await runCli(["version"], { io: versionCommand.io, installSignalHandlers: false })).toBe(
    CLI_EXIT_CODES.success,
  );
  expect(versionCommand.stdout[0]).toBe(`relkit ${manifest.version}`);

  const usage = io();
  expect(
    await runCli(["--json", "--help", "--version"], {
      io: usage.io,
      installSignalHandlers: false,
    }),
  ).toBe(CLI_EXIT_CODES.usage);
  expect(JSON.parse(usage.stdout[0]!)).toMatchObject({
    ok: false,
    error: { code: "RELKIT_CLI_USAGE" },
  });
  expect(usage.stderr).toEqual([]);
});

test("keeps command and create failures structured in JSON", async () => {
  const unavailable = io();
  expect(
    await runCli(["--json", "unknown"], { io: unavailable.io, installSignalHandlers: false }),
  ).toBe(CLI_EXIT_CODES.failure);
  expect(JSON.parse(unavailable.stdout[0]!)).toEqual({
    ok: false,
    error: {
      code: "RELKIT_COMMAND_UNAVAILABLE",
      message: "Command is not implemented: unknown",
    },
  });

  const createUsage = io();
  expect(
    await runCli(["--json", "create"], {
      io: createUsage.io,
      installSignalHandlers: false,
      loadCreateRelkit: async () => ({
        normalizeCreateOptions: () => {
          throw new Error("name is required");
        },
        generateProject: async () => undefined,
      }),
    }),
  ).toBe(CLI_EXIT_CODES.usage);
  expect(JSON.parse(createUsage.stdout[0]!)).toMatchObject({
    ok: false,
    error: { code: "RELKIT_CLI_USAGE", message: "name is required" },
  });

  const createFailure = io();
  expect(
    await runCli(["--json", "create", "demo"], {
      io: createFailure.io,
      installSignalHandlers: false,
      loadCreateRelkit: async () => ({
        normalizeCreateOptions: () => ({ name: "demo" }),
        generateProject: async () => {
          throw Object.assign(new Error("destination is unsafe"), {
            code: "RELKIT_CREATE_VALIDATION_FAILED",
            exitCode: 1,
          });
        },
      }),
    }),
  ).toBe(CLI_EXIT_CODES.failure);
  expect(JSON.parse(createFailure.stdout[0]!)).toEqual({
    ok: false,
    error: { code: "RELKIT_CREATE_VALIDATION_FAILED", message: "destination is unsafe" },
  });

  const createSuccess = io();
  const result = {
    ok: true,
    command: "create",
    nextSteps: {
      commands: {
        cd: "cd demo",
        dev: "bun run dev",
        test: "bun run test",
        check: "bun run check",
        build: "bun run build",
      },
      endpoints: {
        backend: "http://localhost:3000",
        inspector: "http://localhost:3210",
      },
    },
  };
  expect(
    await runCli(["--json", "create", "demo"], {
      io: createSuccess.io,
      installSignalHandlers: false,
      loadCreateRelkit: async () => ({
        normalizeCreateOptions: () => ({ name: "demo" }),
        generateProject: async (_options, context) => {
          expect(context.onProgress).toBeUndefined();
          return result;
        },
      }),
    }),
  ).toBe(CLI_EXIT_CODES.success);
  expect(JSON.parse(createSuccess.stdout[0]!)).toEqual(result);
});

test("renders focused help for every command and nested subcommand", async () => {
  const paths = [
    [],
    ...["create", "dev", "check", "build", "start", "graph", "env", "doctor", "deploy"].map(
      (name) => [name],
    ),
    ...["print", "check", "diff"].map((name) => ["graph", name]),
    ...["check", "list", "explain", "example"].map((name) => ["env", name]),
    ...["init", "preview", "up", "refresh", "outputs", "destroy"].map((name) => ["deploy", name]),
  ];
  const output: Record<string, string> = {};
  for (const path of paths) {
    const captured = io();
    expect(
      await runCli([...path, "--help"], {
        io: captured.io,
        installSignalHandlers: false,
      }),
    ).toBe(CLI_EXIT_CODES.success);
    output[path.join(" ") || "relkit"] = captured.stdout[0]!;
    expect(captured.stderr).toEqual([]);
  }
  expect(output).toMatchSnapshot();
});

test("generates completions, suggestions, help metadata, and command status", async () => {
  for (const shell of ["bash", "zsh", "fish"] as const) {
    const captured = io();
    expect(
      await runCli(["--completions", shell], {
        io: captured.io,
        installSignalHandlers: false,
      }),
    ).toBe(CLI_EXIT_CODES.success);
    expect(captured.stdout[0]).toContain(`begin-relkit-completions`);
    expect(captured.stdout[0]).toContain("graph");
    expect(captured.stdout[0]).not.toContain("--wizard");
  }

  const typo = io();
  expect(await runCli(["--json", "chek"], { io: typo.io, installSignalHandlers: false })).toBe(
    CLI_EXIT_CODES.failure,
  );
  expect(JSON.parse(typo.stdout[0]!).error.message).toContain("check");

  const model = getCliHelpModel("test-version");
  expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  expect(
    allCommands(model).every(({ description, examples }) => description && examples.length),
  ).toBe(true);

  const status = io();
  expect(
    await runCli(["create", "demo"], {
      io: status.io,
      tty: true,
      ci: false,
      installSignalHandlers: false,
      loadCreateRelkit: async () => ({
        normalizeCreateOptions: () => ({ name: "demo" }),
        generateProject: async (_options, context) => {
          context.onProgress?.("Checking generated project...");
          return undefined;
        },
      }),
    }),
  ).toBe(CLI_EXIT_CODES.success);
  expect(status.stderr).toEqual(["Checking generated project..."]);
});

test("removes signal handlers and reports interruption without corrupting JSON", async () => {
  const controller = new AbortController();
  const captured = io();
  const before = {
    sigint: process.listenerCount("SIGINT"),
    sigterm: process.listenerCount("SIGTERM"),
  };
  const exitCode = await runCli(["--json", "create", "demo"], {
    io: captured.io,
    signal: controller.signal,
    loadCreateRelkit: async () => ({
      normalizeCreateOptions: () => ({ name: "demo" }),
      generateProject: async (_options, context) => {
        controller.abort();
        throw context.signal.reason ?? new Error("interrupted");
      },
    }),
  });

  expect(exitCode).toBe(CLI_EXIT_CODES.sigint);
  expect(process.listenerCount("SIGINT")).toBe(before.sigint);
  expect(process.listenerCount("SIGTERM")).toBe(before.sigterm);
  expect(captured.stderr).toEqual([]);
  expect(JSON.parse(captured.stdout[0]!)).toMatchObject({
    ok: false,
    error: { code: "RELKIT_INTERRUPTED" },
  });
});

function allCommands(command: CliHelpCommand): CliHelpCommand[] {
  return [command, ...command.commands.flatMap(allCommands)];
}
