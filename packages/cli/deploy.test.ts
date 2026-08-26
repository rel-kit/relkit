import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { DeploymentPlan } from "@zsys/deploy";
import { hashGraph, type ApplicationGraph } from "@zsys/graph";
import { runDeploy } from "./src/commands/deploy.js";

const graph = JSON.parse(
  await readFile(
    join(process.cwd(), "tests/compiler/fixtures/valid-minimal/expected.graph.json"),
    "utf8",
  ),
) as ApplicationGraph;
const graphHash = hashGraph(graph);

test("preview plans through Automation API without calling up and redacts config values", async () => {
  const root = await mkdtemp(join(process.cwd(), ".zsys-deploy-test-"));
  try {
    const state = fakeState({ create: 1 });
    const captured = capture();
    const exitCode = await runDeploy(
      [
        "preview",
        "--project-root",
        root,
        "--stack",
        "ci-preview",
        "--backend",
        "local",
        "--config",
        "aws:region=us-east-1",
        "--config-secret",
        "api-key=deploy-synthetic-secret",
      ],
      captured.context,
      fakes(root, state),
    );
    expect(exitCode).toBe(0);
    expect(state.calls).toEqual(["preview"]);
    expect(state.workspaceOptions).toMatchObject({
      stackName: "ci-preview",
      backend: { kind: "local" },
      config: {
        "aws:region": { value: "us-east-1" },
        "api-key": { secret: true },
      },
    });
    expect(state.plan?.http.port).toBe(4321);
    expect(JSON.stringify(captured.outputs)).not.toContain("deploy-synthetic-secret");
    expect(JSON.stringify(captured.outputs[0])).toContain("preview.report.json");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("up declines destructive changes before mutation", async () => {
  const root = await mkdtemp(join(process.cwd(), ".zsys-deploy-test-"));
  try {
    const state = fakeState({ delete: 1 });
    const captured = capture();
    const exitCode = await runDeploy(
      ["up", "--project-root", root, "--stack", "ci-up"],
      captured.context,
      { ...fakes(root, state), confirm: async () => false },
    );
    expect(exitCode).toBe(1);
    expect(state.calls).toEqual(["preview"]);
    expect(captured.outputs[0]).toMatchObject({ ok: false, status: "declined" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("destroy uses explicit non-interactive confirmation and outputs stay secret-safe", async () => {
  const root = await mkdtemp(join(process.cwd(), ".zsys-deploy-test-"));
  try {
    const state = fakeState({ delete: 1 });
    const destroyed = capture();
    expect(
      await runDeploy(
        ["destroy", "--project-root", root, "--stack", "ci-destroy", "--non-interactive"],
        destroyed.context,
        fakes(root, state),
      ),
    ).toBe(0);
    expect(state.calls).toEqual(["previewDestroy", "destroy"]);

    const outputs = capture();
    const outputState = fakeState({});
    outputState.stack.outputs = async () => ({
      endpoint: { value: "https://example.invalid", secret: false },
      token: { value: "output-synthetic-secret", secret: true },
    });
    expect(
      await runDeploy(
        ["outputs", "--project-root", root, "--stack", "ci-destroy"],
        outputs.context,
        fakes(root, outputState),
      ),
    ).toBe(0);
    expect(JSON.stringify(outputs.outputs)).not.toContain("output-synthetic-secret");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function fakes(root: string, state: ReturnType<typeof fakeState>) {
  return {
    check: async () => ({
      ok: true,
      activatable: true,
      projectRoot: root,
      generatedDirectory: join(root, ".zsys", "generated"),
      graphHash,
      diagnostics: [],
      outputs: {
        graph: JSON.stringify(graph),
        manifest: "manifest",
        diagnostics: "[]",
        openapi: "",
        client: "",
      },
      config: {
        projectRoot: root,
        source: ["src/**/*.ts"],
        exclude: [],
        generatedDirectory: ".zsys/generated",
        server: {
          port: 4321,
          maxBodyBytes: 1_048_576,
          apiDocs: { enabledInProduction: false },
        },
        inspector: { port: 3210 },
      },
    }),
    build: async () => ({
      ok: true,
      projectRoot: root,
      buildDirectory: join(root, ".zsys", "build"),
      diagnostics: [],
      artifacts: [],
      graphHash,
    }),
    writeProgram: async (plan: DeploymentPlan) => {
      state.plan = plan;
      return {
        directory: join(root, ".zsys", "generated", "pulumi"),
        projectName: "minimal-app",
        stackName: "development",
        pulumiYaml: "",
        indexTs: "",
        planJson: "{}\n",
      };
    },
    createWorkspace: async (workspaceOptions: unknown) => {
      state.workspaceOptions = workspaceOptions;
      return {
        workspace: {},
        stack: state.stack,
        projectName: "minimal-app",
        stackName: "development",
        workDir: root,
        backend: { kind: "local", url: "file:///tmp/pulumi" },
      } as never;
    },
  };
}

function fakeState(changeSummary: Record<string, number>) {
  const calls: string[] = [];
  const stack = {
    preview: async () => {
      calls.push("preview");
      return { stdout: "", stderr: "", changeSummary };
    },
    up: async () => {
      calls.push("up");
      return { stdout: "", stderr: "", outputs: {}, summary: { resourceChanges: changeSummary } };
    },
    previewDestroy: async () => {
      calls.push("previewDestroy");
      return { stdout: "", stderr: "", changeSummary };
    },
    destroy: async () => {
      calls.push("destroy");
      return { stdout: "", stderr: "", summary: { resourceChanges: changeSummary } };
    },
    refresh: async () => {
      calls.push("refresh");
      return { stdout: "", stderr: "", summary: { resourceChanges: changeSummary } };
    },
    outputs: async () => ({}),
  };
  return {
    calls,
    stack,
    workspaceOptions: undefined as unknown,
    plan: undefined as DeploymentPlan | undefined,
  };
}

function capture() {
  const outputs: unknown[] = [];
  return {
    outputs,
    context: {
      json: true,
      reporter: {
        output: (value: unknown) => outputs.push(value),
        error: (code: string, message: string) =>
          outputs.push({ ok: false, error: { code, message } }),
      },
    },
  };
}
