import { Context, Effect, Layer } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { DoctorToolchainOperations } from "./doctor-toolchain.types.js";

/** Native read-only version and executable metadata authority. */
export class CliDoctorToolchain extends Context.Service<
  CliDoctorToolchain,
  DoctorToolchainOperations
>()("relkit/cli/DoctorToolchain") {}

/** Native finite toolchain capabilities; no globals are mutated and no processes are acquired. */
export const doctorToolchainLayer = Layer.succeed(
  CliDoctorToolchain,
  CliDoctorToolchain.of({
    bunVersion: Effect.fn("DoctorToolchain.bunVersion")(() =>
      observeCli(
        "doctor.toolchain.bunVersion",
        Effect.sync(() => Bun.version),
      ),
    ),
    typeScriptPath: Effect.fn("DoctorToolchain.typeScriptPath")((root) =>
      observeCli(
        "doctor.toolchain.typescriptPath",
        cliTry("doctor.typescript.resolve", () => Bun.resolveSync("typescript/package.json", root)),
      ),
    ),
    which: Effect.fn("DoctorToolchain.which")((executable) =>
      observeCli(
        "doctor.toolchain.which",
        cliTry("doctor.which", () => Bun.which(executable)),
      ),
    ),
    satisfies: Effect.fn("DoctorToolchain.satisfies")((version, range) =>
      observeCli(
        "doctor.toolchain.satisfies",
        cliTry("doctor.semver", () => Bun.semver.satisfies(version, range)).pipe(
          Effect.catchTag("CliAdapterError", () => Effect.succeed(false)),
        ),
      ),
    ),
  }),
);
