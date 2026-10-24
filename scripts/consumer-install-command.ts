/**
 * Builds explicit, serial package-manager commands for external fixtures.
 * Runner choice never changes application package-manager inference. Native
 * process ownership and deadlines remain with the existing ScaffoldProcess.
 */
import { realpath } from "node:fs/promises";
import { Effect } from "effect";
import { consumerInputFailure, inspectionNative } from "./consumer-installation-native.js";
import type { ConsumerFixture, ConsumerManager } from "./consumer-benchmark.types.js";
import type { ScaffoldCommand } from "./scaffold-process.types.js";

/**
 * Selects explicit npm/pnpm flags without changing runtime or peer semantics.
 * @param manager - Installed external manager.
 * @param script - Resolved Node executable module.
 * @param registry - Scoped measuring registry.
 * @param cache - Fixture-owned native package cache.
 * @param production - Whether development packages are omitted.
 * @returns Literal arguments with one network/script worker where supported.
 */
function externalArguments(
  manager: "npm" | "pnpm",
  script: string,
  registry: string,
  cache: string,
  production: boolean,
) {
  if (manager === "npm")
    return [
      script,
      "install",
      "--registry",
      registry,
      "--cache",
      cache,
      "--maxsockets=1",
      "--no-audit",
      "--no-fund",
      ...(production ? ["--omit=dev"] : []),
    ];
  return [
    script,
    "install",
    "--registry",
    registry,
    "--store-dir",
    cache,
    "--network-concurrency=1",
    "--child-concurrency=1",
    "--reporter=append-only",
    "--config.package-manager-strict=false",
    "--config.manage-package-manager-versions=false",
    ...(production ? ["--prod"] : []),
  ];
}

/**
 * Selects an installed manager without downloading another version or runner.
 * @param manager - Explicit fixture manager/layout.
 * @param fixture - Production/development dependency policy.
 * @param root - External consumer root.
 * @param registry - Scoped candidate registry.
 * @param cache - Fixture-owned cache reused only for the warm sample.
 * @returns Lazy finite command with one network/script worker where supported.
 */
export const consumerInstallCommand = Effect.fn("ConsumerInstall.command")(function* (
  manager: ConsumerManager,
  fixture: ConsumerFixture,
  root: string,
  registry: string,
  cache: string,
) {
  const env = { NODE_OPTIONS: "--max-old-space-size=768", MAKEFLAGS: "-j1", npm_config_jobs: "1" };
  if (manager === "bun" || manager === "bun-isolated")
    return {
      args: [
        "install",
        "--network-concurrency=1",
        "--concurrent-scripts=1",
        "--linker",
        manager === "bun" ? "hoisted" : "isolated",
        ...(fixture.production ? ["--production"] : []),
      ],
      cwd: root,
      registry,
      cacheDir: cache,
      env,
    } satisfies ScaffoldCommand;
  const executable = Bun.which(manager);
  if (executable === null)
    return yield* consumerInputFailure(
      "manager.executable",
      `Required installed package manager is absent: ${manager}`,
    );
  const script = yield* inspectionNative("manager.executable", () => realpath(executable));
  return {
    executable: "node",
    args: externalArguments(manager, script, registry, cache, fixture.production),
    cwd: root,
    env,
  } satisfies ScaffoldCommand;
});
