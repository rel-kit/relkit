/**
 * Decodes dependency metadata at package discovery without evaluating SDK code.
 * The compiler retains the original schema failure as a validation cause; absent
 * metadata keeps existing integrations valid while producers migrate explicitly.
 */
import { Effect, Schema } from "effect";
import { IntegrationDependencyRequirements } from "@relkit/contracts";
import { IntegrationPackageValidationError } from "./integration-package-errors.js";
import { observeCompiler } from "./observability.js";

/**
 * Validates one manifest's declared requirements without package installation.
 * @typeParam Input - Foreign manifest field decoded before use.
 * @param value - Optional integration dependency declarations.
 * @returns Lazy validated requirements or the compiler validation error.
 */
export const integrationPackageDependencies = Effect.fn("Compiler.integrationDependencies")(
  <Input>(value: Input, capabilities?: readonly string[]) =>
    Schema.decodeUnknownEffect(IntegrationDependencyRequirements)(value ?? []).pipe(
      Effect.mapError((cause) => new IntegrationPackageValidationError({ cause })),
      Effect.flatMap((requirements) =>
        capabilities === undefined ||
        requirements.every((entry) =>
          entry.capabilities.every((name) => capabilities.includes(name)),
        )
          ? Effect.succeed(requirements)
          : Effect.fail(
              new IntegrationPackageValidationError({
                cause: new TypeError("Dependency metadata names an unregistered capability."),
              }),
            ),
      ),
    ),
  (effect) => observeCompiler("configuration", "runtimePackage", effect),
);
