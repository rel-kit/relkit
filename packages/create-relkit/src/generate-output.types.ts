/**
 * Local commands and endpoints displayed after successful project creation.
 */
export interface GenerateNextSteps {
  readonly commands: Readonly<{
    readonly cd: string;
    readonly install?: "bun install";
    /** Finite validation/preparation required after a skipped dependency installation. */
    readonly prepare?: "bunx --no-install relkit dev --prepare";
    readonly dev: "bun run dev";
    readonly test: "bun run test";
    readonly check: "bun run check";
    readonly build: "bun run build";
  }>;
  readonly endpoints: Readonly<{
    readonly backend: "http://localhost:3000";
    readonly inspector: "http://localhost:3210";
    readonly openapi: "http://localhost:3000/_relkit/v1/openapi.json";
    readonly apiReference: "http://localhost:3000/_relkit/v1/api-reference";
    readonly route?: "GET http://localhost:3000/hello?name=RelKit";
  }>;
}
