/**
 * Exercises actual core HTTP dispatch while optional SDK module evaluation fails.
 * Selected initialization must reject before readiness; unselected peers never
 * execute. Every acquired generation is closed in finally blocks.
 */
import { expect, test, vi } from "vitest";
import { Effect, Exit, Layer } from "effect";
import { z } from "@relkit/schema";
import {
  DependencySource,
  SelectedDependenciesLayer,
} from "@relkit/provider/internal/dependencies";
import { createPreparedApp } from "../src/prepared-app.js";
import { SelectedHttpTransports } from "../src/selected-transports.service.js";
import { preparedOptions } from "./prepared-fixture.js";

vi.mock("@modelcontextprotocol/server", () => {
  throw new Error("MCP SDK initialization unavailable");
});
vi.mock("@ag-ui/core", () => {
  throw new Error("AG-UI SDK initialization unavailable");
});
vi.mock("@scalar/hono-api-reference", () => {
  throw new Error("Scalar SDK initialization unavailable");
});

test("rpc_without_optional_sdks", async () => {
  const options = preparedOptions();
  const application = await createPreparedApp({
    ...options,
    manifest: {
      ...options.manifest,
      functions: {
        hello: { input: z.object({}), output: z.object({ ok: z.boolean() }) },
      },
    },
  });
  try {
    const rest = await application.fetch(new Request("http://localhost/hello"));
    expect(await rest.json()).toEqual({ ok: true });
    const rpc = await application.fetch(
      new Request("http://localhost/rpc/hello.route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      }),
    );
    expect(rpc.status).toBe(200);
    expect(await rpc.json()).toEqual({ json: { ok: true } });
    expect((await application.fetch(new Request("http://localhost/rpc/missing"))).status).toBe(404);
    expect((await application.fetch(new Request("http://localhost/mcp"))).status).toBe(404);
    expect(
      (await application.fetch(new Request("http://localhost/_relkit/v1/api-reference"))).status,
    ).toBe(404);
    expect(
      (await application.fetch(new Request("http://localhost/_relkit/v1/openapi.json"))).status,
    ).toBe(200);
  } finally {
    await application.close();
  }
});

test("disabled_inspector_core_endpoints", async () => {
  let initialized = 0;
  const application = await createPreparedApp(
    {
      ...preparedOptions(),
      internalEndpoints: { enabled: false },
      clientIdentity: {
        applicationId: "optional",
        publicFingerprint: "sha256:public",
        resolve: () => ({ identityScope: "viewer", sessionEpoch: "one" }),
      },
    },
    async () => {
      initialized++;
    },
  );
  try {
    for (const path of ["health/live", "health/ready", "graph", "client/identity"]) {
      const response = await application.fetch(new Request(`http://localhost/_relkit/v1/${path}`));
      expect(response.status).toBe(200);
      await response.text();
    }
    const graph = await application.fetch(new Request("http://localhost/_relkit/v1/graph"));
    expect(await graph.json()).toMatchObject({ graphHash: "sha256:prepared-test" });
    expect(
      (await application.fetch(new Request("http://localhost/_relkit/v1/runtime"))).status,
    ).toBe(404);
    expect(initialized).toBe(0);
  } finally {
    await application.close();
  }
});

test("production_override_no_rich_api", async () => {
  let initialized = 0;
  const application = await createPreparedApp(
    {
      ...preparedOptions(),
      internalEndpoints: { mode: "production", enabled: true, bearerToken: "secret" },
    },
    async (app) => {
      initialized++;
      app.get("/_relkit/v1/runtime", (context) => context.text("rich"));
    },
  );
  try {
    const response = await application.fetch(
      new Request("http://localhost/_relkit/v1/runtime", {
        headers: { authorization: "Bearer secret" },
      }),
    );
    expect(response.status).toBe(404);
    expect(initialized).toBe(0);
    expect((await application.fetch(new Request("http://localhost/hello"))).status).toBe(200);
  } finally {
    await application.close();
  }
});

test("request_logged_once_and_inspection_remains_unrecorded", async () => {
  const events: string[] = [];
  const application = await createPreparedApp(
    {
      ...preparedOptions(),
      middleware: {
        onLifecycleEvent: (event) => {
          events.push(`${event.path}:${event.type}`);
        },
      },
    },
    async (app) => {
      app.get("/_relkit/v1/runtime/test", (context) => context.text("rich"));
    },
  );
  try {
    for (const path of ["/hello", "/rpc/missing"]) {
      const response = await application.fetch(new Request(`http://localhost${path}`));
      await response.text();
      expect(events.filter((event) => event === `${path}:request.started`)).toHaveLength(1);
      expect(events.filter((event) => event === `${path}:request.completed`)).toHaveLength(1);
    }
    await application.fetch(new Request("http://localhost/_relkit/v1/runtime/test"));
    expect(events.some((event) => event.startsWith("/_relkit/"))).toBe(false);
  } finally {
    await application.close();
  }
});

test.each([{ mcp: { enabled: true } }, { agUi: true }, { apiDocs: { ui: "scalar" as const } }])(
  "selected_sdk_init_failure rejects acquisition: %j",
  async (selected) => {
    await expect(createPreparedApp({ ...preparedOptions(), ...selected })).rejects.toMatchObject({
      operation: expect.stringMatching(/http\.(mcp|ag-ui|scalar)\.initialize/),
    });
  },
);

test("selected_version_failure_precedes_sdk_initialization", async () => {
  const source = Layer.succeed(
    DependencySource,
    DependencySource.of({
      manager: () => Effect.succeed("bun"),
      resolve: (name, from) => Effect.succeed({ name, root: from, version: "0.0.0" }),
      satisfies: () => false,
    }),
  );
  const result = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const service = yield* SelectedHttpTransports.make;
      return yield* service.prepare({ ...preparedOptions(), mcp: { enabled: true } });
    }).pipe(Effect.provide(SelectedDependenciesLayer.pipe(Layer.provide(source)))),
  );
  expect(Exit.isFailure(result)).toBe(true);
  if (Exit.isFailure(result)) {
    const reason = result.cause.reasons[0];
    expect(reason?._tag).toBe("Fail");
    if (reason?._tag === "Fail")
      expect(reason.error).toMatchObject({
        diagnostics: [
          {
            code: "RELKIT_DEPENDENCY_VERSION_UNSUPPORTED",
            package: "@modelcontextprotocol/server",
          },
        ],
      });
  }
});
