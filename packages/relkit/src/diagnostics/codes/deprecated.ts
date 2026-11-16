/** Codes for deprecated APIs that still work and name their replacement. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const deprecatedCodes = [
  {
    code: "RELKIT_DEPRECATED_APP_PACKAGE",
    title: "@relkit/app is deprecated",
    happened:
      "The application imports `@relkit/app`. RelKit's core package is now `relkit`, and the final `@relkit/app` release only re-exports it so existing imports keep working.",
    fix: "Run `relkit migrate` to rewrite `@relkit/app` imports to `relkit`, then remove `@relkit/app` from your dependencies.",
  },
  {
    code: "RELKIT_DEPRECATED_BETTER_AUTH_OPTIONS",
    title: "Better Auth options are deprecated",
    happened:
      "`defineBetterAuthService` received Better Auth options. RelKit still builds the Better Auth instance from them, but the options form is kept only as a transition.",
    fix: "Write a Better Auth file with `betterAuth({ … })` and pass its instance as `defineBetterAuthService({ auth })`. Run `relkit migrate` to move the options into that file.",
  },
  {
    code: "RELKIT_DEPRECATED_TASK_LOGGING",
    title: "logging of a task is deprecated",
    happened:
      "A task sets `logging` in `defineTask`. The option never had an effect: no jobs backend reads its `level` or its `redact` list. It is still accepted, and `relkit check` warns for each task that sets it; the check still passes.",
    fix: "Remove `logging` from the task. To keep a value out of recorded telemetry, list its key in `telemetry.redaction.redactKeys` of `defineApp`; to log less, set the application's log level.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];

/** The code of a deprecated API, for `deprecated()`. */
export type DeprecatedCode = (typeof deprecatedCodes)[number]["code"];
