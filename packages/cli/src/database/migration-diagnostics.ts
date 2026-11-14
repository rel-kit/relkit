/**
 * Turns a failure to import the application's Drizzle configuration into a diagnostic the user can
 * act on. The configuration's own message is shown, because it usually names what is missing (an
 * unset variable), but only after masking what could be a secret: credentials inside URLs and
 * `password=`-style pairs. A missing module keeps the dependency hint; anything else the
 * configuration threw gets the environment hint. Paths under the application root are shortened.
 */

/** Longest configuration message shown; the rest is cut. */
const MAXIMUM_MESSAGE_LENGTH = 300;

/**
 * Masks secrets and the application root in a message taken from user code.
 * @param message - Raw message.
 * @param root - Application root, replaced by `.`.
 * @returns The first line, at most {@link MAXIMUM_MESSAGE_LENGTH} characters, with URL user
 * information and secret-named values replaced by `***`.
 */
export function sanitizeConfigMessage(message: string, root: string): string {
  const firstLine = (message.split(/\r?\n/u)[0] ?? "").trim();
  const masked = firstLine
    .replaceAll(root, ".")
    // scheme://user:password@host → scheme://***@host
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/giu, "$1***@")
    // password=…, token: …, secret=… and similar pairs
    .replace(
      /\b([a-z0-9_-]*(?:password|passwd|pwd|secret|token|credential|api[_-]?key)[a-z0-9_-]*)(\s*[=:]\s*)[^\s,;)]+/giu,
      "$1$2***",
    );
  return masked.length > MAXIMUM_MESSAGE_LENGTH
    ? `${masked.slice(0, MAXIMUM_MESSAGE_LENGTH)}…`
    : masked;
}

/**
 * Describes why importing the Drizzle configuration failed.
 * @typeParam Failure - Whatever the import rejected with.
 * @param error - Value the import rejected with.
 * @param root - Application root.
 * @returns A dependency diagnostic for a module that is not installed, otherwise the
 * configuration's sanitized message with the environment hint.
 */
export function configLoadMessage<Failure>(error: Failure, root: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
  if (code === "ERR_MODULE_NOT_FOUND" || /^Cannot find (?:package|module) /u.test(message)) {
    const specifier = /Cannot find (?:package|module) '([^']+)'/u.exec(message)?.[1];
    const name = specifier === undefined ? "a module" : sanitizeConfigMessage(specifier, root);
    return `Could not load Drizzle configuration: it imports ${name}, which is not installed. Install the application's dependencies.`;
  }
  const reason = sanitizeConfigMessage(message, root) || "it threw without a message";
  return `Could not load Drizzle configuration: ${reason.replace(/\.$/u, "")}. Set the variables it reads in the environment or in the application's .env files.`;
}
