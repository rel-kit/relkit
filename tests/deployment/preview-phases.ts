/** Preserves ordered init, preview, decline, update and repeat assertions for the isolated Pulumi fixture. */
import { expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { runDeploy } from "../../packages/cli/src/commands/deploy.ts";
import { capture, options, assertPreview } from "./preview.fixture.ts";
import type { PreviewState } from "./preview-command.ts";
/** Initializes the existing local backend stack before preview.
 * @param root - Owned temporary project. @param stack - Original isolated stack name. @param state - Shared command observations. @returns After the unchanged phase assertions pass.
 */
export async function initializePreview(
  root: string,
  stack: string,
  state: PreviewState,
): Promise<void> {
  const init = capture();
  const initialized = await runDeploy(
    ["init", "--project-root", root, "--stack", stack, "--backend", "local"],
    init.context,
    options(root, state),
  );
  expect(initialized, JSON.stringify(init.outputs)).toBe(0);
}

/** Checks first preview counters, report bytes and secret redaction.
 * @param root - Owned temporary project. @param stack - Original isolated stack name. @param state - Shared command observations. @returns After the unchanged phase assertions pass.
 */
export async function firstPreview(
  root: string,
  stack: string,
  state: PreviewState,
): Promise<void> {
  const first = capture();
  const cloudBeforePreview = state.cloudMutations;
  const previewCode = await runDeploy(
    ["preview", "--project-root", root, "--stack", stack, "--backend", "local"],
    first.context,
    options(root, state),
  );
  expect(previewCode, JSON.stringify(first.outputs)).toBe(0);
  expect(state.backendKinds).toEqual(["local", "local"]);
  expect(state.previewCalls).toBe(1);
  expect(state.updateCalls).toBe(0);
  expect(state.cloudMutations).toBe(cloudBeforePreview);
  assertPreview(first.outputs.at(-1), 3, state.secret);
  const firstOutput = first.outputs.at(-1) as { reportPath: string; stack: string };
  expect(firstOutput.stack).toBe(stack);
  const reportBytes = await readFile(firstOutput.reportPath, "utf8");
  expect(reportBytes).toContain('"create":3');
  expect(reportBytes).not.toContain(state.secret);
  expect(JSON.stringify(first.logs)).not.toContain(state.secret);
}

/** Declines destructive changes after exactly one original confirmation callback.
 * @param root - Owned temporary project. @param stack - Original isolated stack name. @param state - Shared command observations. @returns After the unchanged phase assertions pass.
 */
export async function declinePreview(
  root: string,
  stack: string,
  state: PreviewState,
): Promise<void> {
  state.nextPreview = { delete: 1 };
  let confirmations = 0;
  const declined = capture();
  expect(
    await runDeploy(
      ["up", "--project-root", root, "--stack", stack, "--backend", "local"],
      declined.context,
      {
        ...options(root, state),
        confirm: async () => {
          confirmations += 1;
          return false;
        },
      },
    ),
  ).toBe(1);
  expect(confirmations).toBe(1);
  expect(state.updateCalls).toBe(0);
  expect((declined.outputs.at(-1) as { status?: string }).status).toBe("declined");
}

/** Applies the existing noninteractive update without cloud mutation.
 * @param root - Owned temporary project. @param stack - Original isolated stack name. @param state - Shared command observations. @returns After the unchanged phase assertions pass.
 */
export async function applyPreview(
  root: string,
  stack: string,
  state: PreviewState,
): Promise<void> {
  expect(
    await runDeploy(
      ["up", "--project-root", root, "--stack", stack, "--backend", "local", "--non-interactive"],
      capture().context,
      options(root, state),
    ),
  ).toBe(0);
  expect(state.updateCalls).toBe(1);
  expect(state.cloudMutations).toBe(0);
}

/** Checks the repeated preview remains a no-op with the original counters.
 * @param root - Owned temporary project. @param stack - Original isolated stack name. @param state - Shared command observations. @returns After the unchanged phase assertions pass.
 */
export async function repeatPreview(
  root: string,
  stack: string,
  state: PreviewState,
): Promise<void> {
  const second = capture();
  expect(
    await runDeploy(
      ["preview", "--project-root", root, "--stack", stack, "--backend", "local"],
      second.context,
      options(root, state),
    ),
  ).toBe(0);
  expect(state.previewCalls).toBe(4);
  assertPreview(second.outputs.at(-1), 0, state.secret, 3);
}
