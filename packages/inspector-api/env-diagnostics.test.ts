import { expect, test } from "bun:test";
import { API_BASE_PATH } from "@zsys/contracts";
import { Hono } from "hono";
import { installInspectorEndpoints } from "./src/index.ts";

const activeGraph = {
  contractVersion: 3,
  nodes: [
    {
      kind: "env",
      id: "DATABASE_URL",
      name: "DATABASE_URL",
      type: "secret-string",
      requiredIn: ["production"],
      hasDefault: false,
      optional: false,
      sensitive: true,
      source: { file: "src/env.ts", line: 4, column: 3 },
      value: "raw-secret",
    },
  ],
  edges: [],
};

test("projects active environment metadata and candidate diagnostics without values", async () => {
  const app = new Hono();
  installInspectorEndpoints(app, {
    activeGeneration: {
      generationId: "active-1",
      graphHash: "sha256:active",
      graph: activeGraph,
      diagnostics: [{ code: "ZSYS_ACTIVE", severity: "warning", message: "active warning" }],
      candidate: {
        generationId: "candidate-2",
        graphHash: "sha256:candidate",
        sourceVersion: 2,
        state: "compiling-candidate",
        diagnostics: [
          {
            code: "ZSYS_CANDIDATE",
            severity: "error",
            message: "secret=hidden",
            file: "src/routes.ts",
            line: 8,
            column: 2,
          },
        ],
      },
    },
  });

  const env = await app.request(`${API_BASE_PATH}/env`);
  const envBody = (await env.json()) as Record<string, any>;
  expect(env.status).toBe(200);
  expect(envBody).toMatchObject({
    generationId: "active-1",
    graphHash: "sha256:active",
    items: [
      {
        name: "DATABASE_URL",
        type: "secret-string",
        requiredIn: ["production"],
        hasDefault: false,
        sensitive: true,
        source: { file: "src/env.ts", line: 4, column: 3 },
      },
    ],
  });
  expect(JSON.stringify(envBody)).not.toContain("raw-secret");

  const diagnostics = await app.request(`${API_BASE_PATH}/diagnostics`);
  const diagnosticsBody = (await diagnostics.json()) as Record<string, any>;
  expect(diagnosticsBody).toMatchObject({
    status: "candidate",
    generationId: "active-1",
    active: { generationId: "active-1", graphHash: "sha256:active" },
    candidate: {
      generationId: "candidate-2",
      graphHash: "sha256:candidate",
      sourceVersion: 2,
      state: "compiling-candidate",
      items: [
        {
          code: "ZSYS_CANDIDATE",
          file: "src/routes.ts",
          line: 8,
          column: 2,
        },
      ],
    },
  });
  expect(JSON.stringify(diagnosticsBody)).not.toContain("hidden");
});

test("drops absolute and executable-looking source paths at the API boundary", async () => {
  const app = new Hono();
  installInspectorEndpoints(app, {
    activeGeneration: {
      generationId: "active-1",
      graphHash: "sha256:active",
      graph: {
        contractVersion: 3,
        nodes: [
          {
            kind: "env",
            id: "DATABASE_URL",
            source: { file: "/srv/app/src/env.ts", line: 4, column: 3 },
          },
          {
            kind: "function",
            id: "orders.create",
            source: { file: "vscode://file/src/orders.ts", line: 4, column: 3 },
          },
        ],
        edges: [],
      },
      diagnostics: [
        {
          code: "ZSYS_SOURCE",
          severity: "warning",
          message: "safe",
          file: "/srv/app/src/routes.ts",
          line: 8,
          column: 2,
        },
      ],
    },
  });

  const [env, graph, diagnostics] = await Promise.all([
    app.request(`${API_BASE_PATH}/env`),
    app.request(`${API_BASE_PATH}/graph`),
    app.request(`${API_BASE_PATH}/diagnostics`),
  ]);
  const body = JSON.stringify(await Promise.all([env.json(), graph.json(), diagnostics.json()]));
  expect(body).not.toContain("/srv/app");
  expect(body).not.toContain("vscode://");
});
