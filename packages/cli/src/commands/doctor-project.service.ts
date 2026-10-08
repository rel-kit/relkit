import { join, resolve } from "node:path";
import { Context, Effect, Layer } from "effect";
import { GeneratorFileSystem, generatorFileSystemLive } from "create-relkit";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import { CliModules, moduleLayer } from "../services/modules.service.js";
import { CliProcess, processLayer } from "../services/process.service.js";
import { CliCleanup, cleanupLayer } from "../services/cleanup.service.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { detectDeployment, readJsonEffect, versionChecksEffect } from "./doctor-compat.js";
import { checkConfigEffect, checkAppEffect } from "./doctor-config.js";
import {
  checkAws,
  checkPulumiEffect,
  checkRootsEffect,
  checkPortsEffect,
  checkLockfileEffect,
} from "./doctor-checks.js";
import type { DoctorCheck, DoctorOperations, DoctorOptions, DoctorResult } from "./doctor.types.js";
import { CliDoctorToolchain, doctorToolchainLayer } from "./doctor-toolchain.service.js";

/** Finite prerequisite domain; every report owns temporary files and child checks. */
export class CliDoctor extends Context.Service<CliDoctor, DoctorOperations>()(
  "relkit/cli/Doctor",
) {}

/**
 * Captures prerequisite capabilities without executing any check during acquisition.
 * @returns A doctor Layer requiring filesystem, modules, process, cleanup and catalog authority.
 */
export const doctorLive = makeDoctorLive({});

/** Captures per-invocation defaults without a shared mutable service.
 * @param defaults - Native check policy.
 * @returns The doctor graph retaining infrastructure requirements.
 */
function makeDoctorLive(defaults: DoctorOptions) {
  return Layer.effect(
    CliDoctor,
    Effect.gen(function* () {
      const files = yield* CliFileSystem;
      const modules = yield* CliModules;
      const processes = yield* CliProcess;
      const cleanup = yield* CliCleanup;
      const catalogs = yield* GeneratorFileSystem;
      const toolchain = yield* CliDoctorToolchain;
      return CliDoctor.of({
        check: Effect.fn("Doctor.check")((overrides: DoctorOptions) =>
          observeCli(
            "doctor.check",
            Effect.gen(function* () {
              const options = { ...defaults, ...overrides };
              const root = resolve(options.projectRoot ?? process.cwd());
              const manifest = yield* readJsonEffect(join(root, "package.json"));
              const checks: DoctorCheck[] = [...(yield* versionChecksEffect(manifest, root))];
              const config = yield* checkConfigEffect(root);
              checks.push(config.check, yield* checkAppEffect(root, config.config));
              const enabled =
                options.deploymentEnabled ?? detectDeployment(manifest, config.config);
              checks.push(yield* checkPulumiEffect(enabled, root, options.commandRunner));
              checks.push(checkAws(enabled, options.source ?? process.env));
              checks.push(yield* checkRootsEffect(root));
              checks.push(
                options.skipPorts
                  ? { name: "ports", ok: true, message: "Port availability check skipped." }
                  : yield* checkPortsEffect(config.config, options, options.portProbe),
              );
              checks.push(yield* checkLockfileEffect(root, options.commandRunner));
              return Object.freeze({
                ok: checks.every((check) => check.ok),
                command: "doctor" as const,
                projectRoot: root,
                checks: Object.freeze(checks.map((check) => Object.freeze(check))),
              });
            }).pipe(
              Effect.provideService(CliFileSystem, files),
              Effect.provideService(CliModules, modules),
              Effect.provideService(CliProcess, processes),
              Effect.provideService(CliCleanup, cleanup),
              Effect.provideService(GeneratorFileSystem, catalogs),
              Effect.provideService(CliDoctorToolchain, toolchain),
            ),
          ),
        ),
      });
    }),
  );
}

/**
 * Provides one fresh native graph while retaining injectable prerequisite policy.
 * @param options - Defaults for the command invocation; explicit command flags take precedence.
 * @returns A finite doctor Layer; no check or cache starts at construction.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * await Effect.runPromise(doctorProjectEffect({ skipPorts: true }).pipe(Effect.provide(doctorLiveLayer())));
 * ```
 */
export function doctorLiveLayer(options: DoctorOptions = {}): Layer.Layer<CliDoctor> {
  return makeDoctorLive(options).pipe(
    Layer.provide(
      Layer.mergeAll(
        fileSystemLayer,
        moduleLayer,
        processLayer,
        cleanupLayer,
        generatorFileSystemLive,
        doctorToolchainLayer,
      ),
    ),
  );
}

/**
 * Collects a report with explicitly provided prerequisite authority.
 * @param options - Project and check settings.
 * @returns A lazy report requiring CliDoctor.
 */
export const doctorProjectEffect = Effect.fn("Doctor.project")(
  (options: DoctorOptions = {}) => CliDoctor.use((doctor) => doctor.check(options)),
  (effect, _options: DoctorOptions = {}) => observeCli("doctor.project", effect),
);

/**
 * Preserves the public report Promise after all owned resources settle.
 * @param options - Existing project, native overrides and prerequisite policy.
 * @returns The existing immutable doctor result.
 */
export function doctorProject(options: DoctorOptions = {}): Promise<DoctorResult> {
  return runCliEffect(doctorProjectEffect(options), doctorLiveLayer(options));
}
