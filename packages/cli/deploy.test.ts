/** Verifies selected deployment planning, destructive confirmation and secret-safe reporting. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { runDeploy } from "./src/commands/deploy.js";
import { capture, fakes, fakeState } from "./deploy.fixture.js";

test("preview plans through Automation API without calling up and redacts config values", async () => {
  const root = await mkdtemp(join(process.cwd(), ".relkit-deploy-test-"));
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
  const root = await mkdtemp(join(process.cwd(), ".relkit-deploy-test-"));
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
  const root = await mkdtemp(join(process.cwd(), ".relkit-deploy-test-"));
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
