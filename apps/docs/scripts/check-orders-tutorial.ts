/** Checks grouped Orders behavior with workspace-backed packages; the packed installation runner separately proves fresh dependency and repair setup. */
import { Effect, Layer } from "effect";
import {
  tutorialProject,
  prepareTutorial,
  applyTutorial,
  configureTutorial,
} from "./orders-tutorial-project.js";
import { TutorialProcess } from "./orders-tutorial-process.js";
import { verifyTutorialProduction } from "./orders-tutorial-http.js";

/** Exercises maintained Orders behavior with workspace packages and owned SQLite state.
 * @returns Lazy source, migration, test and production HTTP checks with scoped cleanup.
 */
const check = Effect.fn("Tutorial.check")(function* () {
  const project = yield* tutorialProject;
  const process = yield* TutorialProcess;
  const run = (...argv: string[]) => process.run(project, argv);
  yield* prepareTutorial(project);
  yield* applyTutorial(project, "endpoint");
  yield* run(globalThis.process.execPath, "run", "check");
  yield* configureTutorial(project, false);
  yield* applyTutorial(project, "database");
  yield* run(globalThis.process.execPath, "--bun", "drizzle-kit", "generate", "--name=initial");
  yield* run(globalThis.process.execPath, "run", "relkit", "db", "migrate");
  yield* run(globalThis.process.execPath, "run", "check");
  yield* run(globalThis.process.execPath, "run", "typecheck");
  yield* configureTutorial(project, true);
  yield* applyTutorial(project, "auth");
  yield* run(globalThis.process.execPath, "--bun", "drizzle-kit", "generate", "--name=auth");
  yield* run(globalThis.process.execPath, "run", "relkit", "db", "migrate");
  yield* run(globalThis.process.execPath, "run", "check");
  yield* applyTutorial(project, "tests");
  yield* run(globalThis.process.execPath, "run", "typecheck");
  yield* run(globalThis.process.execPath, "run", "test");
  yield* run(globalThis.process.execPath, "run", "build");
  yield* verifyTutorialProduction(project);
});

await Effect.runPromise(
  check().pipe(Effect.scoped, Effect.provide(Layer.effect(TutorialProcess, TutorialProcess.make))),
);
