/**
 * Installs native executable cancellation without importing command dispatch.
 * This compatibility edge retains established product codes; the invocation's
 * finally block removes exactly the listeners it acquired.
 */

/**
 * Owns INT/TERM listeners for one invocation controller.
 * @param controller - Executable-owned cancellation authority.
 * @returns Exact release callback; native listeners never execute an Effect.
 */
export function installInvocationSignals(controller: AbortController): () => void {
  const handlers = [
    [
      "SIGINT",
      () =>
        controller.abort(
          Object.assign(new Error("Received SIGINT."), {
            code: "RELKIT_INTERRUPTED",
            exitCode: 130,
            signal: "SIGINT",
          }),
        ),
    ],
    [
      "SIGTERM",
      () =>
        controller.abort(
          Object.assign(new Error("Received SIGTERM."), {
            code: "RELKIT_INTERRUPTED",
            exitCode: 143,
            signal: "SIGTERM",
          }),
        ),
    ],
  ] as const;
  for (const [signal, handler] of handlers) process.on(signal, handler);
  return () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
}

/**
 * Projects the established last-setting-wins JSON flag without loading a parser.
 * @param argv - Literal invocation arguments.
 * @returns Selected JSON mode, including explicit false overrides.
 */
export function invocationJsonMode(argv: readonly string[]): boolean {
  let enabled = false;
  for (const argument of argv) {
    if (argument === "--json" || argument === "--json=true") enabled = true;
    else if (argument === "--json=false") enabled = false;
  }
  return enabled;
}
