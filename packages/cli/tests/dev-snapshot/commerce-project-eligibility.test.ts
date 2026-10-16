/** Tooling is fingerprinted but cannot be imported into the audited backend closure. */
import { expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SnapshotFiles } from "../../src/dev-snapshot/snapshot-files.service.js";
import { captureSnapshotInputs } from "../../src/dev-snapshot/snapshot-fingerprint.js";
import { verifySnapshotProjectEligibility } from "../../src/dev-snapshot/snapshot-preparation-guards.js";

it.effect(
  "audits every backend source including test-named helpers, retaining tooling identity",
  () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-commerce-guard-")));
      try {
        yield* Effect.promise(async () => {
          await mkdir(join(root, "src"));
          await mkdir(join(root, "scripts"));
          await writeFile(
            join(root, "tsconfig.json"),
            JSON.stringify({
              compilerOptions: { baseUrl: ".", paths: { "@app/*": ["src/*"] } },
              files: [".relkit/generated/route-module-checks.ts"],
              include: ["src/**/*.ts", "tests/**/*.ts", "relkit.config.ts"],
              exclude: ["node_modules", ".relkit"],
            }),
          );
          await writeFile(
            join(root, "scripts/seed.ts"),
            'throw new Error("tooling must never execute");',
          );
          await writeFile(join(root, "src/data.test.ts"), 'export const value = "static";');
          await writeFile(
            join(root, "src/service.ts"),
            'import {value} from "./data.test.js"; export default value;',
          );
        });
        const files = yield* SnapshotFiles.make;
        const capture = () =>
          captureSnapshotInputs(root).pipe(Effect.provideService(SnapshotFiles, files));
        const inputs = yield* capture();
        expect(inputs.some((member) => member.path === "scripts/seed.ts")).toBe(true);
        yield* verifySnapshotProjectEligibility(files, root, inputs);
        const configPath = join(root, "tsconfig.json");
        const originalConfig = yield* Effect.promise(() => readFile(configPath, "utf8"));
        const aliased = JSON.parse(originalConfig);
        aliased.compilerOptions.paths["@relkit/drizzle"] = ["src/replacement.ts"];
        yield* Effect.promise(() => writeFile(configPath, JSON.stringify(aliased)));
        expect(
          Exit.isFailure(
            yield* Effect.exit(verifySnapshotProjectEligibility(files, root, yield* capture())),
          ),
        ).toBe(true);
        yield* Effect.promise(() => writeFile(configPath, originalConfig));
        for (const [path, content] of [
          ["langchain.ts", "export function tool() { return process.env.SECRET; }"],
          ["LangChain.ts", "export function tool() { return process.env.SECRET; }"],
          [
            "RELKIT.CONFIG.TS",
            'import {defineApp} from "@relkit/app/config"; export default defineApp({id:process.env.SECRET});',
          ],
          [
            "PACKAGE.JSON",
            JSON.stringify({ name: "@relkit/drizzle", exports: "./src/service.ts" }),
          ],
          ["BUNFIG.TOML", 'preload = ["./scripts/seed.ts"]'],
          ["src/ambient.TS", "export const value = process.env.SECRET;"],
          ["src/Node_Modules/private.ts", "export function read() { return process.env.SECRET; }"],
          [
            "package.json",
            JSON.stringify({ name: "@relkit/drizzle", exports: "./src/service.ts" }),
          ],
          ["bunfig.toml", 'preload = ["./scripts/seed.ts"]'],
        ] as const) {
          yield* Effect.promise(async () => {
            await mkdir(dirname(join(root, path)), { recursive: true });
            await writeFile(join(root, path), content);
          });
          expect(
            Exit.isFailure(
              yield* Effect.exit(verifySnapshotProjectEligibility(files, root, yield* capture())),
            ),
          ).toBe(true);
          yield* Effect.promise(() => rm(join(root, path)));
        }
        yield* Effect.promise(() =>
          writeFile(join(root, "src/data.test.ts"), "export const value = process.env.SECRET;"),
        );
        expect(
          Exit.isFailure(
            yield* Effect.exit(verifySnapshotProjectEligibility(files, root, yield* capture())),
          ),
        ).toBe(true);
        yield* Effect.promise(() =>
          writeFile(join(root, "src/data.test.ts"), 'export * from "../scripts/seed.js";'),
        );
        expect(
          Exit.isFailure(
            yield* Effect.exit(verifySnapshotProjectEligibility(files, root, yield* capture())),
          ),
        ).toBe(true);
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      }
    }),
);
