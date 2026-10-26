/** Guards current layout discovery, flat-layout compatibility, and explicit environment authority. */
import { expect, it } from "@effect/vitest";
import { defineEnv } from "@relkit/config";
import { Effect } from "effect";
import { CliFileSystem } from "../../src/services/filesystem.service.js";
import { CliModules } from "../../src/services/modules.service.js";
import {
  CliEnvironmentProject,
  environmentProjectLive,
} from "../../src/commands/env-project.service.js";
import { testFiles } from "./test-files.js";

for (const scenario of [
  { name: "prefers the current platform contract", platform: true, path: "src/platform/env.ts" },
  { name: "retains the flat-layout fallback", platform: false, path: "src/env.ts" },
  {
    name: "honors an explicit contract",
    platform: true,
    path: "custom/env.ts",
    envPath: "custom/env.ts",
  },
]) {
  it.effect(scenario.name, () =>
    Effect.gen(function* () {
      const definition = defineEnv({});
      const probes: string[] = [];
      const imports: string[] = [];
      const loaded = yield* CliEnvironmentProject.use((project) =>
        project.load({
          projectRoot: "/fixture",
          ...("envPath" in scenario ? { envPath: scenario.envPath } : {}),
        }),
      ).pipe(
        Effect.provide(environmentProjectLive),
        Effect.provideService(
          CliFileSystem,
          testFiles({
            exists: (path) =>
              Effect.sync(() => {
                probes.push(path);
                return scenario.platform;
              }),
          }),
        ),
        Effect.provideService(CliModules, {
          load: (specifier) =>
            Effect.sync(() => {
              imports.push(specifier);
              return { default: definition };
            }),
          invalidate: () => Effect.void,
        }),
      );
      expect(loaded).toBe(definition);
      expect(imports).toEqual([`file:///fixture/${scenario.path}?relkit_env=1`]);
      expect(probes).toEqual("envPath" in scenario ? [] : ["/fixture/src/platform/env.ts"]);
    }),
  );
}

it.effect("an invalid platform module does not fall back to another contract", () =>
  Effect.gen(function* () {
    const imports: string[] = [];
    const result = yield* CliEnvironmentProject.use((project) =>
      project.load({ projectRoot: "/fixture" }),
    ).pipe(
      Effect.provide(environmentProjectLive),
      Effect.provideService(CliFileSystem, testFiles({ exists: () => Effect.succeed(true) })),
      Effect.provideService(CliModules, {
        load: (specifier) =>
          Effect.sync(() => {
            imports.push(specifier);
            return { default: {} };
          }),
        invalidate: () => Effect.void,
      }),
      Effect.exit,
    );
    expect(result._tag).toBe("Failure");
    expect(imports).toEqual(["file:///fixture/src/platform/env.ts?relkit_env=1"]);
  }),
);
