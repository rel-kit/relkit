/** Verifies the new distribution owner; external tarballs are exercised by packed acceptance. */
import { expect, test } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseInspectorOptions } from "../src/options.js";

const root = resolve(import.meta.dirname, "../../..");

/** Reads authoritative manifests rather than the workspace's hoisted dependency closure. */
async function manifest(path: string) {
  return JSON.parse(await readFile(resolve(root, path, "package.json"), "utf8")) as {
    name: string;
    private?: boolean;
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    engines?: Record<string, string>;
    bin?: Record<string, string>;
  };
}

test("private UI and published launcher have unique names and separate ownership", async () => {
  const ui = await manifest("apps/inspector");
  const tool = await manifest("packages/inspector");
  expect(ui).toMatchObject({ name: "@relkit/inspector-ui", private: true });
  expect(tool).toMatchObject({
    name: "@relkit/inspector",
    bin: { "relkit-inspector": "./dist/bin.js" },
  });
  expect(tool.private).not.toBe(true);
  expect(tool.dependencies).toHaveProperty("@relkit/observability-local");
  expect(tool.engines).toMatchObject({ bun: ">=1.3.10", node: ">=20.9.0" });
});

test("the CLI declares no UI/store dependencies or retired generated assets", async () => {
  const cli = await manifest("packages/cli");
  const dependencies = { ...cli.dependencies, ...cli.optionalDependencies };
  for (const name of [
    "next",
    "react",
    "react-dom",
    "@relkit/observability-local",
    "@relkit/inspector",
  ])
    expect(dependencies).not.toHaveProperty(name);
  const files = await readdir(resolve(root, "packages/cli/dist"));
  expect(files).not.toContain("inspector");
  const commands = await readdir(resolve(root, "packages/cli/dist/commands"));
  expect(
    commands.filter((file) =>
      /^(dev-process|dev-inspector-installation|dev-telemetry-(?!config))/.test(file),
    ),
  ).toEqual([]);
});

test("operator choices are launch-only, with UI port independent of the bridge", () => {
  expect(parseInspectorOptions([])).toEqual({ hostname: "127.0.0.1", port: 3210 });
  expect(parseInspectorOptions(["--target", "http://host.docker.internal:43100"]).target).toBe(
    "http://host.docker.internal:43100",
  );
  for (const args of [
    ["--token", "secret"],
    ["--port", "0"],
    ["--target", "https://foreign.test"],
    ["--port", "3210", "--port", "3211"],
  ])
    expect(() => parseInspectorOptions(args)).toThrow(TypeError);
});
