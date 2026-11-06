import { Effect } from "effect";
import { diagnosticCode, diagnosticDocsUrl, type DeprecatedCode } from "./codes/index.js";

const warned = new Set<string>();

/**
 * Process-wide key under which a tool that imports application code (the `relkit check`
 * evaluator) installs a reporter. While one is installed, a deprecation is handed to it as a
 * warning diagnostic instead of being written to the terminal, where the evaluator would count
 * the write as an import-time side effect. `Symbol.for` keeps the key shared when the application
 * and the tool load separate copies of `relkit`.
 */
const reporterKey = Symbol.for("relkit.diagnostics.reporter");

/** Returns the installed reporter, if a tool installed one. */
function installedReporter():
  ((warning: { readonly code: string; readonly message: string }) => void) | undefined {
  const reporter: unknown = Reflect.get(globalThis, reporterKey);
  return typeof reporter === "function"
    ? (warning) => void Reflect.apply(reporter, undefined, [warning])
    : undefined;
}

/**
 * Warns that a deprecated API was used, naming its replacement and the docs page for the code.
 * The warning goes through the Effect logger once per process for each code, so a deprecated call
 * in a hot path does not flood the log. When `relkit check` imports the application, it receives
 * the warning as a diagnostic instead.
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
  const reporter = installedReporter();
  if (reporter !== undefined) return reporter({ code, message });
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
