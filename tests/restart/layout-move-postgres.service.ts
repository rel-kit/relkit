/** Owns an isolated account-free PostgreSQL container and volume for native schedule recovery after service source movement. */
import { resolve, join } from "node:path";
import { Context, Effect, Layer } from "effect";
import * as ts from "typescript";
import { CliProcess, processLayer } from "../../packages/cli/src/services/process.service.js";
import { ScaffoldProcessFailure } from "../../scripts/scaffold-process.errors.js";
import { scaffoldNative } from "../../scripts/scaffold-native.js";
import { reservePort } from "../jobs/compatibility/native-stack.js";
import { postgresImage } from "../jobs/compatibility/effect-mq-postgres.js";
import type { RestartDocker } from "./layout-move.types.js";

const repository = resolve(import.meta.dir, "../..");

/** Isolated native database authority acquired only by the opt-in Docker test. */
export class RestartPostgres extends Context.Service<RestartPostgres>()(
  "relkit.tests.RestartPostgres",
  {
    make: Effect.gen(function* () {
      const process = yield* CliProcess;
      const name = "relkit-layout-move-" + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const volume = name + "-data";
      const docker = Effect.fn("RestartPostgres.docker")(function* (
        args: readonly string[],
        removal = false,
      ) {
        const result = yield* process.run({ command: "docker", args, cwd: repository });
        if (
          result.exitCode !== 0 &&
          !(removal && /No such (container|volume)/i.test(result.stderr))
        )
          return yield* new ScaffoldProcessFailure({
            operation: "restart.postgres",
            message: result.stderr,
          });
        return result.stdout;
      });
      yield* Effect.addFinalizer(() =>
        docker(["volume", "rm", "-f", volume], true).pipe(Effect.orDie),
      );
      yield* Effect.addFinalizer(() => docker(["rm", "-f", name], true).pipe(Effect.orDie));
      const port = yield* scaffoldNative("restart.postgres.port", reservePort);
      yield* docker(["pull", postgresImage]);
      yield* docker(["volume", "create", volume]);
      yield* docker([
        "run",
        "-d",
        "--name",
        name,
        "-e",
        "POSTGRES_PASSWORD=layout-test-only",
        "-v",
        `${volume}:/var/lib/postgresql/data`,
        "-p",
        `127.0.0.1:${port}:5432`,
        postgresImage,
      ]);
      yield* waitForPostgres(docker, name);
      const ddl = yield* postgresDDL;
      yield* docker(["exec", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", ddl]);
      return {
        environment: {
          RELKIT_LAYOUT_TEST_POSTGRES: `postgres://postgres:layout-test-only@127.0.0.1:${port}/postgres`,
        },
      };
    }),
  },
) {}
export const restartPostgresLayer = Layer.effect(RestartPostgres, RestartPostgres.make).pipe(
  Layer.provide(processLayer),
);

/**
 * Polls native database readiness while retaining genuine command failures and an overall deadline.
 * @param docker - Captured scoped native command authority.
 * @param name - Container owned exclusively by this invocation.
 * @returns Completion only after PostgreSQL accepts local connections.
 */
const waitForPostgres = Effect.fn("RestartPostgres.ready")(
  function* (docker: RestartDocker, name: string) {
    for (;;) {
      const output = yield* docker([
        "exec",
        name,
        "sh",
        "-c",
        "pg_isready -h 127.0.0.1 -U postgres || true",
      ]);
      if (output.includes("accepting connections")) return;
      yield* Effect.sleep(100);
    }
  },
  (effect) => effect.pipe(Effect.timeout("30 seconds")),
);

/** Extracts only the existing pinned native fixture's SQL literal; no source is evaluated or imported for setup. */
const postgresDDL = scaffoldNative("restart.postgres.ddl", async () => {
  const source = await Bun.file(
    join(repository, "tests/jobs/compatibility/effect-mq-postgres.ts"),
  ).text();
  const file = ts.createSourceFile("effect-mq-postgres.ts", source, ts.ScriptTarget.Latest, true);
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations)
      if (
        declaration.name.getText(file) === "ddl" &&
        declaration.initializer &&
        ts.isNoSubstitutionTemplateLiteral(declaration.initializer)
      )
        return declaration.initializer.text;
  }
  throw new Error("Pinned native PostgreSQL fixture has no literal schema");
});
