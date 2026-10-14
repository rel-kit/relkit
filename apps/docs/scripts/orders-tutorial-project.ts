/** Owns temporary tutorial sources and copies explicit Orders artifacts into certified minimal creation. */
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect, Schema } from "effect";
import { generateProject, normalizeCreateOptions } from "create-relkit";
import { TutorialFailure } from "./orders-tutorial.errors.js";
import type { TutorialProject } from "./orders-tutorial.types.js";

const root = resolve(import.meta.dir, "../../..");
const overlays = resolve(import.meta.dir, "../examples/orders-tutorial/steps");

/** Acquires one temporary project and releases only its own directory after child owners close. */
export const tutorialProject = Effect.acquireRelease(
  Effect.tryPromise({
    try: () => mkdtemp(join(tmpdir(), "relkit-docs-orders-")),
    catch: () =>
      new TutorialFailure({
        operation: "project.acquire",
        message: "Cannot create tutorial directory",
      }),
  }).pipe(
    Effect.map((parent) => ({
      root,
      parent,
      app: join(parent, "relkit-orders"),
      env: {
        ...process.env,
        DATABASE_PATH: join(parent, "relkit-orders/orders.sqlite"),
        BETTER_AUTH_SECRET: "isolated-tutorial-check-secret-123456789012345",
        BETTER_AUTH_URL: "http://127.0.0.1:3000",
      },
    })),
  ),
  (project) =>
    Effect.promise(async () => {
      if (process.env.RELKIT_KEEP_TUTORIAL_TEMP === "1") console.log(`kept: ${project.app}`);
      else await rm(project.parent, { recursive: true, force: true });
    }),
);

/**
 * Creates the offered minimal tuple and installs the tutorial's explicit Orders sources.
 * @param project - Isolated project owner.
 * @returns Completion after sources and the exact installed dependencies are connected.
 */
export const prepareTutorial = Effect.fn("Tutorial.prepare")(function* (project: TutorialProject) {
  yield* Effect.tryPromise({
    try: () =>
      generateProject(
        normalizeCreateOptions([
          "relkit-orders",
          "--directory",
          project.app,
          "--template",
          "minimal",
          "--cloud",
          "none",
          "--deploy",
          "none",
          "--no-install",
          "--no-git",
        ]),
        { commandRunner: async () => ({ exitCode: 0 }) },
      ),
    catch: () =>
      new TutorialFailure({
        operation: "project.create",
        message: "Minimal tutorial creation failed",
      }),
  });
  yield* Effect.tryPromise({
    try: async () => {
      await symlink(
        join(root, "examples/auth-drizzle/node_modules"),
        join(project.app, "node_modules"),
      );
      for (const path of ["src/services/orders", "src/routes/orders"])
        await cp(join(root, "templates/default/v1/api", path), join(project.app, path), {
          recursive: true,
        });
    },
    catch: () =>
      new TutorialFailure({
        operation: "project.sources",
        message: "Cannot install explicit tutorial sources",
      }),
  });
});

/**
 * Copies the next maintained tutorial overlay into its isolated application.
 * @param project - Isolated project owner.
 * @param step - Maintained overlay directory.
 * @returns Completion after its authored files are copied.
 */
export const applyTutorial = Effect.fn("Tutorial.overlay")(
  (project: TutorialProject, step: string) =>
    Effect.tryPromise({
      try: () => cp(join(overlays, step), project.app, { recursive: true, force: true }),
      catch: () =>
        new TutorialFailure({ operation: "project.overlay", message: `Cannot apply ${step}` }),
    }),
);

/**
 * Records the native integration versions used by one stage without installing or changing lockfiles.
 * @param project - Isolated project owner.
 * @param auth - Whether the authentication stage is being enabled.
 * @returns Completion after the temporary manifest reflects installed workspace integrations.
 */
export const configureTutorial = Effect.fn("Tutorial.dependencies")(function* (
  project: TutorialProject,
  auth: boolean,
) {
  const text = yield* Effect.tryPromise({
    try: () => readFile(join(project.app, "package.json"), "utf8"),
    catch: () =>
      new TutorialFailure({ operation: "manifest.read", message: "Cannot read tutorial manifest" }),
  });
  const manifest = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
  )(text);
  const dependencies = {
    ...(yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.String))(
      manifest.dependencies,
    )),
  };
  const devDependencies = {
    ...(yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.String))(
      manifest.devDependencies,
    )),
  };
  const versionText = yield* Effect.promise(() =>
    readFile(join(root, "packages/drizzle/package.json"), "utf8"),
  );
  const { version } = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.Struct({ version: Schema.String })),
  )(versionText);
  dependencies["@relkit/drizzle"] = version;
  dependencies["drizzle-orm"] = "1.0.0-rc.5-169397b";
  devDependencies["drizzle-kit"] = "1.0.0-rc.5-ab785fc";
  if (auth) {
    dependencies["@relkit/better-auth"] = version;
    dependencies["better-auth"] = "1.7.1";
  }
  yield* Effect.tryPromise({
    try: () =>
      writeFile(
        join(project.app, "package.json"),
        JSON.stringify({ ...manifest, dependencies, devDependencies }, null, 2) + "\n",
      ),
    catch: () =>
      new TutorialFailure({
        operation: "manifest.write",
        message: "Cannot update isolated tutorial manifest",
      }),
  });
});
