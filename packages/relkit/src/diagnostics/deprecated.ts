import { Effect } from "effect";
import { diagnosticCode, diagnosticDocsUrl, type DeprecatedCode } from "./codes/index.js";

const warned = new Set<string>();

/**
 * Warns that a deprecated API was used, naming its replacement and the docs page for the code.
 * The warning goes through the Effect logger once per process for each code, so a deprecated call
 * in a hot path does not flood the log.
 * @param code - The `RELKIT_DEPRECATED_*` code of the deprecated API.
 * @param replacement - What to use instead, written the way it appears in code.
 * @returns Nothing; the API keeps working after the warning.
 * @example deprecated("RELKIT_DEPRECATED_APP_PACKAGE", 'import … from "relkit"');
 * @category Diagnostics
 * @since 0.9.0
 */
export function deprecated(code: DeprecatedCode, replacement: string): void {
  if (warned.has(code)) return;
  warned.add(code);
  const title = diagnosticCode(code)?.title ?? code;
  const message = `${code}: ${title}. Use ${replacement} instead. ${diagnosticDocsUrl(code)}`;
  Effect.runSync(Effect.annotateLogs(Effect.logWarning(message), { code, replacement }));
}

/**
 * Forgets which deprecation warnings were already shown, so tests can see each one again.
 * @returns Nothing.
 * @example resetDeprecationWarnings();
 * @category Diagnostics
 * @since 0.9.0
 */
export function resetDeprecationWarnings(): void {
  warned.clear();
}
