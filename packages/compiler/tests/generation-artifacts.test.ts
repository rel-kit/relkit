import { mkdirSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import {
  ArtifactIoError,
  artifactIo,
  writeIfChanged,
  writeIfChangedEffect,
} from "../src/generated-artifacts-write.js";
import {
  ArtifactValidationError,
  writeGeneratedArtifacts,
  writeGeneratedArtifactsEffect,
} from "../src/generated-artifacts.js";
import type { GeneratedOutputs } from "../src/normalize-types.js";

const outputs: GeneratedOutputs = {
  graph: "{}\n",
  manifest: "export const runtimeManifest = {};\n",
  runtimeActivation: "{}\n",
  runtimeIntegrations: "{}\n",
  runtimeIntegrationImports: "export const runtimeIntegrationModules = [];\n",
  localServices: "{}\n",
  diagnostics: "[]\n",
  openapi: "{}\n",
  client: "export const client = {};\n",
  contract: "export const contract = {};\n",
  clientContract: "{}\n",
  clientRegistry: "export {};\n",
  clientManifest: "{}\n",
};

/** Owns a fresh directory for each filesystem regression, including failure paths. */
const directory = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-generation-"))),
  (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
);

describe("generated artifact effects", () => {
  it.effect("keeps exact bytes and modification time when an artifact is unchanged", () =>
    Effect.gen(function* () {
      const root = yield* directory;
      const path = join(root, "artifact.json");
      const first = yield* writeIfChangedEffect(path, "é\n");
      const before = yield* Effect.promise(() => stat(path, { bigint: true }));
      const second = yield* writeIfChangedEffect(path, "é\n");
      const after = yield* Effect.promise(() => stat(path, { bigint: true }));
      expect(first).toMatchObject({ changed: true, bytes: 3 });
      expect(second.changed).toBe(false);
      expect(after.mtimeNs).toBe(before.mtimeNs);
      expect(yield* Effect.promise(() => readdir(root))).toEqual(["artifact.json"]);
    }),
  );

  it.effect("retains filesystem context while preserving the Promise rejection", () =>
    Effect.gen(function* () {
      const root = yield* directory;
      const typed = yield* writeIfChangedEffect(root, "content").pipe(Effect.flip);
      expect(typed).toBeInstanceOf(ArtifactIoError);
      expect(typed).toMatchObject({ operation: "read", path: root });
      expect(typed.cause).toMatchObject({ code: "EISDIR" });
      yield* Effect.promise(() =>
        expect(writeIfChanged(root, "content")).rejects.toMatchObject({ code: "EISDIR" }),
      );
    }),
  );

  it.effect("never deletes an unowned temporary file when exclusive creation fails", () =>
    Effect.gen(function* () {
      const root = yield* directory;
      const path = join(root, "artifact.json");
      const uuid = "00000000-0000-4000-8000-000000000001";
      const temporary = `${path}.${process.pid}.${uuid}.tmp`;
      yield* Effect.promise(() => writeFile(temporary, "owned elsewhere"));
      const spy = yield* Effect.acquireRelease(
        Effect.sync(() => vi.spyOn(crypto, "randomUUID").mockReturnValue(uuid)),
        (mock) => Effect.sync(() => mock.mockRestore()),
      );
      const failure = yield* writeIfChangedEffect(path, "new bytes").pipe(Effect.flip);
      expect(spy).toHaveBeenCalledOnce();
      expect(failure).toMatchObject({ operation: "open temporary", cause: { code: "EEXIST" } });
      expect(yield* Effect.promise(() => readFile(temporary, "utf8"))).toBe("owned elsewhere");
    }),
  );

  it.effect("releases its temporary file when atomic rename fails", () =>
    Effect.gen(function* () {
      const root = yield* directory;
      const path = join(root, "artifact.json");
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
            // Create the conflicting destination after the initial missing-file read.
            mkdirSync(path);
            return "00000000-0000-4000-8000-000000000002";
          }),
        ),
        (mock) => Effect.sync(() => mock.mockRestore()),
      );
      const failure = yield* writeIfChangedEffect(path, "new bytes").pipe(Effect.flip);
      expect(failure.operation).toBe("rename");
      expect(yield* Effect.promise(() => readdir(root))).toEqual(["artifact.json"]);
    }),
  );

  it.effect("aborts supported adapter work when its fiber is interrupted", () =>
    Effect.gen(function* () {
      let observed: AbortSignal | undefined;
      const fiber = yield* artifactIo("read", "pending", (signal) => {
        observed = signal;
        return new Promise<never>(() => {});
      }).pipe(Effect.forkChild({ startImmediately: true }));
      expect(observed?.aborted).toBe(false);
      yield* Fiber.interrupt(fiber);
      expect(observed?.aborted).toBe(true);
    }),
  );

  it.effect("returns filename-ordered batch results and leaves no temporary files", () =>
    Effect.gen(function* () {
      const root = yield* directory;
      const first = yield* writeGeneratedArtifactsEffect(outputs, { directory: root });
      const names = first.writes.map((result) => result.fileName);
      expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
      expect(first.changed).toBe(true);
      const second = yield* writeGeneratedArtifactsEffect(outputs, { directory: root });
      expect(second.changed).toBe(false);
      expect((yield* Effect.promise(() => readdir(root))).sort()).toEqual([...names].sort());
    }),
  );

  it.effect("rejects invalid extension metadata before any artifact is written", () =>
    Effect.gen(function* () {
      const root = yield* directory;
      const options = {
        directory: root,
        extensions: [{ kind: "client" as const, version: 2, content: "bad" }],
      };
      const failure = yield* writeGeneratedArtifactsEffect(outputs, options).pipe(Effect.flip);
      expect(failure).toBeInstanceOf(ArtifactValidationError);
      expect(failure.cause).toBeInstanceOf(TypeError);
      yield* Effect.promise(() =>
        expect(writeGeneratedArtifacts(outputs, options)).rejects.toThrow("unsupported"),
      );
      expect(yield* Effect.promise(() => readdir(root))).toEqual([]);
    }),
  );

  it.effect("rejects duplicate extensions and non-text content before publication", () =>
    Effect.gen(function* () {
      const root = yield* directory;
      const valid = { kind: "client" as const, version: 1, content: "export {};" };
      for (const extensions of [[valid, valid], [{ ...valid, content: 42 as unknown as string }]]) {
        const options = { directory: root, extensions };
        const failure = yield* writeGeneratedArtifactsEffect(outputs, options).pipe(Effect.flip);
        expect(failure).toBeInstanceOf(ArtifactValidationError);
        yield* Effect.promise(() =>
          expect(writeGeneratedArtifacts(outputs, options)).rejects.toBeInstanceOf(TypeError),
        );
        expect(yield* Effect.promise(() => readdir(root))).toEqual([]);
      }
    }),
  );

  it.effect("omits absent empty optional outputs and clears existing optional bytes", () =>
    Effect.gen(function* () {
      const root = yield* directory;
      const empty = { ...outputs, openapi: "", client: "" };
      const initial = yield* writeGeneratedArtifactsEffect(empty, { directory: root });
      expect(
        initial.writes.some(
          ({ fileName }) => fileName === "openapi.json" || fileName === "client.ts",
        ),
      ).toBe(false);
      yield* Effect.promise(() => writeFile(join(root, "openapi.json"), "previous bytes"));
      const cleared = yield* writeGeneratedArtifactsEffect(empty, { directory: root });
      expect(cleared.writes.find(({ fileName }) => fileName === "openapi.json")).toMatchObject({
        changed: true,
        bytes: 0,
      });
      expect(yield* Effect.promise(() => readFile(join(root, "openapi.json"), "utf8"))).toBe("");
    }),
  );
});
