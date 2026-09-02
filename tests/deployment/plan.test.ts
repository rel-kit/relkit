import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
  DeploymentPlanError,
  diffDeploymentPlans,
  fromGraph,
  type DeploymentPlan,
} from "../../packages/deploy/src/index.ts";
import { renderPulumiProgram } from "../../packages/deploy-pulumi/src/program.ts";
import type { ApplicationGraph, GraphNode } from "../../packages/graph/src/index.ts";

const fixtureRoot = join(import.meta.dir, "..", "compiler", "fixtures");
const goldenRoot = join(import.meta.dir, "golden");
const fullOptions = {
  image: {
    name: "registry.example/orders",
    tag: "2026-08-18",
    digest: "sha256:orders-image",
    health: {
      livenessPath: "/_relkit/v1/health/live",
      readinessPath: "/_relkit/v1/health/ready",
      port: 8080,
      intervalMs: 10_000,
      timeoutMs: 2_000,
    },
  },
} as const;
const integrationImports = [
  {
    integrationId: "pulumi",
    role: "engine" as const,
    packageName: "@relkit/pulumi",
    packageVersion: "0.1.0",
    exportName: "./engine",
  },
  {
    integrationId: "aws",
    role: "host" as const,
    packageName: "@relkit/aws",
    packageVersion: "0.1.0",
    exportName: "./host",
  },
];

test("full deployment plan matches the stable golden contract", () => {
  const plan = fromGraph(loadGraph("valid-full"), fullOptions);

  expect(plan).toEqual(readGolden("plan-full.json", plan));
  expect(plan.application.environmentNames).toEqual(["SERVICE_PORT"]);
  expect(plan.http.health).toEqual(fullOptions.image.health);
  expect(resourceTags(plan).every((tags) => tags["managed-by"] === "relkit")).toBe(true);
});

test("minimal deployment plan omits optional capability resources", () => {
  const plan = fromGraph(loadGraph("valid-minimal"));

  expect(plan).toEqual(readGolden("plan-minimal.json", plan));
  expect(plan.jobs).toEqual([]);
  expect(plan.events).toEqual([]);
  expect(plan.buckets).toEqual([]);
  expect(plan.caches).toEqual([]);
  expect(plan.iam.serviceRole.statements).toEqual([]);
});

test("uses the configured application port for default deployment health", () => {
  const plan = fromGraph(loadGraph("valid-minimal"), { httpPort: 4321 });
  expect(plan.http.port).toBe(4321);
  expect(plan.application.image.health.port).toBe(4321);
});

test("rejects a missing provider binding for a used capability", () => {
  const graph = loadGraph("valid-full");
  const withoutCache = {
    ...graph,
    nodes: graph.nodes.filter((node) => node.kind !== "provider" || node.capability !== "cache"),
  } as ApplicationGraph;

  expectDeploymentError(
    () => fromGraph(withoutCache, fullOptions),
    "RELKIT_DEPLOY_PROFILE_UNSUPPORTED",
  );
});

test("keeps plans secret-free and rejects secret/live deployment values", () => {
  const graph = withSecretConfiguration(loadGraph("valid-full"));
  const plan = fromGraph(graph, fullOptions);
  const bytes = JSON.stringify(plan);

  expect(bytes).toContain("OPENAI_API_KEY");
  expect(bytes).not.toContain("synthetic-secret");
  expect(bytes).not.toContain("pulumiValue");
  expectDeploymentError(
    () => fromGraph(withRawField(loadGraph("valid-minimal"), "secretValue", "synthetic-secret")),
    "RELKIT_DEPLOY_SECRET_UNSUPPORTED",
  );
  expectDeploymentError(
    () => fromGraph(withRawField(loadGraph("valid-minimal"), "pulumi", {})),
    "RELKIT_DEPLOY_LIVE_OBJECT_UNSUPPORTED",
  );
});

test("classifies an identical plan as a no-op", () => {
  const before = fromGraph(loadGraph("valid-full"), fullOptions);
  const after = fromGraph(loadGraph("valid-full"), fullOptions);
  const diff = diffDeploymentPlans(before, after);

  expect(diff.changes).toEqual([]);
  expect(diff.summary).toEqual({
    create: 0,
    update: 0,
    delete: 0,
    replace: 0,
    securitySensitive: 0,
    destructive: 0,
    requiresConfirmation: false,
    confirmation: "none",
  });
  expect(diff.hasDestructiveChanges).toBe(false);
});

test("keeps deployment identities stable when descriptor source files move", () => {
  const before = fromGraph(loadGraph("valid-full"), fullOptions);
  const after = fromGraph(moveSources(loadGraph("valid-full")), fullOptions);
  const diff = diffDeploymentPlans(before, after);

  expect(resourceIdentity(before)).toEqual(resourceIdentity(after));
  expect(before.iam).toEqual(after.iam);
  expect(before.application.environmentNames).toEqual(after.application.environmentNames);
  expect(
    diff.changes.every(({ operation }) => operation !== "delete" && operation !== "replace"),
  ).toBe(true);
  expect(JSON.stringify(after)).not.toContain("src/moved/");
});

test("renders deterministic Pulumi program bytes from distinct roots", () => {
  const plan = fromGraph(loadGraph("valid-full"), fullOptions);
  const left = renderPulumiProgram(plan, {
    projectRoot: "/tmp/relkit-left",
    stackName: "CI/blue",
    integrationImports,
  });
  const right = renderPulumiProgram(plan, {
    projectRoot: "/tmp/relkit-right",
    stackName: "CI/blue",
    integrationImports,
  });
  const leftBytes = [left.pulumiYaml, left.indexTs, left.planJson].join("\0");
  const rightBytes = [right.pulumiYaml, right.indexTs, right.planJson].join("\0");

  expect(leftBytes).toBe(rightBytes);
  expect(leftBytes).not.toContain("/tmp/relkit-");
  expect(leftBytes).not.toContain("OPENAI_API_KEY");
  expect(leftBytes).not.toContain("pulumiValue");
});

function loadGraph(name: string): ApplicationGraph {
  const graph = JSON.parse(
    readFileSync(join(fixtureRoot, name, "expected.graph.json"), "utf8"),
  ) as ApplicationGraph;
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.kind === "app"
        ? {
            ...node,
            deploymentRoles: [
              { role: "engine", integrationId: "pulumi", protocolVersion: 1, configuration: {} },
              { role: "host", integrationId: "aws", protocolVersion: 1, configuration: {} },
            ],
          }
        : node,
    ),
  };
}

function readGolden(name: string, value?: unknown): unknown {
  const path = join(goldenRoot, name);
  if (process.env.UPDATE_GOLDEN === "1" && value !== undefined) {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function mapProvider(
  graph: ApplicationGraph,
  update: (provider: Extract<GraphNode, { kind: "provider" }>) => GraphNode,
): ApplicationGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.kind === "provider" ? update(node) : node)),
  };
}

function withSecretConfiguration(graph: ApplicationGraph): ApplicationGraph {
  const secret: GraphNode = {
    kind: "env",
    id: "OPENAI_API_KEY",
    name: "OPENAI_API_KEY",
    type: "secret",
    requiredIn: [],
    hasDefault: false,
    sensitive: true,
    source: { file: "src/env.ts", line: 1, column: 1 },
  };
  return mapProvider({ ...graph, nodes: [...graph.nodes, secret] }, (provider) =>
    provider.capability === "bucket"
      ? {
          ...provider,
          namedValues: [
            ...provider.namedValues,
            {
              field: "accessKeyId",
              name: "OPENAI_API_KEY",
              type: "secret-string",
              sensitive: true,
            },
          ],
        }
      : provider,
  );
}

function withRawField(graph: ApplicationGraph, key: string, value: unknown): ApplicationGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node, index) =>
      index === 0 ? ({ ...node, [key]: value } as unknown as GraphNode) : node,
    ),
  };
}

function moveSources(graph: ApplicationGraph): ApplicationGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      source: { ...node.source, file: `src/moved/${node.source.file.replace(/^src\//, "")}` },
    })),
  };
}

function resourceIdentity(plan: DeploymentPlan): unknown {
  const resources = [
    plan.application,
    plan.http,
    ...plan.jobs,
    ...plan.schedules,
    ...plan.events,
    ...plan.eventTriggers,
    ...plan.buckets,
    ...plan.caches,
  ];
  return resources.map((resource) => {
    const value = resource as unknown as Record<string, unknown>;
    const tags = value.tags as Record<string, string> | undefined;
    return {
      id: value.id ?? value.logicalName,
      logicalName: value.logicalName,
      tags: tags === undefined ? undefined : { app: tags.app, "managed-by": tags["managed-by"] },
    };
  });
}

function resourceTags(plan: DeploymentPlan): readonly Record<string, string>[] {
  return [
    ...plan.jobs,
    ...plan.schedules,
    ...plan.events,
    ...plan.eventTriggers,
    ...plan.buckets,
    ...plan.caches,
  ].map((resource) => resource.tags ?? {});
}

function expectDeploymentError(action: () => unknown, code: DeploymentPlanError["code"]): void {
  try {
    action();
    throw new Error(`Expected ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(DeploymentPlanError);
    expect((error as DeploymentPlanError).code).toBe(code);
  }
}
