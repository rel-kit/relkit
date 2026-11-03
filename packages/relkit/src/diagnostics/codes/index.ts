/** Lists every `RELKIT_*` code with its title, cause, next step and docs page. */
import type { DiagnosticCodeEntry } from "./codes.types.js";
import { cliCodes } from "./cli.js";
import { compilerCodes } from "./compiler.js";
import { inspectorCodes } from "./inspector.js";
import { jobsCodes } from "./jobs.js";
import { launcherCodes } from "./launcher.js";
import { runtimeCodes } from "./runtime.js";

export type { DiagnosticCodeEntry } from "./codes.types.js";

/** Base URL of the public docs site. */
export const DOCS_ORIGIN = "https://relkit.dev" as const;

/** Every documented code, sorted by code. */
export const DIAGNOSTIC_CODES: readonly DiagnosticCodeEntry[] = Object.freeze(
  [
    ...cliCodes,
    ...launcherCodes,
    ...compilerCodes,
    ...runtimeCodes,
    ...jobsCodes,
    ...inspectorCodes,
  ].sort((left, right) => left.code.localeCompare(right.code)),
);

/** `RELKIT_*` names that are not diagnostic codes: environment variables and the definition marker. */
export const RELKIT_NON_CODE_NAMES: ReadonlySet<string> = new Set([
  "RELKIT_ALLOWED_ORIGINS",
  "RELKIT_APPLICATION_ID",
  "RELKIT_CLIENT_PULL_TOKEN",
  "RELKIT_DEFERRED_INTEGRITY_HASH",
  "RELKIT_DESCRIPTOR",
  "RELKIT_DEV_LOGS",
  "RELKIT_DRAIN_TIMEOUT_MS",
  "RELKIT_EFFECT_MQ_DATABASE_URL",
  "RELKIT_ENV",
  "RELKIT_GENERATION_ID",
  "RELKIT_GENERATION_TOKEN",
  "RELKIT_INFRASTRUCTURE_BINDINGS",
  "RELKIT_INNGEST_BASE_URL",
  "RELKIT_INNGEST_SERVE_ORIGIN",
  "RELKIT_INSPECTOR_PORT",
  "RELKIT_INSPECTOR_SESSION_TOKEN",
  "RELKIT_INTERNAL_ENDPOINT_TOKEN",
  "RELKIT_JOBS_CURSOR_SECRET",
  "RELKIT_KEEP_TEST_STATE",
  "RELKIT_LOCAL_SERVICE_INSPECTOR_STATE",
  "RELKIT_OBSERVABILITY_ROOT",
  "RELKIT_PROVIDER_OVERRIDES_FILE",
  "RELKIT_PROVIDER_READY_DELAY_MS",
  "RELKIT_PUBLIC_ROOT",
  "RELKIT_SOURCE_TOKEN",
  "RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS",
  "RELKIT_TELEMETRY_TOKEN",
  "RELKIT_TELEMETRY_URL",
  "RELKIT_WORKER_ROLE",
]);

const byCode = new Map(DIAGNOSTIC_CODES.map((entry) => [entry.code, entry]));

/**
 * Finds a code's catalog entry.
 * @param code - Code as emitted.
 * @returns The entry, or undefined for an unknown code.
 * @example diagnosticCode("RELKIT_SCHEMA_UNAVAILABLE")?.fix;
 */
export function diagnosticCode(code: string): DiagnosticCodeEntry | undefined {
  return byCode.get(code as DiagnosticCodeEntry["code"]);
}

/**
 * Returns the site path of a code's docs page.
 * @param code - Code as emitted.
 * @returns The hand-written page when the entry names one, otherwise the generated page.
 * @example diagnosticDocsPath("RELKIT_SCHEMA_UNAVAILABLE"); // "/docs/errors/relkit-schema-unavailable"
 */
export function diagnosticDocsPath(code: string): string {
  return diagnosticCode(code)?.page ?? `/docs/errors/${diagnosticSlug(code)}`;
}

/**
 * Returns the absolute docs URL for a code.
 * @param code - Code as emitted.
 * @returns A relkit.dev URL.
 * @example diagnosticDocsUrl("RELKIT_SCHEMA_UNAVAILABLE");
 */
export function diagnosticDocsUrl(code: string): string {
  return `${DOCS_ORIGIN}${diagnosticDocsPath(code)}`;
}

/**
 * Converts a code to its generated page slug.
 * @param code - Code as emitted.
 * @returns Lowercase kebab-case slug.
 * @example diagnosticSlug("RELKIT_SCHEMA_UNAVAILABLE"); // "relkit-schema-unavailable"
 */
export function diagnosticSlug(code: string): string {
  return code.toLowerCase().replaceAll("_", "-");
}
