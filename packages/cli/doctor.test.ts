/**
 * Exercises doctor through its project and JSON reporter boundaries using finite
 * command/probe adapters. Reports preserve selected bridge settings while hiding
 * credential values and skipping unselected deployment prerequisites.
 */
import { expect, test } from "bun:test";
import { Schema } from "effect";
import { doctorProject, parseDoctorArgs, runDoctor } from "./src/commands/doctor.js";

const projectRoot = `${process.cwd()}/examples/commerce`;

test("doctor rejects the retired UI port flag with bridge configuration guidance", () => {
  expect(() => parseDoctorArgs(["--inspector-port", "3210"])).toThrow("inspector.connection.port");
});

test("doctor validates the fixture without deployment prerequisites", async () => {
  const commands: string[][] = [];
  const result = await doctorProject({
    projectRoot,
    deploymentEnabled: false,
    source: { PORT: "0" },
    commandRunner: async (command) => {
      commands.push([...command]);
      return { exitCode: 0 };
    },
    portProbe: async () => true,
  });

  expect(result.ok).toBe(true);
  expect(result.checks.every((check) => check.ok)).toBe(true);
  expect(commands[0]).toEqual([process.execPath, "install", "--frozen-lockfile", "--dry-run"]);
  expect(result.checks.find((check) => check.name === "ports")?.details).toEqual({
    backend: 0,
    inspector: 0,
  });
});

test("doctor can skip transient port availability during project generation", async () => {
  expect(parseDoctorArgs(["--no-ports"])).toEqual({ skipPorts: true });
  const result = await doctorProject({
    projectRoot,
    deploymentEnabled: false,
    skipPorts: true,
    commandRunner: async () => ({ exitCode: 0 }),
    portProbe: async () => {
      throw new Error("port probe should not run");
    },
  });

  expect(result.ok).toBe(true);
  expect(result.checks.find((check) => check.name === "ports")).toMatchObject({
    ok: true,
    message: "Port availability check skipped.",
  });
});

test("doctor reports deployment failures without credential values", async () => {
  const secret = "doctor-synthetic-secret";
  const outputs: string[] = [];
  const exitCode = await runDoctor(
    ["--project-root", projectRoot, "--pulumi"],
    {
      json: true,
      reporter: {
        output: (value) => outputs.push(JSON.stringify(value)),
        error: (code, message) => outputs.push(JSON.stringify({ code, message })),
      },
    },
    {
      source: { AWS_ACCESS_KEY_ID: "access", AWS_SECRET_ACCESS_KEY: secret },
      commandRunner: async () => ({ exitCode: 1 }),
      portProbe: async () => true,
    },
  );

  expect(exitCode).toBe(1);
  expect(JSON.stringify(outputs)).not.toContain(secret);
  expect(JSON.stringify(outputs)).toContain("aws-credentials");
  const report = Schema.decodeUnknownSync(
    Schema.Struct({
      checks: Schema.Array(Schema.Struct({ name: Schema.String, ok: Schema.Boolean })),
    }),
  )(JSON.parse(outputs[0] ?? "null"));
  expect(report.checks.find((check) => check.name === "pulumi")).toMatchObject({
    name: "pulumi",
    ok: false,
  });
});
