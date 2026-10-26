/** Creates external startup processes that evaluate the compiler's real output. */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateRuntimeIntegrationImports } from "@relkit/compiler";
import ts from "typescript";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Native adapter and SDK exports remain genuine executable package modules. */
export function startupFixture() {
  const root = mkdtempSync(join(tmpdir(), "relkit-startup-requirements-"));
  const adapter = join(root, "node_modules/@fixture/adapter");
  const sdk = join(adapter, "node_modules/fixture-sdk");
  mkdirSync(sdk, { recursive: true });
  mkdirSync(join(root, "node_modules/@relkit"), { recursive: true });
  symlinkSync(join(repository, "packages/app"), join(root, "node_modules/@relkit/app"), "dir");
  symlinkSync(join(repository, "node_modules/effect"), join(root, "node_modules/effect"), "dir");
  writeFileSync(join(root, "package.json"), '{"name":"startup-consumer","type":"module"}');
  writeFileSync(
    join(adapter, "package.json"),
    JSON.stringify({
      name: "@fixture/adapter",
      version: "1.0.0",
      type: "module",
      exports: { "./runtime": "./runtime.js" },
    }),
  );
  writeFileSync(
    join(sdk, "package.json"),
    JSON.stringify({
      name: "fixture-sdk",
      version: "1.0.0",
      type: "module",
      exports: { ".": "./index.js" },
    }),
  );
  writeFileSync(join(sdk, "index.js"), 'export const value = "native SDK evaluated";');
  writeFileSync(
    join(adapter, "runtime.js"),
    'import {value} from "fixture-sdk"; console.log(value); export const runtimeIntegration = {};',
  );
  const entry = join(root, "prepared.js");
  const prepared = ts.transpileModule(generateRuntimeIntegrationImports(startupPlan()), {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText;
  writeFileSync(entry, prepared + '\nconsole.log("READY");');
  return { root, adapter, sdk, entry };
}

/** Returns fresh selected requirement metadata for each generated startup fixture. */
function startupPlan() {
  return {
    version: 1 as const,
    graphHash: "sha256:fixture",
    integrations: [
      {
        integrationId: "fixture",
        capability: "cache",
        adapterId: "fixture",
        protocolVersion: 1 as const,
        packageName: "@fixture/adapter",
        packageVersion: "1.0.0",
        exportName: "./runtime",
        requirements: [
          {
            package: "fixture-sdk",
            supportedRange: "1.0.0",
            installSection: "dependencies" as const,
            capabilities: ["cache"],
            phases: ["runtime" as const],
          },
        ],
      },
    ],
  };
}

/** Fresh processes prevent an earlier successful SDK import hiding its removal. */
export function startFixture(root: string, entry: string) {
  return spawnSync("bun", ["run", "--no-env-file", entry], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production" },
    encoding: "utf8",
    timeout: 15_000,
  });
}
