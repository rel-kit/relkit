/**
 * Doctor checks for what stops a project from running on the current runtime and package manager:
 * application imports this runtime cannot load, environment files it does not read by itself,
 * and package manifest fields the package manager ignores. A check that does not block reports
 * `ok: true` with `details.severity` set to `"warning"`.
 */
import { Effect } from "effect";
import {
  prefilterSources,
  DEFAULT_TOOLING_CONFIG,
  type LoadedToolingConfig,
} from "../compiler/index.js";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { oneShotEnvironmentFiles } from "../runtime/one-shot-environment.js";
import { runtime } from "../runtime/index.js";
import { readSourcesEffect } from "./check-input.js";
import { BUN_RUNTIME_REQUIRED, bunOnlyImports } from "./check-runtime-imports.js";
import type { DoctorCheck, PackageJson } from "./doctor.types.js";

/** Commands that read environment files themselves when the runtime does not. */
const ONE_SHOT_COMMANDS = "dev, db migrate, env, start, jobs, local and doctor";

/**
 * Reports application imports of Bun-only modules when doctor runs on Node.
 * @param root - Project root.
 * @param config - Validated tooling configuration, when it loaded.
 * @returns Lazily, a failing check naming each import, since evaluation cannot load the app.
 */
export const checkRuntimeImportsEffect = Effect.fn("Doctor.runtimeImports")(
  function* (root: string, config: LoadedToolingConfig | undefined) {
    const name = "runtime-imports";
    if (runtime.name === "bun")
      return { name, ok: true, message: "Bun loads every module the application imports." };
    const sources = yield* readSourcesEffect(root, config?.source ?? DEFAULT_TOOLING_CONFIG.source);
    const { skipped } = yield* cliTry("doctor.runtimeImports", () =>
      prefilterSources(sources, {
        projectRoot: root,
        exclude: config?.exclude ?? DEFAULT_TOOLING_CONFIG.exclude,
      }),
    );
    const excluded = new Set(
      skipped.filter((entry) => entry.reason === "excluded").map((entry) => entry.fileName),
    );
    const found = bunOnlyImports(sources.filter((source) => !excluded.has(source.fileName)));
    if (found.length === 0)
      return { name, ok: true, message: "Node loads every module the application imports." };
    const first = found[0]!;
    return {
      name,
      ok: false,
      message: `${first.file}:${first.line}:${first.column} imports "${first.specifier}", which loads only on Bun${found.length > 1 ? ` (and ${found.length - 1} more)` : ""}, so check, dev, db migrate and the Inspector cannot load the application on Node. Run them with Bun, or open the database with openSqliteDatabase, openPostgresDatabase or openMysqlDatabase from @relkit/drizzle.`,
      details: {
        code: BUN_RUNTIME_REQUIRED,
        imports: found.map((entry) => ({ ...entry })),
      },
    } satisfies DoctorCheck;
  },
  (effect) => observeCli("doctor.runtimeImports", effect),
);

/**
 * Reports the environment files that exist and whether this runtime loads them by itself.
 * @param root - Project root.
 * @returns Lazily, a warning on Node when files exist: code run with `node` directly does not
 * see them, although RelKit's own commands read them.
 */
export const checkEnvironmentFilesEffect = Effect.fn("Doctor.environmentFiles")(
  function* (root: string) {
    const name = "environment-files";
    const plan = yield* oneShotEnvironmentFiles(root);
    const present = plan.files.filter((file) => file.exists).map((file) => file.name);
    const details = {
      runtime: plan.runtime,
      loadedByRuntime: plan.loadedByRuntime,
      files: present,
    };
    if (present.length === 0)
      return { name, ok: true, message: "No environment file is present.", details };
    const list = present.join(", ");
    if (plan.loadedByRuntime)
      return { name, ok: true, message: `Bun loads ${list} for every command.`, details };
    return {
      name,
      ok: true,
      message: `Node does not load ${list} by itself. RelKit reads ${present.length === 1 ? "it" : "them"} for ${ONE_SHOT_COMMANDS}; scripts run with node directly do not see ${present.length === 1 ? "it" : "them"}.`,
      details: { ...details, severity: "warning" },
    } satisfies DoctorCheck;
  },
  (effect) => observeCli("doctor.environmentFiles", effect),
);

/**
 * Reports manifest fields the project's package manager ignores, and npm's missing approval of
 * esbuild's install script, which `@relkit/cli` needs to run TypeScript on Node.
 * @param manager - Package manager of the project.
 * @param manifest - Parsed `package.json`.
 * @param hasPnpmWorkspace - Whether `pnpm-workspace.yaml` exists.
 * @returns A warning naming each field and what to do, or a passing check.
 */
export function checkManifestFields(
  manager: string,
  manifest: PackageJson,
  hasPnpmWorkspace: boolean,
): DoctorCheck {
  const name = "package-manager";
  const findings: string[] = [];
  if (manager === "npm" && manifest["patchedDependencies"] !== undefined)
    findings.push(
      "npm ignores patchedDependencies in package.json, so those patches are not applied; apply them with patch-package or install with Bun or pnpm.",
    );
  if (manager === "pnpm" && manifest["patchedDependencies"] !== undefined)
    findings.push(
      `pnpm ignores patchedDependencies in package.json; move it to pnpm-workspace.yaml${hasPnpmWorkspace ? "" : ", which does not exist yet"}.`,
    );
  const dependencies = {
    ...record(manifest["dependencies"]),
    ...record(manifest["devDependencies"]),
  };
  if (
    manager === "npm" &&
    dependencies["@relkit/cli"] !== undefined &&
    record(manifest["allowScripts"])["esbuild"] !== true
  )
    findings.push(
      'npm does not run esbuild\'s install script without approval, and @relkit/cli needs esbuild on Node; run npm approve-scripts esbuild or add "allowScripts": { "esbuild": true } to package.json.',
    );
  if (findings.length === 0)
    return { name, ok: true, message: `${manager} applies every field in package.json.` };
  return {
    name,
    ok: true,
    message: findings.join(" "),
    details: { severity: "warning", packageManager: manager },
  };
}

/**
 * Reads an object field leniently.
 * @param value - Manifest field.
 * @returns The object, or an empty one.
 */
function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
