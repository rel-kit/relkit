/** Shares the native signal owner between package and restricted container entries. */
import { BunRuntime } from "@effect/platform-bun";
import { Cause, Effect } from "effect";
import { InspectionConnectionError } from "relkit/inspector-api/connection";
import { parseInspectorOptions, INSPECTOR_HELP } from "./options.js";
import { InspectorTool, InspectorToolLive } from "./tool.service.js";
import { requireInspectorContainer } from "./container-native.js";
import { inspectorContainerTeardown } from "./container-exit.js";

/** Failures with one likely remedy name it; everything else keeps the general checklist. */
const stopHint: Record<string, string> = {
  "ui.port-in-use":
    "Inspector stopped; the UI port is already in use (often an inspector that is still running). Stop it or pass --port",
  unexpected:
    "Inspector stopped; verify launch options, private connection directory and persistent history mount",
};

export function runInspectorMain(container: boolean): void {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(INSPECTOR_HELP);
    return;
  }
  // runMain only interrupts on SIGINT/SIGTERM; a closed terminal (SIGHUP) would
  // otherwise kill the tool without joining its UI and history children.
  process.on("SIGHUP", () => process.kill(process.pid, "SIGTERM"));
  BunRuntime.runMain(
    Effect.gen(function* () {
      const options = yield* Effect.try({
        try: () => parseInspectorOptions(process.argv.slice(2)),
        catch: (cause) =>
          new InspectionConnectionError({
            operation: "launch.invalid",
            cause: cause instanceof Error ? cause : new Error("Invalid launch options"),
          }),
      });
      if (container) yield* requireInspectorContainer(options);
      yield* InspectorTool.use((tool) => tool.run(options));
    }).pipe(
      Effect.provide(InspectorToolLive),
      Effect.tapCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.void;
        const failure = cause.reasons.find((reason) => reason._tag === "Fail");
        const error =
          failure?._tag === "Fail" && failure.error instanceof InspectionConnectionError
            ? failure.error
            : undefined;
        const operation = error?.operation ?? "unexpected";
        return Effect.logError(stopHint[operation] ?? stopHint.unexpected, {
          operation,
          // Only the port check's own message is safe to print; other causes may carry secrets.
          ...(operation === "ui.port-in-use" ? { detail: error?.cause.message } : {}),
        });
      }),
    ),
    { disableErrorReporting: true, teardown: container ? inspectorContainerTeardown : undefined },
  );
}
