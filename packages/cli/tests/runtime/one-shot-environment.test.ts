/** Checks the one-shot environment: file order and precedence on Node, nothing applied under Bun. */
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import {
  oneShotEnvironment,
  oneShotEnvironmentFiles,
  type OneShotEnvironmentOptions,
} from "../../src/runtime/one-shot-environment.js";
import { fileSystemLayer } from "../../src/services/filesystem.service.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function project(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "relkit-one-shot-"));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) await writeFile(join(root, name), text);
  return root;
}

function resolveIn(root: string, options: OneShotEnvironmentOptions) {
  return Effect.runPromise(oneShotEnvironment(root, options).pipe(Effect.provide(fileSystemLayer)));
}

const files = {
  ".env": "A=env\nB=env\nC=env\nD=env\n",
  ".env.development": "B=mode\nC=mode\n",
  ".env.local": "C=local\nE=local\n",
  ".env.development.local": "D=mode-local\n",
  ".env.test": "T=test\n",
  ".env.example": "X=example\n",
};

test("on Node, later files win over earlier ones and process values win over all files", async () => {
  const root = await project(files);
  const environment = await resolveIn(root, {
    runtime: "node",
    inherited: { E: "process", UNSET: undefined },
  });
  expect(environment).toMatchObject({ A: "env", B: "mode", C: "local", D: "mode-local" });
  expect(environment.E).toBe("process");
  expect(environment.T).toBeUndefined();
  expect(environment.X).toBeUndefined();
  expect("UNSET" in environment && environment.UNSET !== undefined).toBe(false);
});

test("on Node in test mode, .env.local is skipped and .env.test applies", async () => {
  const root = await project(files);
  const environment = await resolveIn(root, { runtime: "node", inherited: { NODE_ENV: "test" } });
  expect(environment).toMatchObject({ A: "env", C: "env", T: "test", NODE_ENV: "test" });
  expect(environment.E).toBeUndefined();
});

test("under Bun the inherited environment is returned unchanged", async () => {
  const root = await project(files);
  const inherited = { ALREADY: "loaded-by-bun" };
  expect(await resolveIn(root, { runtime: "bun", inherited })).toEqual(inherited);
});

test("the file plan says which files exist and whether the runtime loads them", async () => {
  const root = await project({ ".env": "A=1\n" });
  const plan = (runtime: "bun" | "node") =>
    Effect.runPromise(
      oneShotEnvironmentFiles(root, { runtime, inherited: {} }).pipe(
        Effect.provide(fileSystemLayer),
      ),
    );
  const node = await plan("node");
  expect(node.loadedByRuntime).toBe(false);
  expect(node.files.map(({ name, exists }) => [name, exists])).toEqual([
    [".env", true],
    [".env.development", false],
    [".env.local", false],
    [".env.development.local", false],
  ]);
  expect(node.files[0]?.path).toBe(join(root, ".env"));
  expect((await plan("bun")).loadedByRuntime).toBe(true);
});

test("an oversized file fails with its name and without its values", async () => {
  const root = await project({ ".env": `BIG=${"x".repeat(1_048_577)}\n` });
  const failure = await Effect.runPromise(
    oneShotEnvironment(root, { runtime: "node", inherited: {} }).pipe(
      Effect.provide(fileSystemLayer),
      Effect.flip,
    ),
  );
  expect(failure.message).toBe(".env exceeds the 1 MiB limit.");
});
