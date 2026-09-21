import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  localJobServiceGenerations,
  localServiceGenerations,
  localServiceRuntimeOptions,
  prepareLocalWorkerOverrides,
} from "./src/commands/local-service-options.ts";

test("keeps the initial Inngest endpoint on the host until workers are active", () => {
  const services = [
    {
      bindingId: "provider.job.default",
      capability: "job",
      profile: "default",
      materializerId: "docker",
      recipe: { integrationId: "inngest", recipeId: "inngest-docker", recipeVersion: 2 },
      configuration: {},
      requiredBy: ["jobs.default"],
    },
  ] as const;

  expect(localServiceRuntimeOptions(services, 3210).environmentOverridesByUnit).toEqual({});
  expect(localServiceRuntimeOptions(services, 3210, true).environmentOverridesByUnit).toEqual({
    "provider.job.default": {
      inngest: { INNGEST_SDK_URL: "http://worker:3000/api/inngest" },
    },
  });
});

test("uses stable compiled job generations for local bindings", () => {
  const generations = localJobServiceGenerations({
    nodes: [
      { kind: "job", profile: "default", serviceGeneration: "sha256:stable" },
      { kind: "route", profile: "default", serviceGeneration: "sha256:ignored" },
    ],
  });
  expect(
    localServiceGenerations(
      [
        {
          bindingId: "provider.job.default",
          capability: "job",
          profile: "default",
          materializerId: "docker",
          recipe: { integrationId: "inngest", recipeId: "inngest-docker", recipeVersion: 2 },
          configuration: {},
          requiredBy: [],
        },
      ],
      generations,
    ),
  ).toEqual({ "provider.job.default": "sha256:stable" });
});

test("rewrites only loopback provider endpoints for worker containers", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-worker-overrides-"));
  try {
    const source = join(root, "provider-overrides.json");
    await writeFile(
      source,
      JSON.stringify({
        version: 1,
        applicationId: "commerce",
        localProjectId: `sha256:${"a".repeat(64)}`,
        planHash: `sha256:${"b".repeat(64)}`,
        generationId: "generation.test",
        bindings: [
          {
            bindingId: "provider.cache.default",
            values: {
              url: "redis://127.0.0.1:6379",
              endpoint: "http://localhost:9000/minio",
              nested: ["http://[::1]:3210", "https://example.com/api"],
            },
          },
        ],
      }),
    );

    const target = await prepareLocalWorkerOverrides(source);
    const state = JSON.parse(await readFile(target, "utf8")) as {
      bindings: [{ values: Record<string, unknown> }];
    };
    expect(state.bindings[0].values).toEqual({
      url: "redis://host.docker.internal:6379",
      endpoint: "http://host.docker.internal:9000/minio",
      nested: ["http://host.docker.internal:3210", "https://example.com/api"],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
