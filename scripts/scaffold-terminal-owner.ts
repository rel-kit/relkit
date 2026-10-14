/** Owns a native pseudo-terminal, detached packed CLI child and bounded termination before terminal release. */
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ScaffoldProcessFailure } from "./scaffold-process.errors.js";
import { signalScaffoldGroup } from "./scaffold-process.js";
import type {
  ScaffoldTerminalResult,
  ScaffoldTerminalRequest,
  ScaffoldTerminalDisplay,
} from "./scaffold-smoke-terminal.types.js";

/**
 * Drives the native terminal while keeping callback mutation local to one invocation.
 * @param request - Exact packed executable, owned application and ordered prompt input.
 * @returns Exit/output only after child exit and terminal release have been joined.
 */
export const scaffoldTerminal = Effect.fn("ScaffoldTerminal.run")(
  function* (request: ScaffoldTerminalRequest) {
    const display: ScaffoldTerminalDisplay = { output: "", answered: 0, overflow: undefined };
    const terminal = yield* acquireTerminal(request, display);
    const child = yield* Effect.acquireRelease(
      Effect.try({
        try: () =>
          Bun.spawn([process.execPath, ...request.command], {
            cwd: request.cwd,
            detached: true,
            terminal,
            env: { ...process.env, CI: "", NO_COLOR: "1", TERM: "xterm-256color", ...request.env },
          }),
        catch: (cause) =>
          new ScaffoldProcessFailure({
            operation: "terminal.spawn",
            message: cause instanceof Error ? cause.message : "Native terminal spawn failed",
          }),
      }),
      (child) => releaseTerminalChild(child),
    );
    const code = yield* Effect.promise(() => child.exited);
    if (display.overflow !== undefined)
      return yield* new ScaffoldProcessFailure({
        operation: "terminal.output",
        message: display.overflow.message,
      });
    if (display.answered !== request.answers.length)
      return yield* new ScaffoldProcessFailure({
        operation: "terminal.prompts",
        message: "Missing packed terminal prompt:\n" + display.output,
      });
    return { code, output: display.output } satisfies ScaffoldTerminalResult;
  },
  (effect) =>
    observeExecution(
      "testing",
      "scaffold.terminal",
      effect.pipe(Effect.scoped, Effect.timeout("10 minutes")),
    ),
);

/**
 * Registers one bounded native display callback with invocation-owned mutable state.
 * @param request - Ordered prompt fragments and terminal input.
 * @param display - Exclusive output/answer state for this terminal registration.
 * @returns A scope-owned native terminal whose closure follows the child finalizer.
 */
function acquireTerminal(request: ScaffoldTerminalRequest, display: ScaffoldTerminalDisplay) {
  return Effect.acquireRelease(
    Effect.try({
      try: () =>
        new Bun.Terminal({
          cols: 120,
          rows: 40,
          /** Consumes bounded native output and writes the next matching prompt answer.
           * @param term - Terminal owned by the enclosing acquisition scope.
           * @param bytes - Native display bytes received from its child.
           * @returns After recording output/responding, or closing an overflowed display. */
          data(term, bytes) {
            if (display.overflow !== undefined) return;
            display.output += new TextDecoder().decode(bytes);
            if (display.output.length > 4_194_304) {
              display.overflow = new Error("Packed terminal output exceeded its bound");
              term.close();
              return;
            }
            const next = request.answers[display.answered];
            if (next !== undefined && display.output.includes(next[0])) {
              display.answered++;
              term.write(next[1]);
            }
          },
        }),
      catch: (cause) =>
        new ScaffoldProcessFailure({
          operation: "terminal.acquire",
          message: cause instanceof Error ? cause.message : "Native terminal acquisition failed",
        }),
    }),
    (terminal) => Effect.sync(() => terminal.close()),
  );
}

/**
 * Joins native child exit even if graceful termination fails or times out.
 * @param child - Detached child created by this invocation only.
 * @returns Completion after native exit, with a bounded forced termination fallback.
 */
function releaseTerminalChild(child: Bun.Subprocess) {
  return Effect.promise(async () => {
    signalScaffoldGroup(child.pid, "SIGTERM");
    const timer = setTimeout(() => signalScaffoldGroup(child.pid, "SIGKILL"), 2000);
    try {
      await child.exited;
    } finally {
      clearTimeout(timer);
    }
  });
}
