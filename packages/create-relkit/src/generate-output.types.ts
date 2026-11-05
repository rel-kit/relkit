import type { PackageManagerName } from "./package-manager.js";

/** Runs a project script with the selected package manager. */
type RunScript<Script extends string> = `${PackageManagerName} run ${Script}`;

/**
 * Local commands and endpoints displayed after successful project creation, spelled for the
 * package manager the project was created with.
 */
export interface GenerateNextSteps {
  readonly commands: Readonly<{
    readonly cd: string;
    readonly install?: `${PackageManagerName} install`;
    /** Finite validation/preparation required after a skipped dependency installation. */
    readonly prepare?:
      | "bunx --no-install relkit dev --prepare"
      | "npx --no-install relkit dev --prepare"
      | "pnpm exec relkit dev --prepare";
    readonly dev: RunScript<"dev">;
    readonly test: RunScript<"test">;
    readonly check: RunScript<"check">;
    readonly build: RunScript<"build">;
  }>;
  readonly endpoints: Readonly<{
    /** A served backend URL: the example route, or the API reference without examples. */
    readonly backend:
      "http://localhost:3000/hello?name=RelKit" | "http://localhost:3000/_relkit/v1/api-reference";
    readonly inspector: "http://localhost:3210";
    readonly openapi: "http://localhost:3000/_relkit/v1/openapi.json";
    /** Present when the generated application selects the Scalar reference UI (the template default). */
    readonly apiReference?: "http://localhost:3000/_relkit/v1/api-reference";
    readonly route?: "GET http://localhost:3000/hello?name=RelKit";
  }>;
}
