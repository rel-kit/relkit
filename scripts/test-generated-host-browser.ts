/** Owns a real generated dev host and browser runner for offline AI input, realtime partition and WebSocket acceptance. */
import { resolve, join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { ScaffoldProcess, scaffoldProcessLayer, scaffoldChild } from "./scaffold-process.js";
import { scaffoldPort, awaitScaffoldHttp } from "./scaffold-http.js";
import { generatedBrowserProject } from "../tests/e2e/generated-host-project.js";
import { flattenGeneratedHost } from "../tests/integration/database/generated-host-layout.js";

const repository = resolve(import.meta.dir, "..");

/** Browser execution captures only finite process authority; project/server ownership belongs to each invocation scope. */
class GeneratedBrowser extends Context.Service<GeneratedBrowser>()(
  "relkit.tests.GeneratedBrowser",
  {
    make: Effect.gen(function* () {
      const commands = yield* ScaffoldProcess;
      return {
        run: (grouped: boolean) =>
          Effect.gen(function* () {
            const root = yield* generatedBrowserProject;
            if (!grouped) yield* flattenGeneratedHost(root);
            const port = yield* scaffoldPort;
            const host = yield* scaffoldChild({
              cwd: root,
              args: [
                join(repository, "packages/cli/dist/bin.js"),
                "dev",
                "--project-root",
                root,
                "--port",
                String(port),
                "--no-color",
              ],
            });
            const baseURL = `http://127.0.0.1:${port}`;
            const ready = yield* Effect.exit(
              awaitScaffoldHttp(host.process, [baseURL + "/_relkit/v1/health/ready"]),
            );
            if (ready._tag === "Failure") {
              yield* Effect.sync(() => console.error(host.output()));
              return yield* Effect.failCause(ready.cause);
            }
            const result = yield* commands.run({
              cwd: repository,
              args: [
                "x",
                "playwright",
                "test",
                "--config=playwright.generated-host.config.ts",
                `--output=test-results/generated-host-${grouped ? "grouped" : "flat"}`,
              ],
              env: { RELKIT_GENERATED_HOST_URL: baseURL },
            });
            yield* Effect.sync(() => process.stdout.write(result));
          }),
      };
    }),
  },
) {}

await Effect.runPromise(
  GeneratedBrowser.use((service) =>
    Effect.forEach([false, true], (grouped) => service.run(grouped).pipe(Effect.scoped), {
      concurrency: 1,
    }),
  ).pipe(
    Effect.provide(
      Layer.effect(GeneratedBrowser, GeneratedBrowser.make).pipe(
        Layer.provide(scaffoldProcessLayer),
      ),
    ),
    Effect.scoped,
  ),
);
