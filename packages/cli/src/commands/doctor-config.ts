import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ConfigValidationError, loadConfig, type LoadedToolingConfig } from "@relkit/compiler";
import { Effect } from "effect";
import { cliOriginalError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliModules } from "../services/modules.service.js";
import { isAppDescriptor } from "./doctor-compat.js";
import type { DoctorCheck } from "./doctor.types.js";

/**
 * Validates tooling configuration without erasing its owner-provided diagnostics.
 * @param root - Project root.
 * @returns The existing report and optional validated configuration.
 */
export const checkConfigEffect = Effect.fn("Doctor.config")(
  function* (root: string) {
    const modules = yield* CliModules;
    const result = yield* modules
      .load(`${pathToFileURL(join(root, "relkit.config.ts")).href}?relkit_doctor=1`)
      .pipe(
        Effect.flatMap((loaded) =>
          cliTry("doctor.config", () => loadConfig(loaded.default ?? loaded, root)),
        ),
        Effect.result,
      );
    if (result._tag === "Success")
      return {
        config: result.success,
        check: { name: "config", ok: true, message: "relkit.config.ts is valid." },
      };
    const error = cliOriginalError(result.failure);
    const detail =
      error instanceof ConfigValidationError
        ? error.issues.map((issue) => `${issue.path}:${issue.code}`).join(", ")
        : "file is missing or could not be loaded";
    return {
      config: undefined,
      check: { name: "config", ok: false, message: `Invalid relkit.config.ts (${detail}).` },
    };
  },
  (effect) => observeCli("doctor.config", effect),
);

/**
 * Checks the application's descriptor using the existing opaque marker contract.
 * @param root - Project root.
 * @param config - Already validated tooling configuration.
 * @returns A lazy application prerequisite result.
 */
export const checkAppEffect = Effect.fn("Doctor.app")(
  function* (
    root: string,
    config: LoadedToolingConfig | undefined,
  ): Effect.fn.Return<DoctorCheck, never, CliModules> {
    if (config === undefined)
      return {
        name: "app",
        ok: false,
        message: "App cannot be checked because config is invalid.",
      };
    return yield* (yield* CliModules)
      .load(`${pathToFileURL(resolve(root, "relkit.config.ts")).href}?relkit_doctor_app=1`)
      .pipe(
        Effect.map((loaded) => {
          const ok = isAppDescriptor(loaded.default);
          return {
            name: "app",
            ok,
            message: ok
              ? "relkit.config.ts defines the application."
              : "relkit.config.ts is not a valid app config.",
          };
        }),
        Effect.catchTag("CliAdapterError", () =>
          Effect.succeed({
            name: "app",
            ok: false,
            message: "relkit.config.ts could not be loaded.",
          }),
        ),
      );
  },
  (effect) => observeCli("doctor.app", effect),
);
