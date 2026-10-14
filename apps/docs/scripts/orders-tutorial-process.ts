/** Owns bounded native build commands and production servers for the tutorial acceptance run. */
import { Context, Effect } from "effect";
import { TutorialFailure } from "./orders-tutorial.errors.js";
import type { TutorialChild, TutorialProject, TutorialServer } from "./orders-tutorial.types.js";

/**
 * Starts one child and drains both native output streams before releasing it.
 * @param project - Isolated application.
 * @param argv - Native command arguments.
 * @param env - Explicit child environment.
 * @returns A scoped child whose termination joins output and exit.
 */
const child = Effect.fn("Tutorial.child")(
  (project: TutorialProject, argv: readonly string[], env = project.env) =>
    Effect.acquireRelease(
      Effect.try({
        try: (): TutorialChild => {
          const process = Bun.spawn([...argv], {
            cwd: project.app,
            env,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
          });
          return {
            process,
            stdout: new Response(process.stdout).text(),
            stderr: new Response(process.stderr).text(),
          };
        },
        catch: () =>
          new TutorialFailure({
            operation: "process.spawn",
            message: `Cannot start ${argv.join(" ")}`,
          }),
      }),
      (owner) =>
        Effect.promise(async () => {
          if (owner.process.exitCode === null) owner.process.kill();
          const timer = setTimeout(() => {
            if (owner.process.exitCode === null) owner.process.kill("SIGKILL");
          }, 2000);
          try {
            await Promise.all([owner.process.exited, owner.stdout, owner.stderr]);
          } finally {
            clearTimeout(timer);
          }
        }),
    ),
);

/** Owns the native command adapter; source compilation cannot acquire this service's server clients. */
export class TutorialProcess extends Context.Service<TutorialProcess>()(
  "relkit.docs.TutorialProcess",
  {
    make: Effect.sync(() => ({
      run: Effect.fn("Tutorial.command")(
        function* (project: TutorialProject, argv: readonly string[]) {
          const owner = yield* child(project, argv);
          const status = yield* Effect.promise(() => owner.process.exited);
          if (status !== 0)
            return yield* new TutorialFailure({
              operation: "process.command",
              message: `${argv.join(" ")} failed (${status}):\n${yield* Effect.promise(() => owner.stdout)}\n${yield* Effect.promise(() => owner.stderr)}`,
            });
          yield* Effect.logInfo(`passed: ${argv.join(" ")}`);
        },
        (effect) => effect.pipe(Effect.scoped, Effect.timeout("90 seconds")),
      ),
    })),
  },
) {}

/**
 * Starts a production server on a reserved local port and probes a real public response.
 * @param project - Isolated application with completed production build.
 * @param origin - Fixed origin shared across restarts.
 * @returns A scoped native server after the public Hello route answers.
 */
export const startTutorialServer = Effect.fn("Tutorial.server")(function* (
  project: TutorialProject,
  origin: string,
) {
  const owner = yield* child(project, [process.execPath, "run", "start"], {
    ...project.env,
    PORT: new URL(origin).port,
    BETTER_AUTH_URL: origin,
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = yield* Effect.tryPromise({
      try: (signal) => fetch(origin + "/hello", { signal }),
      catch: () =>
        new TutorialFailure({
          operation: "server.probe",
          message: "Production listener unavailable",
        }),
    }).pipe(
      Effect.map((response) => response.ok),
      Effect.catchTag("TutorialFailure", () => Effect.succeed(false)),
    );
    if (ready) return { origin, child: owner } satisfies TutorialServer;
    if (owner.process.exitCode !== null) break;
    yield* Effect.sleep("100 millis");
  }
  return yield* new TutorialFailure({
    operation: "server.start",
    message: `Production server did not become ready: ${yield* Effect.promise(() => owner.stderr)}`,
  });
});
