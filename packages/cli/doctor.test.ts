import { expect, test } from "bun:test";
import { doctorProject, runDoctor } from "./src/commands/doctor.js";

const projectRoot = `${process.cwd()}/apps/fixture-commerce`;

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
    inspector: 3210,
  });
});

test("doctor reports deployment failures without credential values", async () => {
  const secret = "doctor-synthetic-secret";
  const outputs: unknown[] = [];
  const exitCode = await runDoctor(
    ["--project-root", projectRoot, "--pulumi"],
    {
      json: true,
      reporter: {
        output: (value) => outputs.push(value),
        error: (code, message) => outputs.push({ code, message }),
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
  expect(JSON.stringify(outputs)).toContain("Pulumi CLI is not available.");
});
