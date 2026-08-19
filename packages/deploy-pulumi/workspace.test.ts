import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PulumiCommand } from "@pulumi/pulumi/automation";
import {
  PULUMI_CLOUD_BACKEND_URL,
  createPulumiWorkspace,
  resolvePulumiBackend,
} from "./src/workspace.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Pulumi workspace setup", () => {
  test("accepts Pulumi Cloud, object storage, and isolated local backends", () => {
    const root = resolve("tmp/pulumi-workspace");
    expect(resolvePulumiBackend()).toEqual({ kind: "cloud", url: PULUMI_CLOUD_BACKEND_URL });
    expect(resolvePulumiBackend({ kind: "object-storage", url: "s3://bucket/zsys" }, root)).toEqual(
      { kind: "object-storage", url: "s3://bucket/zsys" },
    );
    expect(
      resolvePulumiBackend({ kind: "object-storage", url: "azblob://container/zsys" }, root).url,
    ).toBe("azblob://container/zsys");
    expect(
      resolvePulumiBackend({ kind: "object-storage", url: "gs://bucket/zsys" }, root).url,
    ).toBe("gs://bucket/zsys");
    expect(resolvePulumiBackend({ kind: "local" }, root).url).toBe(`file://${root}/.pulumi`);
    expect(() =>
      resolvePulumiBackend({ kind: "object-storage", url: "https://example.test" }),
    ).toThrow();
  });

  test("writes Pulumi project settings and uses explicit stack/config operations", async () => {
    const root = await mkdtemp(join(tmpdir(), "zsys-pulumi-test-"));
    roots.push(root);
    const log = join(root, "commands.log");
    const commandRoot = join(root, "cli");
    const bin = join(commandRoot, "bin");
    await mkdir(bin, { recursive: true });
    const commandPath = join(bin, "pulumi");
    await writeFile(
      commandPath,
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$PULUMI_TEST_LOG"\nif [ "$1" = "version" ]; then printf "3.258.0\\n"; fi\n',
    );
    await chmod(commandPath, 0o755);
    const command = await PulumiCommand.get({ root: commandRoot, skipVersionCheck: true });
    const workDir = join(root, "program");
    const first = await createPulumiWorkspace({
      projectName: "Orders.App",
      stackName: "development",
      workDir,
      backend: { kind: "local" },
      mode: "create",
      config: { "aws:region": { value: "us-east-1" } },
      pulumiCommand: command,
      envVars: { PULUMI_TEST_LOG: log },
    });
    const project = await readFile(join(workDir, "Pulumi.yaml"), "utf8");
    expect(first.projectName).toBe("orders-app");
    expect(project).toContain("name: orders-app");
    expect(project).toContain("file:///");

    await createPulumiWorkspace({
      projectName: "Orders.App",
      stackName: "development",
      workDir,
      backend: { kind: "local" },
      mode: "select",
      pulumiCommand: command,
      envVars: { PULUMI_TEST_LOG: log },
    });
    const commands = await readFile(log, "utf8");
    expect(commands).toContain("stack init development");
    expect(commands).toContain("config set-all --stack development");
    expect(commands).toContain("stack select --stack development");
    expect(commands).not.toContain(".zsys/state");
  });
});
